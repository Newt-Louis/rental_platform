import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractStatus } from '@prisma/client';

type ExpiryTier = 'CRITICAL' | 'WARNING' | 'UPCOMING' | 'EARLY_WARNING';

interface ExpiryBucket {
  type: `CONTRACT_EXPIRY_${ExpiryTier}`;
  label: string;
  minDays: number;
  maxDays: number;
}

const BUCKETS: ExpiryBucket[] = [
  { type: 'CONTRACT_EXPIRY_CRITICAL',      label: 'Sắp hết hạn (≤30 ngày)',   minDays: 0,   maxDays: 30 },
  { type: 'CONTRACT_EXPIRY_WARNING',       label: 'Sắp hết hạn (31-60 ngày)', minDays: 31,  maxDays: 60 },
  { type: 'CONTRACT_EXPIRY_UPCOMING',      label: 'Sắp hết hạn (61-90 ngày)', minDays: 61,  maxDays: 90 },
  { type: 'CONTRACT_EXPIRY_EARLY_WARNING', label: 'Hết hạn trong 180 ngày',   minDays: 91,  maxDays: 180 },
];

@Injectable()
export class ContractExpiryScheduler {
  private readonly logger = new Logger(ContractExpiryScheduler.name);

  constructor(private prisma: PrismaService) {}

  /** GAP #24 — Chạy mỗi ngày lúc 08:00 để kiểm tra hợp đồng sắp hết hạn */
  @Cron('0 8 * * *', { name: 'contract-expiry-check' })
  async checkContractExpiry(): Promise<{ notified: number; skipped: number }> {
    this.logger.log('Bắt đầu kiểm tra hợp đồng sắp hết hạn...');

    const now = new Date();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 180);

    const contracts = await this.prisma.contract.findMany({
      where: {
        isActive: true,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
        endDate: { gte: now, lte: horizon },
      },
      include: {
        tenant: { select: { id: true, brandName: true, contactEmail: true } },
        unit: { select: { id: true, code: true, mall: { select: { id: true, name: true } } } },
        managedBy: { select: { id: true, fullName: true } },
      },
    });

    if (contracts.length === 0) {
      this.logger.log('Không có hợp đồng nào sắp hết hạn');
      return { notified: 0, skipped: 0 };
    }

    const notifications: any[] = [];

    for (const contract of contracts) {
      const daysLeft = Math.ceil((contract.endDate.getTime() - now.getTime()) / 86_400_000);
      const bucket = BUCKETS.find((b) => daysLeft >= b.minDays && daysLeft <= b.maxDays);
      if (!bucket) continue;

      const body = `Hợp đồng ${contract.contractNumber} (${contract.tenant?.brandName ?? ''} — ${contract.unit?.code ?? ''}) còn ${daysLeft} ngày đến hết hạn (${contract.endDate.toLocaleDateString('vi-VN')}).`;

      // Notify assigned manager
      if (contract.managedById) {
        notifications.push({
          userId: contract.managedById,
          title: bucket.label,
          body,
          type: bucket.type,
          entityType: 'CONTRACT',
          entityId: contract.id,
        });
      }

      // Notify tenant
      if (contract.tenantId) {
        notifications.push({
          tenantId: contract.tenantId,
          title: 'Hợp đồng sắp hết hạn',
          body,
          type: bucket.type,
          entityType: 'CONTRACT',
          entityId: contract.id,
        });
      }
    }

    if (notifications.length === 0) {
      return { notified: 0, skipped: contracts.length };
    }

    await this.prisma.notification.createMany({ data: notifications, skipDuplicates: true });
    this.logger.log(`Đã tạo ${notifications.length} thông báo cho ${contracts.length} hợp đồng`);

    return { notified: notifications.length, skipped: 0 };
  }
}
