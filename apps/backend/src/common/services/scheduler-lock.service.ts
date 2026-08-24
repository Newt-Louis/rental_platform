import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hostname } from 'os';
import { RedisService } from './redis.service';
import { PrismaService } from '../../prisma/prisma.service';

export type SchedulerLockResult<T> =
  | { executed: true; value: T }
  | { executed: false; reason: 'locked' };

/**
 * Job execution ledger (docs/reliability/OBSERVABILITY.md, sprint brief
 * section 25) is written here rather than in each of the ~14 individual job
 * files: every scheduled job in the codebase already routes through
 * runExclusive() for its distributed lock, so instrumenting this one place
 * gives ledger coverage for all of them for free, with zero changes to the
 * job files themselves. Ledger writes are best-effort — a database hiccup
 * recording history never blocks or fails the actual job.
 */
@Injectable()
export class SchedulerLockService {
  private readonly logger = new Logger(SchedulerLockService.name);
  private warnedWithoutRedis = false;
  private readonly instanceId = `${hostname()}:${process.pid}`;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

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
      return this.runAndRecord(name, task);
    }

    const key = `scheduler:lock:${name}`;
    const token = randomUUID();
    const acquired = await this.redis.acquireLock(key, token, ttlMs);
    if (!acquired) {
      this.logger.debug(`Skipped ${name}; another instance owns the scheduler lock`);
      await this.recordSkipped(name);
      return { executed: false, reason: 'locked' };
    }

    try {
      return await this.runAndRecord(name, task);
    } finally {
      const released = await this.redis.releaseLock(key, token);
      if (!released) {
        this.logger.warn(`Scheduler lock ${name} expired or ownership changed before release`);
      }
    }
  }

  private async runAndRecord<T>(name: string, task: () => Promise<T>): Promise<SchedulerLockResult<T>> {
    const startedAt = Date.now();
    const executionId = await this.recordStart(name);
    try {
      const value = await task();
      await this.recordFinish(executionId, 'SUCCEEDED', startedAt);
      return { executed: true, value };
    } catch (error: any) {
      await this.recordFinish(executionId, 'FAILED', startedAt, error?.message);
      throw error;
    }
  }

  private async recordStart(jobName: string): Promise<string | null> {
    try {
      const row = await this.prisma.jobExecution.create({
        data: { jobName, instance: this.instanceId, status: 'RUNNING' },
        select: { id: true },
      });
      return row.id;
    } catch (error: any) {
      this.logger.warn(`Failed to record job-execution start for ${jobName}: ${error.message}`);
      return null;
    }
  }

  private async recordFinish(
    executionId: string | null,
    status: 'SUCCEEDED' | 'FAILED',
    startedAt: number,
    errorMessage?: string,
  ) {
    if (!executionId) return;
    try {
      await this.prisma.jobExecution.update({
        where: { id: executionId },
        data: {
          status,
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          errorSummary: errorMessage ? errorMessage.slice(0, 500) : undefined,
        },
      });
    } catch (error: any) {
      this.logger.warn(`Failed to record job-execution finish: ${error.message}`);
    }
  }

  private async recordSkipped(jobName: string) {
    try {
      await this.prisma.jobExecution.create({
        data: {
          jobName,
          instance: this.instanceId,
          status: 'SKIPPED_LOCKED',
          finishedAt: new Date(),
          durationMs: 0,
        },
      });
    } catch (error: any) {
      this.logger.warn(`Failed to record skipped job-execution for ${jobName}: ${error.message}`);
    }
  }
}
