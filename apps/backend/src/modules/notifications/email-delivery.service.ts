import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';
import { EmailService } from './email.service';

export interface EmailDeliveryRequest {
  eventKey: string;
  to: string | string[];
  subject: string;
  html: string;
  cc?: string | string[];
}

@Injectable()
export class EmailDeliveryService {
  private readonly logger = new Logger(EmailDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly schedulerLock: SchedulerLockService,
  ) {}

  enqueue(
    db: Prisma.TransactionClient | PrismaService,
    request: EmailDeliveryRequest,
  ) {
    return db.emailDelivery.upsert({
      where: { eventKey: request.eventKey },
      update: {},
      create: {
        eventKey: request.eventKey,
        recipient: { to: request.to, cc: request.cc ?? null },
        payload: { subject: request.subject, html: request.html },
      },
    });
  }

  @Cron('*/15 * * * * *', { name: 'email-delivery', timeZone: 'Asia/Ho_Chi_Minh' })
  processPending() {
    return this.schedulerLock.runExclusive('email-delivery', 30_000, () =>
      this.processBatch(),
    );
  }

  async processBatch(limit = 50) {
    const deliveries = await this.prisma.emailDelivery.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const delivery of deliveries) {
      const recipient = delivery.recipient as {
        to: string | string[];
        cc?: string | string[] | null;
      };
      const payload = delivery.payload as { subject: string; html: string };
      try {
        const result = await this.email.sendMail({
          to: recipient.to,
          cc: recipient.cc ?? undefined,
          subject: payload.subject,
          html: payload.html,
        });
        await this.prisma.emailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: result.skipped ? 'SKIPPED' : 'DELIVERED',
            attempts: { increment: 1 },
            providerMessageId: 'messageId' in result ? result.messageId : null,
            deliveredAt: result.skipped ? null : new Date(),
            lastError: null,
          },
        });
      } catch (error) {
        const attempts = delivery.attempts + 1;
        const delaySeconds = Math.min(1800, 2 ** Math.min(attempts, 10));
        await this.prisma.emailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'FAILED',
            attempts,
            nextAttemptAt: new Date(Date.now() + delaySeconds * 1000),
            lastError: (error as Error).message.substring(0, 1000),
          },
        });
        this.logger.error(
          `Email delivery ${delivery.eventKey} failed at attempt ${attempts}: ${(error as Error).message}`,
        );
      }
    }

    return { processed: deliveries.length };
  }
}
