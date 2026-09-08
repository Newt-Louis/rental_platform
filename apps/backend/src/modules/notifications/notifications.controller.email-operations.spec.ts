import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationsController } from './notifications.controller';

describe('NotificationsController email operations authorization', () => {
  const emailDelivery = {
    list: jest.fn(),
    get: jest.fn(),
    preview: jest.fn(),
    retry: jest.fn(),
    resend: jest.fn(),
    auditDomainResend: jest.fn(),
  };
  const tenants = { reissuePortalActivation: jest.fn() };
  const permissions = { getAllowedRoles: jest.fn() };
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector, permissions as any);

  const routes = [
    ['list', 'getEmailDeliveries'],
    ['detail', 'getEmailDelivery'],
    ['preview', 'previewEmailDelivery'],
    ['retry', 'retryEmailDelivery'],
    ['resend', 'resendEmailDelivery'],
  ] as const;

  beforeEach(() => jest.clearAllMocks());

  function context(methodName: (typeof routes)[number][1], role: Role): ExecutionContext {
    return {
      getHandler: () => NotificationsController.prototype[methodName],
      getClass: () => NotificationsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'user-a', role }, query: {}, body: {}, params: {} }),
      }),
    } as unknown as ExecutionContext;
  }

  it.each(routes)('allows the internal OPERATION role to access %s', async (_name, methodName) => {
    await expect(guard.canActivate(context(methodName, Role.OPERATION))).resolves.toBe(true);
  });

  it.each(routes)(
    'RBAC negative: denies a Mall-authorized but non-Email-Operations role from %s',
    async (_name, methodName) => {
      await expect(
        guard.canActivate(context(methodName, Role.LEASING_MANAGER)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each(routes)('tenant security: denies TENANT users from %s', async (_name, methodName) => {
    await expect(guard.canActivate(context(methodName, Role.TENANT))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each(['retryEmailDelivery', 'resendEmailDelivery'] as const)(
    'guard denial occurs before %s controller mutation and delivery side effects',
    async (methodName) => {
    const controller = new NotificationsController({} as any, emailDelivery as any, tenants as any);
    const denied = context(methodName, Role.LEASING_MANAGER);

    await expect(guard.canActivate(denied)).rejects.toBeInstanceOf(ForbiddenException);

    expect(controller).toBeDefined();
    expect(emailDelivery.list).not.toHaveBeenCalled();
    expect(emailDelivery.get).not.toHaveBeenCalled();
    expect(emailDelivery.preview).not.toHaveBeenCalled();
    expect(emailDelivery.retry).not.toHaveBeenCalled();
    expect(emailDelivery.resend).not.toHaveBeenCalled();
    expect(tenants.reissuePortalActivation).not.toHaveBeenCalled();
    expect(emailDelivery.auditDomainResend).not.toHaveBeenCalled();
  });

  it('regenerates activation through the authoritative Tenant flow without replaying HTML', async () => {
    const controller = new NotificationsController({} as any, emailDelivery as any, tenants as any);
    const user = { id: 'ops-a', role: Role.OPERATION };
    emailDelivery.get.mockResolvedValue({
      id: 'delivery-a', entityId: 'tenant-a', mallId: 'mall-a',
      capabilities: { canResend: true, resendMode: 'REGENERATE_DOMAIN_TOKEN' },
    });
    tenants.reissuePortalActivation.mockResolvedValue({ sent: true, deliveryId: 'delivery-new', created: true });

    await expect(controller.resendEmailDelivery('delivery-a', user, 'operation-1')).resolves.toEqual({ sent: true, deliveryId: 'delivery-new', created: true });
    expect(tenants.reissuePortalActivation).toHaveBeenCalledWith('tenant-a', 'delivery-a', 'operation-1', 'mall-a');
    expect(emailDelivery.resend).not.toHaveBeenCalled();
    expect(emailDelivery.auditDomainResend).toHaveBeenCalledWith('delivery-a', 'delivery-new', true, user);
  });

  it('denies activation resend when backend capabilities reject the action, with zero side effects', async () => {
    const controller = new NotificationsController({} as any, emailDelivery as any, tenants as any);
    const user = { id: 'ops-a', role: Role.OPERATION };
    emailDelivery.get.mockResolvedValue({
      id: 'delivery-a',
      entityId: 'tenant-a',
      mallId: 'mall-a',
      capabilities: { canResend: false, resendMode: 'REGENERATE_DOMAIN_TOKEN' },
    });

    await expect(
      controller.resendEmailDelivery('delivery-a', user, 'operation-denied'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tenants.reissuePortalActivation).not.toHaveBeenCalled();
    expect(emailDelivery.resend).not.toHaveBeenCalled();
    expect(emailDelivery.auditDomainResend).not.toHaveBeenCalled();
  });
});
