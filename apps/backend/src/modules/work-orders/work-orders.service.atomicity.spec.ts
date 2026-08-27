import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersService state/audit atomicity', () => {
  const tx: any = {
    workOrder: { update: jest.fn() },
    workOrderEvent: { create: jest.fn() },
  };
  const prisma: any = {
    workOrder: { findFirst: jest.fn(), update: jest.fn() },
    workOrderEvent: { create: jest.fn() },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
  };
  const notifications: any = { create: jest.fn() };
  let service: WorkOrdersService;

  const row = (overrides: Record<string, any> = {}) => ({
    id: 'wo-1',
    workOrderNumber: 'WO-1',
    title: 'Inspect unit',
    status: 'ASSIGNED',
    requesterId: 'requester-1',
    assigneeId: 'assignee-1',
    startedAt: null,
    checklist: [],
    evidence: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkOrdersService(prisma, {} as any, notifications, {} as any);
    tx.workOrder.update.mockResolvedValue({ id: 'wo-1' });
    tx.workOrderEvent.create.mockResolvedValue({ id: 'event-1' });
  });

  it('writes a status transition and its audit event through the same transaction client', async () => {
    prisma.workOrder.findFirst.mockResolvedValue(row());

    await service.transition('wo-1', 'IN_PROGRESS', 'actor-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.workOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'wo-1' },
      data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    }));
    expect(tx.workOrderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workOrderId: 'wo-1',
        eventType: 'STATUS_CHANGED',
        oldValue: 'ASSIGNED',
        newValue: 'IN_PROGRESS',
      }),
    });
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
    expect(prisma.workOrderEvent.create).not.toHaveBeenCalled();
  });

  it('does not deliver a notification when the transactional audit insert fails', async () => {
    prisma.workOrder.findFirst.mockResolvedValue(row());
    tx.workOrderEvent.create.mockRejectedValue(new Error('audit unavailable'));

    await expect(service.transition('wo-1', 'IN_PROGRESS', 'actor-1'))
      .rejects.toThrow('audit unavailable');

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('keeps review outcome and review audit event in one transaction', async () => {
    prisma.workOrder.findFirst.mockResolvedValue(row({ status: 'WAITING_REVIEW' }));

    await service.review('wo-1', true, 'Accepted', 'reviewer-1');

    expect(tx.workOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED', reviewStatus: 'APPROVED' }),
    }));
    expect(tx.workOrderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'APPROVED', newValue: 'COMPLETED' }),
    });
  });

  it('keeps a general update and its audit event in one transaction', async () => {
    prisma.workOrder.findFirst.mockResolvedValue(row());

    await service.update('wo-1', { priority: 'HIGH' }, 'actor-1');

    expect(tx.workOrder.update).toHaveBeenCalledWith({
      where: { id: 'wo-1' },
      data: { priority: 'HIGH' },
    });
    expect(tx.workOrderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'UPDATED', newValue: JSON.stringify({ priority: 'HIGH' }) }),
    });
  });
});
