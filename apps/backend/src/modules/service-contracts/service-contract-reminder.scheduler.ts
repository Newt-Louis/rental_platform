import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ServiceContractStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';
import { getServiceContractDateWindow } from './service-contract-expiry';

@Injectable()
export class ServiceContractReminderScheduler {
  private readonly logger = new Logger(ServiceContractReminderScheduler.name);
  constructor(private prisma: PrismaService, private schedulerLock: SchedulerLockService) {}

  @Cron('0 8 * * *', { name: 'service-contract-reminders', timeZone: 'Asia/Ho_Chi_Minh' })
  async run() {
    return this.schedulerLock.runExclusive('service-contract-reminders', 14_400_000, () => this.runUnlocked());
  }

  private async transitionStatus(
    contractId: string,
    fromStatus: ServiceContractStatus,
    toStatus: ServiceContractStatus,
    description: string,
  ) {
    await this.prisma.$transaction(async tx => {
      const changed = await tx.serviceContract.updateMany({
        where: { id: contractId, isDeleted: false, status: fromStatus },
        data: { status: toStatus },
      });
      if (changed.count === 0) return;
      await tx.serviceContractEvent.create({
        data: {
          contractId,
          eventType: 'STATUS_CHANGED',
          description,
          oldValue: fromStatus,
          newValue: toStatus,
        },
      });
    });
  }

  private async runUnlocked() {
    const now = new Date();
    const { today, expiringThrough } = getServiceContractDateWindow(now);
    const paymentHorizon = new Date(now); paymentHorizon.setDate(paymentHorizon.getDate() + 31);
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const expiredContracts = await this.prisma.serviceContract.findMany({
      where: { isDeleted: false, status: { in: ['ACTIVE', 'EXPIRING'] }, endDate: { lt: today } },
      select: { id: true, status: true },
    });
    for (const contract of expiredContracts) {
      await this.transitionStatus(contract.id, contract.status, 'EXPIRED', 'Tự động hết hạn theo ngày kết thúc');
    }
    const noLongerExpiringContracts = await this.prisma.serviceContract.findMany({
      where: { isDeleted: false, status: 'EXPIRING', endDate: { gt: expiringThrough } },
      select: { id: true, status: true },
    });
    for (const contract of noLongerExpiringContracts) {
      await this.transitionStatus(contract.id, contract.status, 'ACTIVE', 'Tự động khôi phục hiệu lực vì còn trên 7 ngày đến ngày kết thúc');
    }
    const expiringContracts = await this.prisma.serviceContract.findMany({ where: { isDeleted: false, status: { in: ['ACTIVE', 'EXPIRING'] }, endDate: { gte: today, lte: expiringThrough } } });
    for (const contract of expiringContracts) {
      const userId = contract.ownerId || contract.createdById;
      const alreadySent = await this.prisma.notification.findFirst({ where: { userId, type: 'SERVICE_CONTRACT_EXPIRING', entityType: 'SERVICE_CONTRACT', entityId: contract.id, createdAt: { gte: startOfDay } }, select: { id: true } });
      if (!alreadySent) await this.prisma.notification.create({ data: { userId, type: 'SERVICE_CONTRACT_EXPIRING', title: 'Hợp đồng dịch vụ sắp hết hạn', body: `${contract.contractNumber} - ${contract.title}, hết hạn ${contract.endDate?.toLocaleDateString('vi-VN')}`, entityType: 'SERVICE_CONTRACT', entityId: contract.id } });
      if (contract.status === 'ACTIVE') await this.transitionStatus(contract.id, contract.status, 'EXPIRING', 'Tự động đánh dấu sắp hết hạn');
    }
    const payments = await this.prisma.serviceContractPayment.findMany({ where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }, reminderSentAt: null, dueDate: { lte: paymentHorizon }, contract: { isDeleted: false } }, include: { contract: true } });
    let sent = 0;
    for (const payment of payments) {
      const remindAt = new Date(payment.dueDate); remindAt.setDate(remindAt.getDate() - payment.reminderDays);
      if (remindAt > now) continue;
      const receivable = payment.contract.paymentDirection === 'RECEIVABLE'; const userId = payment.contract.ownerId || payment.contract.createdById;
      await this.prisma.$transaction([
        this.prisma.notification.create({ data: { userId, type: receivable ? 'SERVICE_CONTRACT_RECEIVABLE_DUE' : 'SERVICE_CONTRACT_PAYABLE_DUE', title: receivable ? 'Chuẩn bị thu tiền hợp đồng dịch vụ' : 'Chuẩn bị thanh toán hợp đồng dịch vụ', body: `${payment.contract.contractNumber} - ${payment.milestone}: ${payment.amount.toLocaleString('vi-VN')} ${payment.currency}, hạn ${payment.dueDate.toLocaleDateString('vi-VN')}`, entityType: 'SERVICE_CONTRACT', entityId: payment.contractId } }),
        this.prisma.serviceContractPayment.update({ where: { id: payment.id }, data: { reminderSentAt: now, status: payment.dueDate < now ? 'OVERDUE' : payment.status } }),
      ]);
      sent++;
    }
    if (sent) this.logger.log(`Created ${sent} service contract payment reminders`);
  }
}
