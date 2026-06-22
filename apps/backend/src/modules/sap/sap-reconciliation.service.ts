import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class SapReconciliationService {
  constructor(private prisma: PrismaService) {}

  private buildIdempotencyKey(entityType: string, entityId: string, action: string) {
    return `${entityType}:${entityId}:${action}`;
  }

  async listRecords(query: { status?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * +limit;
    const where = status ? { status } : {};

    const [data, total] = await Promise.all([
      this.prisma.sapReconciliationRecord.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sapReconciliationRecord.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async reconcilePending() {
    const logs = await this.prisma.sapIntegrationLog.findMany({
      where: { status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    let matched = 0;
    let mismatched = 0;

    for (const log of logs) {
      const idempotencyKey =
        log.idempotencyKey ?? this.buildIdempotencyKey(log.entityType, log.entityId, log.endpoint);

      const existing = await this.prisma.sapReconciliationRecord.findUnique({
        where: { idempotencyKey },
      });
      if (existing) continue;

      let ourAmount = 0;
      if (log.entityType === 'INVOICE') {
        const invoice = await this.prisma.invoice.findUnique({ where: { id: log.entityId } });
        ourAmount = invoice?.totalAmount ?? 0;
      }

      let sapAmount: number | null = null;
      let status = 'PENDING';
      try {
        const response = log.response ? JSON.parse(log.response) : null;
        sapAmount = response?.amount ?? response?.data?.amount ?? ourAmount;
        status = sapAmount !== null && Math.abs(sapAmount - ourAmount) < 1 ? 'MATCHED' : 'MISMATCH';
      } catch {
        status = ourAmount > 0 ? 'MISMATCH' : 'PENDING';
      }

      await this.prisma.sapReconciliationRecord.create({
        data: {
          entityType: log.entityType,
          entityId: log.entityId,
          sapRef: `SAP-${log.id.slice(0, 8)}`,
          ourAmount,
          sapAmount,
          status,
          idempotencyKey,
          reconciledAt: status === 'MATCHED' ? new Date() : null,
        },
      });

      if (status === 'MATCHED') matched++;
      else if (status === 'MISMATCH') mismatched++;
    }

    return { matched, mismatched, processed: matched + mismatched };
  }

  ensureIdempotencyKey(entityType: string, entityId: string, action: string) {
    return this.buildIdempotencyKey(entityType, entityId, action);
  }

  generateUniqueKey() {
    return crypto.randomUUID();
  }
}
