import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerLockService } from './scheduler-lock.service';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly schedulerLock: SchedulerLockService,
  ) {}

  enqueue(
    db: Prisma.TransactionClient,
    event: {
      eventKey: string;
      eventName: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
    },
  ) {
    return db.outboxEvent.upsert({
      where: { eventKey: event.eventKey },
      update: {},
      create: { ...event, payload: event.payload as Prisma.InputJsonValue },
    });
  }

  @Cron('*/10 * * * * *', { name: 'transactional-outbox', timeZone: 'Asia/Ho_Chi_Minh' })
  processPending() {
    return this.schedulerLock.runExclusive('transactional-outbox', 30_000, () =>
      this.processBatch(),
    );
  }

  async processBatch(limit = 50) {
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const event of events) {
      try {
        await this.eventEmitter.emitAsync(event.eventName, event.payload);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            attempts: { increment: 1 },
            lastError: null,
          },
        });
      } catch (error) {
        const attempts = event.attempts + 1;
        const delaySeconds = Math.min(300, 2 ** Math.min(attempts, 8));
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'FAILED',
            attempts,
            lastError: (error as Error).message.substring(0, 1000),
            nextAttemptAt: new Date(Date.now() + delaySeconds * 1000),
          },
        });
        this.logger.error(
          `Outbox ${event.eventKey} failed at attempt ${attempts}: ${(error as Error).message}`,
        );
      }
    }
    return { processed: events.length };
  }
}
