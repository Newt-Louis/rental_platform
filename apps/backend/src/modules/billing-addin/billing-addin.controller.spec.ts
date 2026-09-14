import { ForbiddenException } from '@nestjs/common';
import { BillingAddInController } from './billing-addin.controller';

describe('BillingAddInController Mall isolation', () => {
  const user = { id: 'operation-a', role: 'OPERATION' };

  function buildController(mallIds: string[] | null = ['mall-a']) {
    const service: any = {
      list: jest.fn(), listRates: jest.fn(), getOne: jest.fn(), saveDraft: jest.fn(),
      confirmNoCharge: jest.fn(), confirm: jest.fn(), reopen: jest.fn(),
    };
    const mallAccess: any = {
      assertMallAccess: jest.fn(),
      getAccessibleMallIds: jest.fn().mockResolvedValue(mallIds),
    };
    return { controller: new BillingAddInController(service, mallAccess), service, mallAccess };
  }

  it('SEC-MALL-004 scopes omitted-mall rate lists to the authenticated Mall set', async () => {
    const { controller, service, mallAccess } = buildController(['mall-a']);
    await controller.listRates({} as any, user);
    expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith(user.id, user.role);
    expect(service.listRates).toHaveBeenCalledWith(undefined, undefined, ['mall-a']);
  });

  it('preserves an empty Mall set instead of broadening to every Mall', async () => {
    const { controller, service } = buildController([]);
    await controller.listRates({} as any, user);
    expect(service.listRates).toHaveBeenCalledWith(undefined, undefined, []);
  });

  it('SEC-MALL-001 rejects an explicit foreign Mall before querying rates', async () => {
    const { controller, service, mallAccess } = buildController();
    mallAccess.assertMallAccess.mockRejectedValue(new ForbiddenException());
    await expect(controller.listRates({ mallId: 'mall-b' } as any, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.listRates).not.toHaveBeenCalled();
  });

  it('keeps the ADMIN unrestricted positive path', async () => {
    const { controller, service } = buildController(null);
    await controller.listRates({} as any, { id: 'admin', role: 'ADMIN' });
    expect(service.listRates).toHaveBeenCalledWith(undefined, undefined, undefined);
  });

  it.each([
    ['getOne', (c: BillingAddInController) => c.getOne('entry-b', user)],
    ['saveDraft', (c: BillingAddInController) => c.saveDraft('entry-b', { inputData: {}, notes: '' } as any, user)],
    ['confirmNoCharge', (c: BillingAddInController) => c.confirmNoCharge('entry-b', user)],
    ['confirm', (c: BillingAddInController) => c.confirm('entry-b', user)],
    ['reopen', (c: BillingAddInController) => c.reopen('entry-b', user)],
  ])('%s passes an authenticated Mall ceiling to the ownership-scoped service lookup', async (name, call) => {
    const { controller, service } = buildController(['mall-a']);
    await call(controller);
    expect(service[name].mock.calls[0]).toContainEqual(['mall-a']);
  });
});
