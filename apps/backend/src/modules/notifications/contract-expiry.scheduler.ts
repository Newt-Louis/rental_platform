import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import * as crypto from 'crypto';

@Injectable()
export class ContractExpiryScheduler {
  private readonly logger = new Logger(ContractExpiryScheduler.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
  ) {}

  // Chạy lúc 8:00 sáng mỗi ngày
  @Cron('0 8 * * *', { name: 'contract-expiry-check', timeZone: 'Asia/Ho_Chi_Minh' })
  async checkContractExpiry() {
    this.logger.log('Running contract expiry check...');

    const today = new Date();
    const thresholds = [180, 90, 60, 30];

    for (const daysLeft of thresholds) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysLeft);

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const contracts = await this.prisma.contract.findMany({
        where: {
          isActive: true,
          status: { in: ['ACTIVE', 'EXPIRING'] },
          endDate: { gte: startOfDay, lte: endOfDay },
        },
        include: {
          tenant: { select: { id: true, brandName: true, companyName: true, contactEmail: true, contactName: true } },
          unit: { select: { id: true, code: true } },
          managedBy: { select: { id: true, fullName: true, email: true } },
        },
      });

      for (const contract of contracts) {
        const notifKey = `CONTRACT_EXPIRY_${daysLeft}_${contract.id}`;
        const alreadySent = await this.prisma.notification.findFirst({
          where: { entityId: contract.id, entityType: 'CONTRACT', body: { contains: `${daysLeft} ngày` } },
        });
        if (alreadySent) continue;

        const endDateStr = new Date(contract.endDate).toLocaleDateString('vi-VN');

        // In-app notification cho manager phụ trách
        if (contract.managedBy?.id) {
          await this.notificationsService.create({
            userId: contract.managedBy.id,
            title: `⚠️ Hợp đồng sắp hết hạn — ${daysLeft} ngày`,
            body: `${contract.tenant.brandName} (lô ${contract.unit.code}) hết hạn ngày ${endDateStr}. Hợp đồng: ${contract.contractNumber}`,
            type: 'CONTRACT_EXPIRY',
            entityType: 'CONTRACT',
            entityId: contract.id,
          });
        }

        // Email cho manager phụ trách
        if (contract.managedBy?.email) {
          try {
            await this.emailService.sendMail({
              to: contract.managedBy.email,
              subject: `[THISO] Hợp đồng ${contract.contractNumber} còn ${daysLeft} ngày — ${contract.tenant.brandName}`,
              html: this.emailService.contractExpiryHtml({
                tenantName: contract.tenant.brandName,
                unitCode: contract.unit.code,
                contractNumber: contract.contractNumber,
                endDate: endDateStr,
                daysLeft,
                contactName: contract.managedBy.fullName,
              }),
            });
          } catch (e) {
            this.logger.warn(`Failed to send email for contract ${contract.id}: ${e.message}`);
          }
        }

        // Email cho khách thuê (nếu có email)
        if (contract.tenant.contactEmail && daysLeft <= 60) {
          try {
            await this.emailService.sendMail({
              to: contract.tenant.contactEmail,
              subject: `[THISO Mall] Hợp đồng thuê mặt bằng của ${contract.tenant.brandName} còn ${daysLeft} ngày`,
              html: this.emailService.contractExpiryHtml({
                tenantName: contract.tenant.brandName,
                unitCode: contract.unit.code,
                contractNumber: contract.contractNumber,
                endDate: endDateStr,
                daysLeft,
                contactName: contract.tenant.contactName ?? contract.tenant.brandName,
              }),
            });
          } catch (e) {
            this.logger.warn(`Failed to send tenant email for contract ${contract.id}: ${e.message}`);
          }
        }

        this.logger.log(`Notified: contract ${contract.contractNumber} expires in ${daysLeft} days (${contract.tenant.brandName})`);
      }
    }

    this.logger.log('Contract expiry check completed');
  }

  // Cron job 8:30 AM — tự tạo draft renewal proposal cho HĐ còn 90 ngày
  @Cron('30 8 * * *', { name: 'contract-renewal-proposals', timeZone: 'Asia/Ho_Chi_Minh' })
  async autoCreateRenewalProposals() {
    this.logger.log('Running auto renewal proposal creation...');
    const today = new Date();
    const target = new Date(today);
    target.setDate(target.getDate() + 90);
    target.setHours(0, 0, 0, 0);
    const targetEnd = new Date(target);
    targetEnd.setHours(23, 59, 59, 999);

    const contracts = await this.prisma.contract.findMany({
      where: {
        isActive: true,
        status: { in: ['ACTIVE', 'EXPIRING'] },
        endDate: { gte: target, lte: targetEnd },
      },
      include: {
        unit: { select: { id: true, code: true, areaNLA: true } },
        tenant: { select: { id: true, brandName: true } },
        managedBy: { select: { id: true } },
        // check existing renewal proposals
        proposal: { select: { id: true } },
      },
    });

    for (const contract of contracts) {
      // skip if renewal proposal already exists
      const existing = await this.prisma.proposal.findFirst({
        where: { tenantId: contract.tenantId, unitId: contract.unitId, status: 'DRAFT', notes: { contains: `[Renewal]` } },
      });
      if (existing) continue;

      const area = contract.unit.areaNLA;
      const rentPerSqm = area > 0 ? contract.rent / area : contract.rent;
      const camPerSqm = area > 0 ? contract.cam / area : contract.cam;
      const newStart = new Date(contract.endDate);
      newStart.setDate(newStart.getDate() + 1);

      const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
      const proposalNumber = `RNW-${new Date().getFullYear()}-${rand}`;

      const monthlyRent = rentPerSqm * area;
      const monthlyCAM = camPerSqm * area;

      await this.prisma.proposal.create({
        data: {
          proposalNumber,
          tenantId: contract.tenantId,
          unitId: contract.unitId,
          area,
          term: contract.term,
          startDate: newStart,
          endDate: new Date(newStart.getFullYear() + Math.floor(contract.term / 12), newStart.getMonth() + (contract.term % 12), newStart.getDate()),
          rentPerSqm,
          camPerSqm,
          deposit: 3,
          rentFree: 0,
          escalationPercent: contract.escalationPercent,
          revenueSharePercent: 0,
          marketingFee: 0,
          discount: 0,
          monthlyRent,
          monthlyCAM,
          depositAmount: monthlyRent * 3,
          totalContractValue: (monthlyRent + monthlyCAM) * contract.term,
          notes: `[Renewal] Tự động tạo từ HĐ ${contract.contractNumber} hết hạn ${new Date(contract.endDate).toLocaleDateString('vi-VN')}`,
          createdById: contract.managedById ?? contract.tenantId,
          status: 'DRAFT',
        },
      });

      if (contract.managedBy?.id) {
        await this.notificationsService.create({
          userId: contract.managedBy.id,
          title: `📋 Đề xuất gia hạn đã tạo — ${contract.tenant.brandName}`,
          body: `Hợp đồng ${contract.contractNumber} còn 90 ngày. Đề xuất gia hạn ${proposalNumber} đã được tạo tự động.`,
          type: 'CONTRACT_EXPIRY',
          entityType: 'CONTRACT',
          entityId: contract.id,
        });
      }

      this.logger.log(`Created renewal proposal ${proposalNumber} for contract ${contract.contractNumber}`);
    }

    this.logger.log('Renewal proposal creation completed');
  }

  // Cron job 7:30 AM — nhắc nhở follow-up CRM đến hạn hôm nay
  @Cron('30 7 * * *', { name: 'crm-followup-reminder', timeZone: 'Asia/Ho_Chi_Minh' })
  async remindFollowUps() {
    this.logger.log('Running CRM follow-up reminders...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const followUps = await this.prisma.leadFollowUp.findMany({
      where: {
        isDone: false,
        dueDate: { gte: today, lte: todayEnd },
      },
      include: {
        lead: { select: { id: true, brandName: true } },
        customer: { select: { id: true, companyName: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
    });

    for (const fu of followUps) {
      const target = fu.lead?.brandName ?? fu.customer?.companyName ?? 'Khách hàng';
      await this.notificationsService.create({
        userId: fu.assignedToId,
        title: `📞 Follow-up đến hạn hôm nay — ${target}`,
        body: fu.note ?? `Nhắc nhở follow-up với ${target}`,
        type: 'SYSTEM',
        entityType: 'CRM',
        entityId: fu.leadId ?? fu.customerId ?? fu.id,
      });
    }

    if (followUps.length) {
      this.logger.log(`Sent ${followUps.length} follow-up reminders`);
    }
  }

  // Cron job 8:05 AM — AI Proactive Insights gửi cho CEO/ADMIN
  @Cron('5 8 * * 1-5', { name: 'ai-proactive-insights', timeZone: 'Asia/Ho_Chi_Minh' })
  async sendAiProactiveInsights() {
    this.logger.log('Running AI proactive insights...');
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [overdueInvoices, expiringContracts, openTickets, units] = await Promise.all([
      this.prisma.invoice.count({ where: { isActive: true, status: 'OVERDUE' } }),
      this.prisma.contract.count({
        where: {
          isActive: true,
          status: { in: ['ACTIVE', 'EXPIRING'] },
          endDate: { lte: new Date(Date.now() + 30 * 86400000) },
        },
      }),
      this.prisma.ticket.count({ where: { isActive: true, status: { in: ['NEW', 'IN_PROGRESS'] } } }),
      this.prisma.unit.findMany({ where: { isActive: true }, select: { status: true } }),
    ]);

    const occupied = units.filter((u) => u.status === 'OCCUPIED').length;
    const occupancyRate = units.length > 0 ? ((occupied / units.length) * 100).toFixed(1) : '0';

    const prompt = `Dữ liệu vận hành THISO Mall hôm nay (${today.toLocaleDateString('vi-VN')}):
- Tỷ lệ lấp đầy: ${occupancyRate}% (${occupied}/${units.length} lô)
- Hóa đơn quá hạn: ${overdueInvoices} hóa đơn
- Hợp đồng hết hạn trong 30 ngày: ${expiringContracts} hợp đồng
- Ticket đang xử lý: ${openTickets} ticket

Hãy đưa ra 3 điểm cần chú ý quan trọng nhất và 2 hành động ưu tiên cho hôm nay. Ngắn gọn, xúc tích.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as any;
      const insight: string = data.content?.[0]?.text ?? '';
      if (!insight) return;

      const admins = await this.prisma.user.findMany({
        where: { isActive: true, role: { in: ['ADMIN', 'CEO', 'MALL_DIRECTOR'] as any } },
        select: { id: true },
      });

      await Promise.all(
        admins.map((u) =>
          this.notificationsService.create({
            userId: u.id,
            title: `🤖 AI Insights — ${today.toLocaleDateString('vi-VN')}`,
            body: insight.substring(0, 500),
            type: 'SYSTEM',
            entityType: 'SYSTEM',
            entityId: 'ai-insights',
          }),
        ),
      );

      this.logger.log(`AI proactive insights sent to ${admins.length} admins`);
    } catch (e) {
      this.logger.warn(`AI proactive insights failed: ${e.message}`);
    }
  }

  // Cron job hàng ngày lúc 9:00 — chỉ đánh dấu OVERDUE (dunning xử lý thông báo)
  @Cron('0 9 * * *', { name: 'invoice-overdue-mark', timeZone: 'Asia/Ho_Chi_Minh' })
  async markOverdueInvoices() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.prisma.invoice.updateMany({
      where: {
        isActive: true,
        status: 'ISSUED',
        dueDate: { lt: today },
      },
      data: { status: 'OVERDUE' },
    });

    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} invoices as OVERDUE`);
    }
  }
}
