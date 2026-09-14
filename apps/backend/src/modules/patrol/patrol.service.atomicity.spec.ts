import { Prisma } from '@prisma/client';
import { PatrolService } from './patrol.service';

describe('PatrolService abnormal-check atomicity', () => {
  const tx: any = {
    patrolCheck: { findUnique: jest.fn(), update: jest.fn() },
    workOrder: { create: jest.fn() },
  };
  const prisma: any = {
    patrolCheck: { findUnique: jest.fn(), update: jest.fn() },
    workOrder: { create: jest.fn() },
    userMallAccess: { findMany: jest.fn() },
    $transaction: jest.fn(async (operation: any) => operation(tx)),
  };
  const notifications: any = { create: jest.fn() };
  let service: PatrolService;

  const current = {
    id: 'check-1',
    workOrderId: null,
    shift: {
      id: 'shift-1',
      status: 'IN_PROGRESS',
      mallId: 'mall-1',
      shiftNumber: 'PS-1',
      checks: [],
    },
    point: {
      id: 'point-1',
      name: 'North entrance',
      instructions: 'Inspect entrance',
      location: 'L1',
      requireQrScan: false,
      qrToken: 'qr-1',
      latitude: null,
      longitude: null,
      geofenceRadius: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PatrolService(prisma, {} as any, notifications, {} as any);
    prisma.patrolCheck.findUnique.mockResolvedValue(current);
    tx.patrolCheck.findUnique.mockResolvedValue({ workOrderId: null });
    tx.workOrder.create.mockResolvedValue({ id: 'wo-1' });
    tx.patrolCheck.update.mockResolvedValue({ id: 'check-1', workOrderId: 'wo-1' });
    prisma.userMallAccess.findMany.mockResolvedValue([]);
  });

  it('creates and links the Work Order in one Serializable transaction', async () => {
    const result = await service.check('check-1', { result: 'ABNORMAL', severity: 'HIGH' }, 'user-1');

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(tx.workOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        mallId: 'mall-1',
        sourceEntityType: 'PATROL_CHECK',
        sourceEntityId: 'check-1',
      }),
    }));
    expect(tx.patrolCheck.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ result: 'ABNORMAL', workOrderId: 'wo-1' }),
    }));
    expect(result).toEqual({ id: 'check-1', workOrderId: 'wo-1' });
    expect(prisma.workOrder.create).not.toHaveBeenCalled();
    expect(prisma.patrolCheck.update).not.toHaveBeenCalled();
  });

  it('reuses the persisted Work Order link on retry instead of creating a duplicate', async () => {
    tx.patrolCheck.findUnique.mockResolvedValue({ workOrderId: 'wo-existing' });
    tx.patrolCheck.update.mockResolvedValue({ id: 'check-1', workOrderId: 'wo-existing' });

    await service.check('check-1', { result: 'ABNORMAL', severity: 'MEDIUM' }, 'user-1');

    expect(tx.workOrder.create).not.toHaveBeenCalled();
    expect(tx.patrolCheck.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workOrderId: 'wo-existing' }),
    }));
  });

  it('notifies mall directors of a HIGH/URGENT escalation using the shift id, not the check id', async () => {
    // PatrolPage only has a shift-level detail view — no standalone per-check screen — so a
    // notification pointing at the PatrolCheck id would 404 in the frontend. It must resolve to
    // current.shift.id (the record NotificationCenter's /patrol?id=... route can actually open).
    prisma.userMallAccess.findMany.mockResolvedValue([{ userId: 'director-1' }, { userId: 'director-2' }]);

    await service.check('check-1', { result: 'ABNORMAL', severity: 'HIGH' }, 'user-1');

    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'director-1',
      entityType: 'PATROL_CHECK_ESCALATION',
      entityId: 'shift-1',
    }));
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'director-2',
      entityType: 'PATROL_CHECK_ESCALATION',
      entityId: 'shift-1',
    }));
  });

  it('does not notify directors for a LOW/MEDIUM severity abnormal check', async () => {
    prisma.userMallAccess.findMany.mockResolvedValue([{ userId: 'director-1' }]);

    await service.check('check-1', { result: 'ABNORMAL', severity: 'MEDIUM' }, 'user-1');

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('retries a recognized Serializable collision with a fresh link read', async () => {
    prisma.$transaction
      .mockRejectedValueOnce(Object.assign(new Error('serialization conflict'), { code: 'P2034' }))
      .mockImplementationOnce(async (operation: any) => operation(tx));

    await service.check('check-1', { result: 'ABNORMAL', severity: 'MEDIUM' }, 'user-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.patrolCheck.findUnique).toHaveBeenCalledTimes(1);
  });
});
