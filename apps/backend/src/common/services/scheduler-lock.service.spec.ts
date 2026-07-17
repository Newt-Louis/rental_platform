import { SchedulerLockService } from './scheduler-lock.service';
import { RedisService } from './redis.service';

describe('SchedulerLockService', () => {
  const redis = {
    isEnabled: true,
    acquireLock: jest.fn(),
    releaseLock: jest.fn(),
  };
  let service: SchedulerLockService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SchedulerLockService(redis as unknown as RedisService);
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
});
