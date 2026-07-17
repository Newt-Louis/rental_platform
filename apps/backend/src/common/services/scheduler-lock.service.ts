import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from './redis.service';

export type SchedulerLockResult<T> =
  | { executed: true; value: T }
  | { executed: false; reason: 'locked' };

@Injectable()
export class SchedulerLockService {
  private readonly logger = new Logger(SchedulerLockService.name);
  private warnedWithoutRedis = false;

  constructor(private readonly redis: RedisService) {}

  async runExclusive<T>(
    name: string,
    ttlMs: number,
    task: () => Promise<T>,
  ): Promise<SchedulerLockResult<T>> {
    if (!this.redis.isEnabled) {
      if (!this.warnedWithoutRedis) {
        this.logger.warn(
          'Redis is unavailable; scheduler locks are running in single-instance fallback mode',
        );
        this.warnedWithoutRedis = true;
      }
      return { executed: true, value: await task() };
    }

    const key = `scheduler:lock:${name}`;
    const token = randomUUID();
    const acquired = await this.redis.acquireLock(key, token, ttlMs);
    if (!acquired) {
      this.logger.debug(`Skipped ${name}; another instance owns the scheduler lock`);
      return { executed: false, reason: 'locked' };
    }

    try {
      return { executed: true, value: await task() };
    } finally {
      const released = await this.redis.releaseLock(key, token);
      if (!released) {
        this.logger.warn(`Scheduler lock ${name} expired or ownership changed before release`);
      }
    }
  }
}
