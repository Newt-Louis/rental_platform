import { SchedulerLockService } from './scheduler-lock.service';
import { RedisService } from './redis.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SchedulerLockService', () => {
  const redis = {
    isEnabled: true,
    acquireLock: jest.fn(),
    releaseLock: jest.fn(),
  };
  const prisma = {
    jobExecution: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  let service: SchedulerLockService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.jobExecution.create.mockResolvedValue({ id: 'exec-1' });
    prisma.jobExecution.update.mockResolvedValue({ id: 'exec-1' });
    service = new SchedulerLockService(
      redis as unknown as RedisService,
      prisma as unknown as PrismaService,
    );
  });

  it('executes and releases a lock owned by this process', async () => {
    redis.acquireLock.mockResolvedValue(true);
    redis.releaseLock.mockResolvedValue(true);
    const task = jest.fn().mockResolvedValue('done');

    const result = await service.runExclusive('billing', 60_000, task);

    expect(result).toEqual({ executed: true, value: 'done' });
    expect(task).toHaveBeenCalledTimes(1);
    expect(redis.acquireLock).toHaveBeenCalledWith(
      'scheduler:lock:billing',
      expect.any(String),
      60_000,
    );
    expect(redis.releaseLock).toHaveBeenCalledWith(
      'scheduler:lock:billing',
      expect.any(String),
    );
    expect(redis.acquireLock.mock.calls[0][1]).toBe(redis.releaseLock.mock.calls[0][1]);
  });

  it('skips execution when another instance owns the lock', async () => {
    redis.acquireLock.mockResolvedValue(false);
    const task = jest.fn();

    await expect(service.runExclusive('billing', 60_000, task)).resolves.toEqual({
      executed: false,
      reason: 'locked',
    });
    expect(task).not.toHaveBeenCalled();
    expect(redis.releaseLock).not.toHaveBeenCalled();
  });

  it('releases the lock when the scheduled task fails', async () => {
    redis.acquireLock.mockResolvedValue(true);
    redis.releaseLock.mockResolvedValue(true);

    await expect(
      service.runExclusive('billing', 60_000, async () => {
        throw new Error('job failed');
      }),
    ).rejects.toThrow('job failed');
    expect(redis.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('uses single-instance fallback when Redis is disabled', async () => {
    redis.isEnabled = false;
    const task = jest.fn().mockResolvedValue(42);

    await expect(service.runExclusive('billing', 60_000, task)).resolves.toEqual({
      executed: true,
      value: 42,
    });
    expect(redis.acquireLock).not.toHaveBeenCalled();
    redis.isEnabled = true;
  });

  it('records a RUNNING then SUCCEEDED ledger row for a successful run', async () => {
    redis.acquireLock.mockResolvedValue(true);
    redis.releaseLock.mockResolvedValue(true);
    const task = jest.fn().mockResolvedValue('done');

    await service.runExclusive('billing', 60_000, task);

    expect(prisma.jobExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobName: 'billing', status: 'RUNNING' }),
      }),
    );
    expect(prisma.jobExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      }),
    );
  });

  it('records a FAILED ledger row with an error summary when the task throws', async () => {
    redis.acquireLock.mockResolvedValue(true);
    redis.releaseLock.mockResolvedValue(true);

    await expect(
      service.runExclusive('billing', 60_000, async () => {
        throw new Error('job failed');
      }),
    ).rejects.toThrow('job failed');

    expect(prisma.jobExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'FAILED', errorSummary: 'job failed' }),
      }),
    );
  });

  it('records a SKIPPED_LOCKED ledger row when another instance owns the lock', async () => {
    redis.acquireLock.mockResolvedValue(false);

    await service.runExclusive('billing', 60_000, jest.fn());

    expect(prisma.jobExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobName: 'billing', status: 'SKIPPED_LOCKED' }),
      }),
    );
  });

  it('does not fail the job when the ledger write itself errors', async () => {
    redis.acquireLock.mockResolvedValue(true);
    redis.releaseLock.mockResolvedValue(true);
    prisma.jobExecution.create.mockRejectedValue(new Error('db unavailable'));
    const task = jest.fn().mockResolvedValue('done');

    await expect(service.runExclusive('billing', 60_000, task)).resolves.toEqual({
      executed: true,
      value: 'done',
    });
  });
});
