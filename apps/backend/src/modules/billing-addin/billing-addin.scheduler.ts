import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PeriodicChargeType } from '@prisma/client';
import { BillingAddInService } from './billing-addin.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const CHARGE_TYPE_LABELS: Record<PeriodicChargeType, string> = {
  MANAGEMENT_FEE_SURCHARGE: 'Phụ thu Phí Quản Lý',
  UTILITY: 'Điện, Nước',
  AFTER_HOURS_COOLING: 'Điện lạnh ngoài giờ',
};

@Injectable()
export class BillingAddInScheduler {
  private readonly logger = new Logger(BillingAddInScheduler.name);

  constructor(
    private readonly billingAddInService: BillingAddInService,
    private readonly schedulerLock: SchedulerLockService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Chạy 05:00 ngày 1 hàng tháng — trước job lập hoá đơn của billing-scheduler.ts (06:00) để
  // vận hành có sẵn kỳ add-in ngay đầu kỳ, kịp nhập liệu/chốt trước khi Kế toán chạy job hoá đơn.
  @Cron('0 5 1 * *', { name: 'periodic-charge-generate-pending', timeZone: 'Asia/Ho_Chi_Minh' })
  async run() {
    const result = await this.schedulerLock.runExclusive('periodic-charge-generate-pending', 3_600_000, () =>
      this.billingAddInService.generatePendingForPeriod(),
    );
    if (result.executed && result.value.created) {
      this.logger.log(`Generated ${result.value.created} pending periodic charge entries for period ${result.value.period}`);
      await this.notifyOperationsOfNewEntries(result.value.entries, result.value.period);
    }
  }

  private async notifyOperationsOfNewEntries(
    entries: { id: string; mallId: string; contractNumber: string; chargeType: PeriodicChargeType }[],
    period: string,
  ) {
    const mallIds = Array.from(new Set(entries.map((e) => e.mallId)));
    const grants = await this.prisma.userMallAccess.findMany({
      where: { isActive: true, mallId: { in: mallIds }, user: { isActive: true, role: 'OPERATION' as any } },
      select: { mallId: true, userId: true },
    });
    if (!grants.length) {
      this.logger.warn(`No OPERATION users with UserMallAccess found for malls [${mallIds.join(', ')}] — new periodic charge entries generated with no one to notify`);
      return;
    }

    const operationIdsByMall = new Map<string, string[]>();
    for (const g of grants) {
      const list = operationIdsByMall.get(g.mallId) ?? [];
      list.push(g.userId);
      operationIdsByMall.set(g.mallId, list);
    }

    let notified = 0;
    for (const mallId of mallIds) {
      const mallEntries = entries.filter((e) => e.mallId === mallId);
      const userIds = operationIdsByMall.get(mallId) ?? [];
      if (!userIds.length) continue;
      const summary = mallEntries
        .map((e) => `${e.contractNumber} — ${CHARGE_TYPE_LABELS[e.chargeType]}`)
        .slice(0, 5)
        .join('; ');
      const more = mallEntries.length > 5 ? ` và ${mallEntries.length - 5} kỳ khác` : '';
      await Promise.all(
        userIds.map((userId) =>
          this.notificationsService.create({
            userId,
            title: `📋 ${mallEntries.length} kỳ add-in mới cần nhập liệu — ${period}`,
            body: `${summary}${more}`,
            type: 'BILLING_ADDIN',
            entityType: 'PERIODIC_CHARGE_ENTRY',
            entityId: mallEntries[0].id,
          }),
        ),
      );
      notified += userIds.length;
    }
    this.logger.log(`Notified ${notified} OPERATION recipient(s) across ${mallIds.length} mall(s) about new periodic charge entries`);
  }

  // Chạy 08:15 hàng ngày — sau nhóm nhắc nhở Contract Expiry (8:00-8:10) — nhắc vận hành các kỳ
  // add-in còn PENDING/DRAFT sắp đến hạn hoặc đã quá hạn, để không bỏ sót trước khi Kế toán xử lý.
  @Cron('15 8 * * *', { name: 'periodic-charge-due-reminder', timeZone: 'Asia/Ho_Chi_Minh' })
  async remindDueSoon() {
    return this.schedulerLock.runExclusive('periodic-charge-due-reminder', 10_800_000, () => this.remindDueSoonUnlocked());
  }

  private async remindDueSoonUnlocked() {
    const entries = await this.billingAddInService.listDueSoonOrOverdue(3);
    if (!entries.length) return;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mallIds = Array.from(new Set(entries.map((e) => e.contract.unit.mallId)));
    const grants = await this.prisma.userMallAccess.findMany({
      where: { isActive: true, mallId: { in: mallIds }, user: { isActive: true, role: 'OPERATION' as any } },
      select: { mallId: true, userId: true },
    });
    const operationIdsByMall = new Map<string, string[]>();
    for (const g of grants) {
      const list = operationIdsByMall.get(g.mallId) ?? [];
      list.push(g.userId);
      operationIdsByMall.set(g.mallId, list);
    }

    let reminded = 0;
    for (const entry of entries) {
      // Dedup theo ngày — không gửi lại nếu đã nhắc entry này hôm nay (theo pattern contract-expiry.scheduler.ts).
      const alreadySent = await this.prisma.notification.findFirst({
        where: { entityId: entry.id, entityType: 'PERIODIC_CHARGE_ENTRY', createdAt: { gte: startOfDay } },
      });
      if (alreadySent) continue;

      const userIds = operationIdsByMall.get(entry.contract.unit.mallId) ?? [];
      if (!userIds.length) continue;

      const overdue = entry.dueDate < today;
      const dueDateStr = new Date(entry.dueDate).toLocaleDateString('vi-VN');
      await Promise.all(
        userIds.map((userId) =>
          this.notificationsService.create({
            userId,
            title: overdue
              ? `⚠️ Kỳ add-in đã quá hạn — ${entry.contract.contractNumber}`
              : `⏰ Kỳ add-in sắp đến hạn — ${entry.contract.contractNumber}`,
            body: `${CHARGE_TYPE_LABELS[entry.chargeType]} kỳ ${entry.period} — hạn ${dueDateStr}. Vui lòng nhập liệu và chốt trước khi Kế toán xử lý.`,
            type: 'BILLING_ADDIN',
            entityType: 'PERIODIC_CHARGE_ENTRY',
            entityId: entry.id,
          }),
        ),
      );
      reminded++;
    }
    if (reminded) this.logger.log(`Sent ${reminded} periodic charge due/overdue reminder(s) to Operations`);
  }
}
