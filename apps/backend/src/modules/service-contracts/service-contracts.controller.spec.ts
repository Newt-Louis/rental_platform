import { ForbiddenException } from '@nestjs/common';
import { Role, ServiceContractSharePermission } from '@prisma/client';
import { ServiceContractsController } from './service-contracts.controller';

const { READ, EDIT, DELETE } = ServiceContractSharePermission;

describe('ServiceContractsController share enforcement', () => {
  const CREATOR = 'user-creator';
  const contract = (shares: Array<{ userId: string; permission: ServiceContractSharePermission }> = []) => ({
    id: 'sc-1',
    mallId: 'mall-1',
    contractNumber: 'HD-001',
    createdById: CREATOR,
    documents: [],
    shares,
  });

  let service: any;
  let mallAccess: any;
  let controller: ServiceContractsController;

  beforeEach(() => {
    jest.clearAllMocks();
    service = {
      findOne: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateStatus: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({ deleted: true }),
      createPayment: jest.fn().mockResolvedValue({}),
      transferPaymentToBilling: jest.fn().mockResolvedValue({}),
    };
    mallAccess = { assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() };
    controller = new ServiceContractsController(service, mallAccess);
  });

  const asUser = (id: string, role: Role) => ({ id, role });

  it('lets anyone with the role and Mall read a contract they were never shared', async () => {
    service.findOne.mockResolvedValue(contract());

    const result = await controller.detail('sc-1', asUser('user-legal', Role.LEGAL));

    expect(result.myPermission).toBe(READ);
    expect(result.canManageShares).toBe(false);
  });

  it('refuses an edit to a MALL_DIRECTOR who holds the role but no share', async () => {
    service.findOne.mockResolvedValue(contract());

    await expect(
      controller.update('sc-1', { title: 'x' }, asUser('user-md', Role.MALL_DIRECTOR)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('allows the edit once the creator shared EDIT', async () => {
    service.findOne.mockResolvedValue(contract([{ userId: 'user-md', permission: EDIT }]));

    await controller.update('sc-1', { title: 'x' }, asUser('user-md', Role.MALL_DIRECTOR));

    expect(service.update).toHaveBeenCalled();
  });

  it('still refuses a delete when the share only reaches EDIT', async () => {
    service.findOne.mockResolvedValue(contract([{ userId: 'user-md', permission: EDIT }]));

    await expect(controller.remove('sc-1', asUser('user-md', Role.MALL_DIRECTOR))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.remove).not.toHaveBeenCalled();
  });

  it('allows the delete at share level DELETE', async () => {
    service.findOne.mockResolvedValue(contract([{ userId: 'user-md', permission: DELETE }]));

    await controller.remove('sc-1', asUser('user-md', Role.MALL_DIRECTOR));

    expect(service.remove).toHaveBeenCalledWith('sc-1', 'user-md');
  });

  it('keeps FINANCE read-only even when shared DELETE, because the role caps it', async () => {
    service.findOne.mockResolvedValue(contract([{ userId: 'user-fin', permission: DELETE }]));

    await expect(
      controller.status('sc-1', { status: 'ACTIVE' } as any, asUser('user-fin', Role.FINANCE)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets FINANCE transfer a payment to billing without any share', async () => {
    // Bước kế toán gắn với vai trò, cố ý nằm ngoài ràng buộc chia sẻ.
    service.findOne.mockResolvedValue(contract());

    await controller.transferToBilling('sc-1', 'pay-1', asUser('user-fin', Role.FINANCE));

    expect(service.transferPaymentToBilling).toHaveBeenCalledWith('sc-1', 'pay-1', 'user-fin');
  });

  it('blocks a shared editor from re-sharing the contract', async () => {
    service.findOne.mockResolvedValue(contract([{ userId: 'user-md', permission: DELETE }]));

    await expect(
      controller.update('sc-1', { shares: [{ userId: 'user-x', permission: EDIT }] }, asUser('user-md', Role.MALL_DIRECTOR)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('lets the creator change the share list', async () => {
    service.findOne.mockResolvedValue(contract());

    await controller.update('sc-1', { shares: [{ userId: 'user-x', permission: EDIT }] }, asUser(CREATOR, Role.OPERATION));

    expect(service.update).toHaveBeenCalled();
  });

  it('stamps every listed row with the viewer own effective permission', async () => {
    service.findAll.mockResolvedValue({
      data: [
        { id: 'a', createdById: CREATOR, shares: [{ permission: EDIT }] },
        { id: 'b', createdById: 'user-md', shares: [] },
        { id: 'c', createdById: CREATOR, shares: [] },
      ],
      total: 3,
    });
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);

    const result: any = await controller.list({}, asUser('user-md', Role.MALL_DIRECTOR));

    expect(result.data.map((row: any) => row.myPermission)).toEqual([EDIT, DELETE, READ]);
    // Bản ghi chia sẻ thô không được rò ra ngoài response của danh sách.
    expect(result.data.every((row: any) => row.shares === undefined)).toBe(true);
  });
});

describe('ServiceContractsController mall-scoped summaries', () => {
  const service = { alerts: jest.fn(), stats: jest.fn() } as any;
  const mallAccess = { assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() } as any;
  const user = { id: 'user-1', role: 'MALL_DIRECTOR' };
  let controller: ServiceContractsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ServiceContractsController(service, mallAccess);
  });

  it('scopes alerts to the selected mall after checking access', async () => {
    service.alerts.mockResolvedValue({ expiring: 1 });

    await controller.alerts('30', 'mall-1', user);

    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('user-1', 'MALL_DIRECTOR', 'mall-1');
    expect(service.alerts).toHaveBeenCalledWith(['mall-1'], 30);
    expect(mallAccess.getAccessibleMallIds).not.toHaveBeenCalled();
  });

  it('scopes stats to all accessible malls when no mall is selected', async () => {
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1', 'mall-2']);
    service.stats.mockResolvedValue({ total: 2 });

    await controller.stats(undefined, user);

    expect(service.stats).toHaveBeenCalledWith(['mall-1', 'mall-2']);
  });
});
