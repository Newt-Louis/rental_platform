import { ServiceContractReminderScheduler } from './service-contract-reminder.scheduler';

describe('ServiceContractReminderScheduler', () => {
  const prisma = {
    serviceContract: { findMany: jest.fn(), updateMany: jest.fn() },
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

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-05T01:00:00.000Z'));
  });

  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new ServiceContractReminderScheduler(prisma, schedulerLock);
    schedulerLock.runExclusive.mockImplementation(
      (_name: string, _ttl: number, task: () => Promise<unknown>) =>
        task().then((value) => ({ executed: true, value })),
    );
    prisma.serviceContract.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.serviceContractPayment.findMany.mockResolvedValue([]);
    prisma.serviceContract.updateMany.mockResolvedValue({ count: 1 });
    prisma.serviceContractEvent.create.mockResolvedValue({});
    prisma.notification.findFirst.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue({});
    prisma.serviceContractPayment.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (input: unknown) =>
      typeof input === 'function'
        ? (input as (tx: typeof prisma) => Promise<unknown>)(prisma)
        : Promise.all(input as Promise<unknown>[]));
  });

  it('automatically expires a contract only after its end calendar date', async () => {
    prisma.serviceContract.findMany.mockReset();
    prisma.serviceContract.findMany
      .mockResolvedValueOnce([{ id: 'contract-1', status: 'ACTIVE' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await scheduler.run();

    expect(prisma.serviceContract.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        isDeleted: false,
        status: { in: ['ACTIVE', 'EXPIRING'] },
        endDate: { lt: new Date('2026-09-05T00:00:00.000Z') },
      },
      select: { id: true, status: true },
    });
    expect(prisma.serviceContract.updateMany).toHaveBeenCalledWith({
      where: { id: 'contract-1', isDeleted: false, status: 'ACTIVE' },
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

  it('marks an active contract expiring at exactly seven calendar days', async () => {
    prisma.serviceContract.findMany.mockReset();
    prisma.serviceContract.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'contract-1',
        status: 'ACTIVE',
        endDate: new Date('2026-09-12T00:00:00.000Z'),
        ownerId: null,
        createdById: 'user-1',
        contractNumber: 'SC-001',
        title: 'Bảo trì',
      }]);

    await scheduler.run();

    expect(prisma.serviceContract.findMany).toHaveBeenNthCalledWith(3, {
      where: {
        isDeleted: false,
        status: { in: ['ACTIVE', 'EXPIRING'] },
        endDate: {
          gte: new Date('2026-09-05T00:00:00.000Z'),
          lte: new Date('2026-09-12T00:00:00.000Z'),
        },
      },
    });
    expect(prisma.serviceContract.updateMany).toHaveBeenCalledWith({
      where: { id: 'contract-1', isDeleted: false, status: 'ACTIVE' },
      data: { status: 'EXPIRING' },
    });
  });

  it('returns an early expiring status to active when more than seven days remain', async () => {
    prisma.serviceContract.findMany.mockReset();
    prisma.serviceContract.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'contract-1', status: 'EXPIRING' }])
      .mockResolvedValueOnce([]);

    await scheduler.run();

    expect(prisma.serviceContract.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        isDeleted: false,
        status: 'EXPIRING',
        endDate: { gt: new Date('2026-09-12T00:00:00.000Z') },
      },
      select: { id: true, status: true },
    });
    expect(prisma.serviceContract.updateMany).toHaveBeenCalledWith({
      where: { id: 'contract-1', isDeleted: false, status: 'EXPIRING' },
      data: { status: 'ACTIVE' },
    });
  });

  it('does not overwrite or audit a status changed concurrently after the scan', async () => {
    prisma.serviceContract.findMany.mockReset();
    prisma.serviceContract.findMany
      .mockResolvedValueOnce([{ id: 'contract-1', status: 'ACTIVE' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.serviceContract.updateMany.mockResolvedValueOnce({ count: 0 });

    await scheduler.run();

    expect(prisma.serviceContract.updateMany).toHaveBeenCalledWith({
      where: { id: 'contract-1', isDeleted: false, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });
    expect(prisma.serviceContractEvent.create).not.toHaveBeenCalled();
  });

  it('keeps the payment reminder horizon independent at 31 days', async () => {
    await scheduler.run();

    const paymentQuery = prisma.serviceContractPayment.findMany.mock.calls[0][0];
    expect(paymentQuery.where.dueDate.lte.getTime() - Date.now()).toBe(31 * 86_400_000);
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
