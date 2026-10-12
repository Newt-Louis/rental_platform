import { Role } from '@prisma/client';
import { PermissionsService } from './permissions.service';

describe('PermissionsService configured-empty semantics', () => {
  it('PERM-FITOUT-EMPTY-001 distinguishes an explicit revoke from missing configuration', async () => {
    const prisma = {
      modulePermission: {
        findMany: jest.fn().mockResolvedValue([
          { mallId: 'mall-a', module: 'fitout', role: Role.OPERATION, allowed: false },
        ]),
      },
      userModulePermission: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PermissionsService(prisma as any);

    const roles = await service.getAllowedRoles('fitout', 'mall-a');

    expect(roles).toBeInstanceOf(Set);
    expect(roles?.size).toBe(0);
  });

  it('PERM-FITOUT-NOCONFIG-002 returns null only when no tier is configured', async () => {
    const prisma = {
      modulePermission: { findMany: jest.fn().mockResolvedValue([]) },
      userModulePermission: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PermissionsService(prisma as any);

    await expect(service.getAllowedRoles('fitout', 'mall-a')).resolves.toBeNull();
  });
});

describe('PermissionsService CRUD rights and user overrides', () => {
  const row = (over: object) => ({
    mallId: 'GLOBAL', module: 'crm', role: Role.LEASING_MANAGER,
    allowed: true, canCreate: true, canUpdate: true, canDelete: true, ...over,
  });
  const build = (rows: object[], userRows: object[] = []) =>
    new PermissionsService({
      modulePermission: { findMany: jest.fn().mockResolvedValue(rows) },
      userModulePermission: { findMany: jest.fn().mockResolvedValue(userRows) },
    } as any);

  it('treats rows without CRUD flags as fully allowed', async () => {
    const service = build([row({})]);
    await expect(service.isRoleActionAllowed(Role.LEASING_MANAGER, 'crm', 'delete', 'mall-a')).resolves.toBe(true);
  });

  it('denies only the flagged action', async () => {
    const service = build([row({ canDelete: false })]);
    await expect(service.isRoleActionAllowed(Role.LEASING_MANAGER, 'crm', 'delete')).resolves.toBe(false);
    await expect(service.isRoleActionAllowed(Role.LEASING_MANAGER, 'crm', 'update')).resolves.toBe(true);
  });

  it("uses the Mall's own flags instead of Global's once the Mall is configured", async () => {
    const service = build([row({ canCreate: true }), row({ mallId: 'mall-a', canCreate: false })]);
    await expect(service.isRoleActionAllowed(Role.LEASING_MANAGER, 'crm', 'create', 'mall-a')).resolves.toBe(false);
    await expect(service.isRoleActionAllowed(Role.LEASING_MANAGER, 'crm', 'create', 'mall-b')).resolves.toBe(true);
  });

  it('returns null for a user with no override, and the explicit value otherwise', async () => {
    const service = build([row({})], [
      { userId: 'u1', mallId: 'GLOBAL', module: 'crm', canView: null, canCreate: true, canUpdate: null, canDelete: false },
    ]);
    await expect(service.getUserDecision('u2', 'crm', 'create')).resolves.toBeNull();
    await expect(service.getUserDecision('u1', 'crm', 'create')).resolves.toBe(true);
    await expect(service.getUserDecision('u1', 'crm', 'delete')).resolves.toBe(false);
    await expect(service.getUserDecision('u1', 'crm', 'update')).resolves.toBeNull();
  });

  it('an explicit no-view override denies every action that is not itself overridden', async () => {
    const service = build([row({})], [
      { userId: 'u1', mallId: 'GLOBAL', module: 'crm', canView: false, canCreate: null, canUpdate: null, canDelete: null },
    ]);
    await expect(service.getUserDecision('u1', 'crm', 'update')).resolves.toBe(false);
  });

  it('a Mall-specific user override wins over the Global one', async () => {
    const service = build([row({})], [
      { userId: 'u1', mallId: 'GLOBAL', module: 'crm', canView: null, canCreate: true, canUpdate: null, canDelete: null },
      { userId: 'u1', mallId: 'mall-a', module: 'crm', canView: null, canCreate: false, canUpdate: null, canDelete: null },
    ]);
    await expect(service.getUserDecision('u1', 'crm', 'create', 'mall-a')).resolves.toBe(false);
    await expect(service.getUserDecision('u1', 'crm', 'create', 'mall-b')).resolves.toBe(true);
  });

  it('getEffectiveActions applies the user override over the role', async () => {
    const service = build([row({ canDelete: false })], [
      { userId: 'u1', mallId: 'GLOBAL', module: 'crm', canView: null, canCreate: null, canUpdate: null, canDelete: true },
    ]);
    const actions = await service.getEffectiveActions({ id: 'u1', role: Role.LEASING_MANAGER });
    expect(actions.crm).toEqual({ view: true, create: true, update: true, delete: true });
    const other = await service.getEffectiveActions({ id: 'u2', role: Role.LEASING_MANAGER });
    expect(other.crm.delete).toBe(false);
  });
});
