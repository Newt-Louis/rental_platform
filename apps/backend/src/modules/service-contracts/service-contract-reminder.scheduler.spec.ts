import { ServiceContractReminderScheduler } from './service-contract-reminder.scheduler';

describe('ServiceContractReminderScheduler', () => {
  const prisma = {
    serviceContract: { findMany: jest.fn(), update: jest.fn() },
    serviceContractEvent: { create: jest.fn() },
    serviceContractPayment: { findMany: jest.fn(), update: jest.fn() },
    notification: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  const schedulerLock = {
    runExclusive: jest.fn((_name: string, _ttl: number, task: () => Promise<unknown>) =>
      task().then((value) => ({ executed: true, value }))),
  } as any;
  let scheduler: ServiceContractReminderScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new ServiceContractReminderScheduler(prisma, schedulerLock);
    prisma.serviceContract.findMany
      .mockResolvedValueOnce([{ id: 'contract-1', status: 'ACTIVE' }])
      .mockResolvedValueOnce([]);
    prisma.serviceContractPayment.findMany.mockResolvedValue([]);
    prisma.serviceContract.update.mockReturnValue(Promise.resolve({}));
    prisma.serviceContractEvent.create.mockReturnValue(Promise.resolve({}));
    prisma.$transaction.mockResolvedValue([]);
  });

  it('automatically expires past contracts and writes an audit event', async () => {
    await scheduler.run();

    expect(prisma.serviceContract.update).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: { status: 'EXPIRED' },
    });
    expect(prisma.serviceContractEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contractId: 'contract-1',
        eventType: 'STATUS_CHANGED',
        oldValue: 'ACTIVE',
        newValue: 'EXPIRED',
      }),
    });
  });

  it('runs under the distributed scheduler lock', async () => {
    await scheduler.run();
    expect(schedulerLock.runExclusive).toHaveBeenCalledWith('service-contract-reminders', 14_400_000, expect.any(Function));
  });

  it('skips the reminder pass entirely when another instance holds the lock', async () => {
    schedulerLock.runExclusive.mockResolvedValueOnce({ executed: false, reason: 'locked' });
    await scheduler.run();
    expect(prisma.serviceContract.findMany).not.toHaveBeenCalled();
  });
});
