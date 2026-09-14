import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  MODULE_FIXED_ROLES_KEY,
  MODULE_KEY,
  MODULE_ROLE_CEILING_KEY,
} from '../decorators/module-roles.decorator';
import { PermissionsService } from '../services/permissions.service';

describe('RolesGuard', () => {
  const HANDLER = { name: 'handler' };
  const CLASS = { name: 'class' };
  const reflector = {
    getAllAndOverride: jest.fn(),
    get: jest.fn(),
  };
  const permissions = {
    getAllowedRoles: jest.fn(),
  };
  const context = {
    getHandler: jest.fn(() => HANDLER),
    getClass: jest.fn(() => CLASS),
    switchToHttp: jest.fn(),
  } as unknown as ExecutionContext;
  let guard: RolesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    (context.getHandler as jest.Mock).mockReturnValue(HANDLER);
    (context.getClass as jest.Mock).mockReturnValue(CLASS);
    guard = new RolesGuard(reflector as unknown as Reflector, permissions as unknown as PermissionsService);
  });

  function withUser(user?: { role: Role }) {
    (context.switchToHttp as jest.Mock).mockReturnValue({
      getRequest: () => ({ user, query: {}, body: {}, params: {} }),
    });
  }

  /** metadata[key] = { handler: value, class: value } -- undefined means "not set at that level". */
  function mockMetadata(metadata: Record<string, { handler?: unknown; class?: unknown }>) {
    reflector.get.mockImplementation((key: string, target: unknown) => {
      const entry = metadata[key];
      if (!entry) return undefined;
      return target === HANDLER ? entry.handler : entry.class;
    });
  }

  it('allows public routes', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows an authenticated user with a required role (class-level, static)', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false);
    mockMetadata({ [ROLES_KEY]: { class: [Role.ADMIN] } });
    withUser({ role: Role.ADMIN });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('always allows Super Admin even when endpoint metadata omits ADMIN', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false);
    mockMetadata({ [ROLES_KEY]: { class: [Role.TENANT] } });
    withUser({ role: Role.ADMIN });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('denies a user without a required role', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false);
    mockMetadata({ [ROLES_KEY]: { class: [Role.ADMIN] } });
    withUser({ role: Role.TENANT });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('denies requests with role metadata but no authenticated user', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false);
    mockMetadata({ [ROLES_KEY]: { class: [Role.ADMIN] } });
    withUser();

    await expect(guard.canActivate(context)).rejects.toThrow('Access denied');
  });

  it('allows routes with no @Roles metadata at all (existing fail-open default)', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false);
    mockMetadata({});
    withUser({ role: Role.TENANT });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  describe('dynamic module override (@ModuleRoles)', () => {
    it('uses the DB-configured roles for the class module key when present', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: { class: [Role.ADMIN, Role.LEASING_MANAGER] }, // static fallback baked at decoration time
        [MODULE_KEY]: { class: 'crm' },
      });
      permissions.getAllowedRoles.mockResolvedValue(new Set([Role.FINANCE])); // admin widened it to FINANCE
      withUser({ role: Role.FINANCE });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(permissions.getAllowedRoles).toHaveBeenCalledWith('crm', undefined);
    });

    it('rejects a role the DB config no longer allows, even if the static fallback would have allowed it', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: { class: [Role.ADMIN, Role.LEASING_MANAGER] },
        [MODULE_KEY]: { class: 'crm' },
      });
      permissions.getAllowedRoles.mockResolvedValue(new Set([Role.ADMIN])); // LEASING_MANAGER revoked via admin UI
      withUser({ role: Role.LEASING_MANAGER });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('falls back to the static roles when the module has never been configured in the DB', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: { class: [Role.LEASING_MANAGER] },
        [MODULE_KEY]: { class: 'crm' },
      });
      permissions.getAllowedRoles.mockResolvedValue(null); // no row for this module at any tier
      withUser({ role: Role.LEASING_MANAGER });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('passes mallId extracted from the request query to the lookup', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: { class: [Role.ADMIN] },
        [MODULE_KEY]: { class: 'tickets' },
      });
      permissions.getAllowedRoles.mockResolvedValue(new Set([Role.FINANCE]));
      (context.switchToHttp as jest.Mock).mockReturnValue({
        getRequest: () => ({ user: { role: Role.FINANCE }, query: { mallId: 'mall-1' }, body: {}, params: {} }),
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(permissions.getAllowedRoles).toHaveBeenCalledWith('tickets', 'mall-1');
    });

    it('uses the authenticated active Mall for Fitout endpoints with no resource Mall', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: { class: [Role.OPERATION] },
        [MODULE_KEY]: { class: 'fitout' },
      });
      permissions.getAllowedRoles.mockResolvedValue(new Set([Role.OPERATION]));
      (context.switchToHttp as jest.Mock).mockReturnValue({
        getRequest: () => ({
          user: { role: Role.OPERATION, activeMallId: 'mall-active' },
          query: {}, body: {}, params: {},
        }),
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(permissions.getAllowedRoles).toHaveBeenCalledWith('fitout', 'mall-active');
    });

    it('uses the authoritative Mall resolved by MallAccessGuard for a Fitout resource', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: { handler: [Role.OPERATION] },
        [MODULE_KEY]: { handler: 'fitout', class: 'fitout' },
      });
      permissions.getAllowedRoles.mockResolvedValue(new Set([Role.OPERATION]));
      (context.switchToHttp as jest.Mock).mockReturnValue({
        getRequest: () => ({
          user: { role: Role.OPERATION },
          authorizationMallId: 'mall-from-project',
          query: {}, body: {}, params: { id: 'project-1' },
        }),
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(permissions.getAllowedRoles).toHaveBeenCalledWith('fitout', 'mall-from-project');
    });

    it('keeps an explicit Tenant Fitout capability outside the staff matrix', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: { handler: [Role.OPERATION, Role.TENANT] },
        [MODULE_KEY]: { handler: 'fitout', class: 'fitout' },
        [MODULE_FIXED_ROLES_KEY]: { handler: [Role.TENANT] },
      });
      withUser({ role: Role.TENANT });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(permissions.getAllowedRoles).not.toHaveBeenCalled();
    });

    it('revokes Fitout access on a handler that explicitly composes with the module matrix', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: { handler: [Role.OPERATION, Role.TENANT] },
        [MODULE_KEY]: { handler: 'fitout', class: 'fitout' },
        [MODULE_FIXED_ROLES_KEY]: { handler: [Role.TENANT] },
      });
      permissions.getAllowedRoles.mockResolvedValue(new Set([Role.MALL_DIRECTOR]));
      withUser({ role: Role.OPERATION });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('PERM-FITOUT-EMPTY-001 denies an empty configured Fitout role set without static fallback', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: { handler: [Role.OPERATION, Role.TENANT] },
        [MODULE_KEY]: { handler: 'fitout', class: 'fitout' },
        [MODULE_FIXED_ROLES_KEY]: { handler: [Role.TENANT] },
      });
      permissions.getAllowedRoles.mockResolvedValue(new Set());
      withUser({ role: Role.OPERATION });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(permissions.getAllowedRoles).toHaveBeenCalledWith('fitout', undefined);
    });

    it('PERM-FITOUT-NOCONFIG-002 uses the documented static Fitout fallback only for null', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: { handler: [Role.OPERATION, Role.TENANT] },
        [MODULE_KEY]: { handler: 'fitout', class: 'fitout' },
        [MODULE_FIXED_ROLES_KEY]: { handler: [Role.TENANT] },
      });
      permissions.getAllowedRoles.mockResolvedValue(null);
      withUser({ role: Role.OPERATION });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('does not let the module matrix widen a restricted Fitout mutation', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: { handler: [Role.MALL_DIRECTOR, Role.OPERATION] },
        [MODULE_KEY]: { handler: 'fitout', class: 'fitout' },
        [MODULE_ROLE_CEILING_KEY]: { handler: [Role.MALL_DIRECTOR, Role.OPERATION] },
      });
      permissions.getAllowedRoles.mockResolvedValue(new Set([Role.FINANCE]));
      withUser({ role: Role.FINANCE });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(permissions.getAllowedRoles).not.toHaveBeenCalled();
    });

    it('does NOT apply the class module override to a handler with its own plain @Roles(...) extension', async () => {
      // Mirrors contracts.controller.ts: class carries @ModuleRoles('contracts'),
      // but one handler has @Roles(...MODULE_ROLES.contracts, Role.TENANT) --
      // that handler's own static roles must win untouched, regardless of what
      // admin configured dynamically for 'contracts'.
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      mockMetadata({
        [ROLES_KEY]: {
          class: [Role.ADMIN, Role.LEASING_MANAGER],
          handler: [Role.ADMIN, Role.LEASING_MANAGER, Role.TENANT],
        },
        [MODULE_KEY]: { class: 'contracts' }, // no MODULE_KEY set on the handler itself
      });
      withUser({ role: Role.TENANT });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(permissions.getAllowedRoles).not.toHaveBeenCalled();
    });
  });
});
