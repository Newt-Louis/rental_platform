import { BadRequestException } from '@nestjs/common';
import { UnitStatus } from '@prisma/client';
import { SpacesService } from './spaces.service';

describe('SpacesService unit CRUD safeguards', () => {
  const prisma: any = {
    mall: { findFirst: jest.fn(), findMany: jest.fn() },
    floor: { findFirst: jest.fn() },
    zone: { findFirst: jest.fn() },
    unit: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    unitBooking: { count: jest.fn() },
    contract: { count: jest.fn() },
    proposal: { count: jest.fn() },
    unitSlot: { count: jest.fn() },
    unitHistory: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const unitStatus: any = { transition: jest.fn() };
  const mallAccess: any = { assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() };
  const service = new SpacesService(prisma, unitStatus, mallAccess);
  const unit = {
    id: 'unit-1', code: 'A-01', mallId: 'mall-1', floorId: null, zoneId: null,
    status: UnitStatus.VACANT, isActive: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(service, 'getUnit').mockResolvedValue(unit as any);
    prisma.mall.findFirst.mockResolvedValue({ id: 'mall-1' });
    prisma.unitBooking.count.mockResolvedValue(0);
    prisma.contract.count.mockResolvedValue(0);
    prisma.proposal.count.mockResolvedValue(0);
    prisma.unitSlot.count.mockResolvedValue(0);
    prisma.unit.update.mockResolvedValue({ ...unit, name: 'Updated' });
    prisma.unitHistory.create.mockResolvedValue({ id: 'history-1' });
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it('limits the Mall list to the permission scope', async () => {
    prisma.mall.findMany.mockResolvedValue([]);

    await service.getMalls(['mall-1', 'mall-2']);

    expect(prisma.mall.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, id: { in: ['mall-1', 'mall-2'] } },
    }));
  });

  it('returns no Mall when a user has no Mall permission', async () => {
    prisma.mall.findMany.mockResolvedValue([]);

    await service.getMalls([]);

    expect(prisma.mall.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, id: { in: [] } },
    }));
  });

  it('rejects lifecycle fields on generic edit', async () => {
    await expect(service.updateUnit('unit-1', { status: UnitStatus.BOOKING }))
      .rejects.toThrow('được quản lý bởi quy trình trạng thái');
    expect(prisma.unit.update).not.toHaveBeenCalled();
  });

  it('rejects information edits when the unit is not vacant', async () => {
    jest.spyOn(service, 'getUnit').mockResolvedValueOnce({ ...unit, status: UnitStatus.BOOKING } as any);

    await expect(service.updateUnit('unit-1', { name: 'Blocked update' }))
      .rejects.toThrow('Chỉ có thể điều chỉnh thông tin mặt bằng');
    expect(prisma.unit.update).not.toHaveBeenCalled();
  });

  it('blocks deletion while a live contract exists', async () => {
    prisma.contract.count.mockResolvedValue(1);

    await expect(service.deleteUnit('unit-1', 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.unit.update).not.toHaveBeenCalled();
  });

  it('soft deletes an unused unit and records who deleted it', async () => {
    await service.deleteUnit('unit-1', 'user-1');

    expect(prisma.unit.update).toHaveBeenCalledWith({ where: { id: 'unit-1' }, data: { isActive: false } });
    expect(prisma.unitHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fieldName: 'isActive', changedById: 'user-1' }),
    }));
  });

  it('rejects bulk status overwrites', async () => {
    prisma.unit.findMany.mockResolvedValue([unit]);

    await expect(service.bulkUpdateUnits(['unit-1'], { status: UnitStatus.BOOKING }, 'user-1'))
      .rejects.toThrow('không thể đổi hàng loạt');
    expect(prisma.unit.updateMany).not.toHaveBeenCalled();
  });

  it('rejects bulk information edits containing a non-vacant unit', async () => {
    prisma.unit.findMany.mockResolvedValue([{ ...unit, status: UnitStatus.CONTRACTED }]);

    await expect(service.bulkUpdateUnits(['unit-1'], { category: 'Retail' }, 'user-1'))
      .rejects.toThrow('Chỉ có thể cập nhật hàng loạt các mặt bằng đang trống');
    expect(prisma.unit.updateMany).not.toHaveBeenCalled();
  });

  // CR-101 Phase 3G (BC-BULK-UNIT-CROSS-MALL: DENY) -- a single bulk-update
  // request must not span more than one Mall, even for a caller (e.g. ADMIN,
  // or any multi-Mall-assigned staff member) whose accessible-mall-set would
  // otherwise permit each unit individually.
  it('rejects a bulk update spanning more than one Mall in a single request', async () => {
    prisma.unit.findMany.mockResolvedValue([
      { ...unit, id: 'unit-1', mallId: 'mall-1' },
      { ...unit, id: 'unit-2', mallId: 'mall-2' },
    ]);

    await expect(
      service.bulkUpdateUnits(['unit-1', 'unit-2'], { category: 'Retail' }, 'user-1'),
    ).rejects.toThrow('nhiều mall khác nhau');
    expect(prisma.unit.updateMany).not.toHaveBeenCalled();
    // Fails before even checking per-unit Mall access -- the cross-Mall shape
    // itself is rejected outright, not merely denied for lack of grants.
    expect(mallAccess.getAccessibleMallIds).not.toHaveBeenCalled();
  });

  it('allows a bulk update where every unit belongs to the same Mall', async () => {
    prisma.unit.findMany.mockResolvedValue([
      { ...unit, id: 'unit-1', mallId: 'mall-1' },
      { ...unit, id: 'unit-2', mallId: 'mall-1' },
    ]);
    prisma.unit.updateMany.mockResolvedValue({ count: 2 });
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);

    await service.bulkUpdateUnits(
      ['unit-1', 'unit-2'],
      { category: 'Retail' },
      'user-1',
      { id: 'user-1', role: 'MALL_DIRECTOR' },
    );

    expect(prisma.unit.updateMany).toHaveBeenCalled();
  });

  it('rejects a manual LIQUIDATED status change — it must stay paired with Contract.TERMINATING via ContractTerminationService', async () => {
    await expect(service.updateUnitStatus('unit-1', UnitStatus.LIQUIDATED, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(service.getUnit).not.toHaveBeenCalled();
    expect(unitStatus.transition).not.toHaveBeenCalled();
  });

  it('still allows other manual status changes (e.g. VACANT) through the same endpoint', async () => {
    unitStatus.transition.mockResolvedValue({ ...unit, status: UnitStatus.VACANT });

    await service.updateUnitStatus('unit-1', UnitStatus.VACANT, 'user-1');

    expect(unitStatus.transition).toHaveBeenCalledWith('unit-1', UnitStatus.VACANT, {
      userId: 'user-1',
      reason: 'Manual status update',
    });
  });
});
