import { ServiceContractReminderScheduler } from './service-contract-reminder.scheduler';

describe('ServiceContractReminderScheduler', () => {
  const prisma = {
    serviceContract: { findMany: jest.fn(), update: jest.fn() },
    serviceContractEvent: { create: jest.fn() },
    serviceContractPayment: { findMany: jest.fn(), update: jest.fn() },
    notification: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  let scheduler: ServiceContractReminderScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new ServiceContractReminderScheduler(prisma);
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
});
