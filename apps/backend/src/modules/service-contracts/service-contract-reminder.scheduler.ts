import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ServiceContractReminderScheduler {
  private readonly logger = new Logger(ServiceContractReminderScheduler.name);
  constructor(private prisma: PrismaService) {}

  @Cron('0 8 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async run() {
    const now = new Date(); const horizon = new Date(now); horizon.setDate(horizon.getDate() + 31);
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const expiringContracts = await this.prisma.serviceContract.findMany({ where: { isDeleted: false, status: { in: ['ACTIVE', 'EXPIRING'] }, endDate: { gte: now, lte: horizon } } });
    for (const contract of expiringContracts) {
      const userId = contract.ownerId || contract.createdById;
      const alreadySent = await this.prisma.notification.findFirst({ where: { userId, type: 'SERVICE_CONTRACT_EXPIRING', entityType: 'SERVICE_CONTRACT', entityId: contract.id, createdAt: { gte: startOfDay } }, select: { id: true } });
      if (!alreadySent) await this.prisma.notification.create({ data: { userId, type: 'SERVICE_CONTRACT_EXPIRING', title: 'Hợp đồng dịch vụ sắp hết hạn', body: `${contract.contractNumber} - ${contract.title}, hết hạn ${contract.endDate?.toLocaleDateString('vi-VN')}`, entityType: 'SERVICE_CONTRACT', entityId: contract.id } });
      if (contract.status === 'ACTIVE') await this.prisma.serviceContract.update({ where: { id: contract.id }, data: { status: 'EXPIRING' } });
    }
    const payments = await this.prisma.serviceContractPayment.findMany({ where: { status: { in: ['PENDING', 'OVERDUE'] }, reminderSentAt: null, dueDate: { lte: horizon }, contract: { isDeleted: false } }, include: { contract: true } });
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
