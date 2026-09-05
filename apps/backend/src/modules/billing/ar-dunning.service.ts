import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { daysOverdue, policiesToApply } from './ar-dunning.util';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';
import { EmailDeliveryService } from '../notifications/email-delivery.service';
import { formatMoneyWithCode } from '../../common/utils/format-money';

@Injectable()
export class ArDunningService {
  private readonly logger = new Logger(ArDunningService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
    private emailDelivery: EmailDeliveryService,
    private schedulerLock: SchedulerLockService,
  ) {}

  async listPolicies() {
    return this.prisma.arDunningPolicy.findMany({
      orderBy: { level: 'asc' },
    });
  }

  @Cron('0 10 * * *', { name: 'ar-dunning-check', timeZone: 'Asia/Ho_Chi_Minh' })
  async runDunning(asOf: Date = new Date(), mallIds?: string[]) {
    return this.schedulerLock.runExclusive('ar-dunning-check', 14_400_000, () => this.runDunningUnlocked(asOf, mallIds));
  }

  private async runDunningUnlocked(asOf: Date, mallIds?: string[]) {
    const policies = await this.prisma.arDunningPolicy.findMany({
      where: { isActive: true },
      orderBy: { level: 'asc' },
    });

    if (!policies.length) {
      this.logger.warn('No AR dunning policies configured — skipping');
      return { processed: 0, notified: 0 };
    }

    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        isActive: true,
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
        dueDate: { lt: asOf },
        ...(mallIds ? { OR: [
          { mallId: { in: mallIds } },
          { contract: { unit: { mallId: { in: mallIds } } } },
          { billingParty: { mallId: { in: mallIds } } },
        ] } : {}),
      },
      include: {
        tenant: { select: { id: true, brandName: true, contactEmail: true, contactName: true } },
        billingParty: { select: { id: true, name: true, email: true } },
        payments: { where: { reversedAt: null }, select: { amount: true } },
      },
    });

    let notified = 0;

    for (const invoice of overdueInvoices) {
      const partyName = invoice.counterpartyName || invoice.tenant?.brandName || invoice.billingParty?.name || 'Đối tác';
      const partyEmail = invoice.tenant?.contactEmail || invoice.billingParty?.email;
      const overdueDays = daysOverdue(invoice.dueDate, asOf);
      if (overdueDays <= 0) continue;
      const adjustedTotal = Math.max(0, invoice.totalAmount + invoice.adjustmentAmount);
      const netPaid = Math.max(0, invoice.payments.reduce((sum, payment) => sum + payment.amount, 0) - invoice.refundedAmount);
      const outstanding = Math.max(0, adjustedTotal - netPaid);
      if (outstanding <= 0) continue;

      const sentLogs = await this.prisma.arDunningLog.findMany({
        where: { invoiceId: invoice.id },
      });
      const sentPolicyIds = new Set(sentLogs.map((l) => l.policyId));

      const toApply = policiesToApply(policies, overdueDays, sentPolicyIds);

      for (const policy of toApply) {
        if (policy.notifyFinance) {
          const financeUsers = await this.prisma.user.findMany({
            where: {
              role: 'FINANCE', isActive: true, deletedAt: null,
              ...(mallIds ? { mallAccess: { some: { isActive: true, mallId: { in: mallIds } } } } : {}),
            },
            select: { id: true },
          });
          for (const user of financeUsers) {
            await this.notificationsService.create({
              userId: user.id,
              title: `[AR L${policy.level}] ${partyName}`,
              body: `Hóa đơn ${invoice.invoiceNumber} quá hạn ${overdueDays} ngày — còn phải thu ${formatMoneyWithCode(outstanding, invoice.currencyCode)}`,
              type: 'AR_DUNNING',
              entityType: 'INVOICE',
              entityId: invoice.id,
            });
          }
        }

        if (policy.notifyTenant && partyEmail) {
          await this.emailDelivery.enqueue(this.prisma, {
              eventKey: `ar-dunning:${invoice.id}:policy:${policy.id}:tenant`,
              to: partyEmail,
              subject: `[THISO] Nhắc thanh toán hóa đơn ${invoice.invoiceNumber} (L${policy.level})`,
              html: this.emailService.invoiceOverdueHtml({
                tenantName: partyName,
                invoiceNumber: invoice.invoiceNumber,
                totalAmount: outstanding,
                dueDate: new Date(invoice.dueDate).toLocaleDateString('vi-VN'),
                daysOverdue: overdueDays,
                contactEmail: process.env.SMTP_USER ?? 'finance@thiso.com.vn',
                currencyCode: invoice.currencyCode,
              }),
            });
        }

        await this.prisma.arDunningLog.create({
          data: {
            invoiceId: invoice.id,
            policyId: policy.id,
            level: policy.level,
          },
        });

        notified++;
      }

      if (invoice.status !== 'OVERDUE') {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'OVERDUE' },
        });
        await this.prisma.serviceContractPayment.updateMany({ where: { invoiceId: invoice.id }, data: { status: 'OVERDUE', billingStatus: 'OVERDUE' } });
      }
    }

    this.logger.log(`AR dunning completed: ${overdueInvoices.length} invoices checked, ${notified} actions sent`);
    return { processed: overdueInvoices.length, notified };
  }

  async getLogsForInvoice(invoiceId: string) {
    return this.prisma.arDunningLog.findMany({
      where: { invoiceId },
      include: { policy: true },
      orderBy: { sentAt: 'desc' },
    });
  }
}
