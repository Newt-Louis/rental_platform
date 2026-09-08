import { ForbiddenException, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';
import { EmailService } from './email.service';
import { toPlainText } from './email-design-system';
import { MallAccessService } from '../../common/services/mall-access.service';

export interface EmailDeliveryRequest {
  eventKey: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  eventType?: string;
  entityType?: string;
  entityId?: string;
  mallId?: string;
}

@Injectable()
export class EmailDeliveryService {
  private readonly logger = new Logger(EmailDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly schedulerLock: SchedulerLockService,
    private readonly mallAccess?: MallAccessService,
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
        eventType: request.eventType,
        entityType: request.entityType,
        entityId: request.entityId,
        mallId: request.mallId,
        recipient: { to: request.to, cc: request.cc ?? null },
        payload: {
          subject: request.subject,
          html: request.html,
          text: request.text ?? toPlainText(request.html),
        },
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
      const payload = delivery.payload as { subject: string; html: string; text?: string };
      try {
        const result = await this.email.sendMail({
          to: recipient.to,
          cc: recipient.cc ?? undefined,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        });
        await this.prisma.emailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: result.skipped ? 'SKIPPED' : 'SENT',
            attempts: { increment: 1 },
            providerMessageId: 'messageId' in result ? result.messageId : null,
            deliveredAt: result.skipped ? null : new Date(),
            sentAt: result.skipped ? null : new Date(),
            lastAttemptAt: new Date(),
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
            lastAttemptAt: new Date(),
            nextAttemptAt: new Date(Date.now() + delaySeconds * 1000),
            lastError: this.sanitizeError(error),
          },
        });
        this.logger.error(
          `Email delivery ${delivery.eventKey} failed at attempt ${attempts}: ${this.sanitizeError(error)}`,
        );
      }
    }

    return { processed: deliveries.length };
  }

  private sanitizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message
      .split(/\r?\n/)[0]
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, '$1[redacted]@')
      .replace(/\b((?:pass(?:word)?|token|secret|auth(?:orization)?|username|user)[A-Za-z0-9_-]*)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
      .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
      .slice(0, 1000);
  }

  private async scope(user: any, mallId?: string) {
    if (!mallId) {
      if (this.mallAccess && !this.mallAccess.bypassesMallCheck(user.role)) {
        throw new ForbiddenException('Email delivery has no verifiable Mall ownership');
      }
      return;
    }
    if (this.mallAccess) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
  }

  private capabilities(row: any) {
    const identity = `${row.eventType ?? ''} ${row.eventKey ?? ''}`.toLowerCase();
    const passwordReset = /password[-_: ]?reset/.test(identity);
    const activation = /activation|portal[-_: ]?invitation/.test(identity);
    const tokenBased = passwordReset || activation;
    return {
      canRetry: row.status === 'FAILED' && !tokenBased,
      canResend: activation
        ? ['SENT', 'FAILED'].includes(row.status)
        : row.status === 'SENT' && !passwordReset,
      resendMode: passwordReset ? 'NOT_ALLOWED' : activation ? 'REGENERATE_DOMAIN_TOKEN' : 'PAYLOAD_REPLAY',
    };
  }

  private requireOperationId(operationId?: string) {
    const value = operationId?.trim();
    if (!value || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
      throw new BadRequestException('A valid Idempotency-Key is required');
    }
    return value;
  }

  private async createManualDelivery(
    original: any,
    user: any,
    kind: 'retry' | 'resend',
    operationId: string,
  ) {
    const eventKey = `${original.eventKey}:${kind}:${this.requireOperationId(operationId)}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const copy = await tx.emailDelivery.create({ data: {
          eventKey,
          eventType: original.eventType,
          entityType: original.entityType,
          entityId: original.entityId,
          mallId: original.mallId,
          recipient: original.recipient,
          payload: original.payload,
          originalDeliveryId: original.id,
          ...(kind === 'resend' ? { resendOfId: original.id } : {}),
        } as any });
        await tx.auditLog.create({ data: {
          userId: user.id,
          action: kind === 'retry' ? 'EMAIL_RETRY' : 'EMAIL_RESEND',
          entityType: 'EmailDelivery',
          entityId: copy.id,
          payload: JSON.stringify({ originalDeliveryId: original.id, mallId: original.mallId }),
          status: 'SUCCESS',
        } });
        return copy;
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const existing = await this.prisma.emailDelivery.findUnique({ where: { eventKey } });
      if (!existing) throw error;
      return existing;
    }
  }

  async list(query: any, user: any) {
    const malls = this.mallAccess ? await this.mallAccess.getAccessibleMallIds(user.id, user.role) : null;
    const where: any = {};
    if (malls) where.mallId = { in: malls };
    if (query.status) where.status = query.status;
    if (query.eventType) where.eventType = query.eventType;
    if (query.mallId) { await this.scope(user, query.mallId); where.mallId = query.mallId; }
    if (query.dateFrom || query.dateTo) where.createdAt = { ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}), ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}) };
    const rows = await this.prisma.emailDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    const filtered = query.recipient
      ? rows.filter((row: any) => JSON.stringify(row.recipient ?? '').toLowerCase().includes(String(query.recipient).toLowerCase()))
      : rows;
    return filtered.map((row: any) => {
      const recipient = row.recipient as { to?: string | string[] } | null;
      const payload = row.payload as { subject?: string } | null;
      return {
        ...row,
        recipient: Array.isArray(recipient?.to) ? recipient.to.join(', ') : recipient?.to ?? null,
        subject: payload?.subject ?? null,
        attemptCount: row.attempts,
        capabilities: this.capabilities(row),
      };
    });
  }

  async get(id: string, user: any) {
    const row = await this.prisma.emailDelivery.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Email delivery not found');
    await this.scope(user, (row as any).mallId);
    return { ...row, capabilities: this.capabilities(row) };
  }

  async preview(id: string, user: any) {
    const row: any = await this.get(id, user);
    const payload = row.payload as any;
    return { id: row.id, subject: payload.subject, html: payload.html, text: payload.text ?? toPlainText(payload.html) };
  }

  async retry(id: string, user: any, operationId: string) {
    const original: any = await this.get(id, user);
    if (!this.capabilities(original).canRetry) {
      throw new BadRequestException('This delivery cannot be retried');
    }
    return this.createManualDelivery(original, user, 'retry', operationId);
  }

  async resend(id: string, user: any, operationId: string) {
    const original: any = await this.get(id, user);
    const capabilities = this.capabilities(original);
    if (!capabilities.canResend || capabilities.resendMode !== 'PAYLOAD_REPLAY') {
      throw new BadRequestException('This delivery cannot be resent as stored payload');
    }
    const payload = original.payload as any;
    if (/activation|password.?reset|one.?time|otp|token/i.test(`${original.eventType ?? ''} ${payload.subject ?? ''}`)) {
      throw new BadRequestException('Token-based emails must use their authoritative token flow');
    }
    return this.createManualDelivery(original, user, 'resend', operationId);
  }

  async auditDomainResend(originalDeliveryId: string, deliveryId: string | undefined, sent: boolean, user: any) {
    if (!deliveryId) return;
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'EMAIL_RESEND',
        entityType: 'EmailDelivery',
        entityId: deliveryId,
        payload: JSON.stringify({ originalDeliveryId, resendMode: 'REGENERATE_DOMAIN_TOKEN', result: sent ? 'SENT' : 'FAILED' }),
        status: sent ? 'SUCCESS' : 'FAILURE',
      },
    });
  }
}
