import { OutboxService } from './outbox.service';

describe('OutboxService', () => {
  const prisma = {
    outboxEvent: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const eventEmitter = { emitAsync: jest.fn() };
  const schedulerLock = { runExclusive: jest.fn() };
  const transaction = {
    outboxEvent: { upsert: jest.fn() },
  };
  let service: OutboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OutboxService(prisma as any, eventEmitter as any, schedulerLock as any);
  });

  it('enqueues idempotently using a unique event key', async () => {
    transaction.outboxEvent.upsert.mockResolvedValue({ id: 'outbox-1' });

    await service.enqueue(transaction as any, {
      eventKey: 'contract:contract-1:activated',
      eventName: 'contract.activated',
      aggregateType: 'CONTRACT',
      aggregateId: 'contract-1',
      payload: { contractId: 'contract-1' },
    });

    expect(transaction.outboxEvent.upsert).toHaveBeenCalledWith({
      where: { eventKey: 'contract:contract-1:activated' },
      update: {},
      create: expect.objectContaining({
        eventKey: 'contract:contract-1:activated',
        payload: { contractId: 'contract-1' },
      }),
    });
  });

  it('publishes due events and marks them processed', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([{
      id: 'outbox-1',
      eventKey: 'approval:workflow-1:completed',
      eventName: 'approval.workflow.completed',
      payload: { workflowId: 'workflow-1' },
      attempts: 0,
    }]);
    eventEmitter.emitAsync.mockResolvedValue([]);
    prisma.outboxEvent.update.mockResolvedValue({});

    await expect(service.processBatch()).resolves.toEqual({ processed: 1 });

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      'approval.workflow.completed',
      { workflowId: 'workflow-1' },
    );
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: expect.objectContaining({
        status: 'PROCESSED',
        attempts: { increment: 1 },
        lastError: null,
      }),
    });
  });

  it('records a failed attempt with exponential retry scheduling', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    prisma.outboxEvent.findMany.mockResolvedValue([{
      id: 'outbox-1',
      eventKey: 'approval:workflow-1:rejected',
      eventName: 'approval.workflow.rejected',
      payload: {},
      attempts: 1,
    }]);
    eventEmitter.emitAsync.mockRejectedValue(new Error('consumer unavailable'));
    prisma.outboxEvent.update.mockResolvedValue({});

    await service.processBatch();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: {
        status: 'FAILED',
        attempts: 2,
        lastError: 'consumer unavailable',
        nextAttemptAt: new Date(now + 4_000),
      },
    });
  });

  it('runs the processor under the distributed scheduler lock', async () => {
    schedulerLock.runExclusive.mockImplementation(
      (_key: string, _ttl: number, callback: () => unknown) => callback(),
    );
    prisma.outboxEvent.findMany.mockResolvedValue([]);

    await service.processPending();

    expect(schedulerLock.runExclusive).toHaveBeenCalledWith(
      'transactional-outbox',
      30_000,
      expect.any(Function),
    );
  });
});
