import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import * as crypto from 'crypto';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';
import { EmailDeliveryService } from './email-delivery.service';

@Injectable()
export class ContractExpiryScheduler {
  private readonly logger = new Logger(ContractExpiryScheduler.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
    private emailDelivery: EmailDeliveryService,
    private schedulerLock: SchedulerLockService,
  ) {}

  // Chạy lúc 8:00 sáng mỗi ngày
  @Cron('0 8 * * *', { name: 'contract-expiry-check', timeZone: 'Asia/Ho_Chi_Minh' })
  async checkContractExpiry() {
    return this.schedulerLock.runExclusive('contract-expiry-check', 10_800_000, () => this.checkContractExpiryUnlocked());
  }

  private async checkContractExpiryUnlocked() {
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
          await this.emailDelivery.enqueue(this.prisma, {
              eventKey: `contract-expiry:${contract.id}:${daysLeft}:manager`,
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
        }

        // Email cho khách thuê (nếu có email)
        if (contract.tenant.contactEmail && daysLeft <= 60) {
          await this.emailDelivery.enqueue(this.prisma, {
              eventKey: `contract-expiry:${contract.id}:${daysLeft}:tenant`,
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
        }

        this.logger.log(`Notified: contract ${contract.contractNumber} expires in ${daysLeft} days (${contract.tenant.brandName})`);
      }
    }

    this.logger.log('Contract expiry check completed');
  }

  // Cron job 8:30 AM — tự tạo draft renewal proposal cho HĐ còn 90 ngày
  @Cron('30 8 * * *', { name: 'contract-renewal-proposals', timeZone: 'Asia/Ho_Chi_Minh' })
  async autoCreateRenewalProposals() {
    return this.schedulerLock.runExclusive('contract-renewal-proposals', 10_800_000, () => this.autoCreateRenewalProposalsUnlocked());
  }

  private async autoCreateRenewalProposalsUnlocked() {
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
    return this.schedulerLock.runExclusive('crm-followup-reminder', 10_800_000, () => this.remindFollowUpsUnlocked());
  }

  private async remindFollowUpsUnlocked() {
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
    return this.schedulerLock.runExclusive('ai-proactive-insights', 10_800_000, () => this.sendAiProactiveInsightsUnlocked());
  }

  // CR-101 Phase 3D (INV-AI-005): confirmed gap -- this job previously computed
  // ONE platform-wide aggregate (occupancy/overdue/expiring/tickets across ALL
  // Malls) and sent the SAME insight text to every ADMIN + CEO + MALL_DIRECTOR
  // recipient, regardless of which Mall(s) that recipient is actually
  // authorized for. A MALL_DIRECTOR assigned only to Mall A received
  // platform-wide figures including every other Mall.
  //
  // Fixed by partitioning: ADMIN/CEO (MallAccessService.BYPASS_ROLES --
  // existing, unchanged platform policy, not a new decision made here) keep
  // the original global aggregate/insight/recipient-list behavior exactly as
  // before. MALL_DIRECTOR is NOT a bypass role, so their `UserMallAccess`
  // grants are the authoritative Mall set -- the job now iterates by Mall (not
  // by recipient, per Section 19's "iterate Mall -> calculate Mall insight ->
  // deliver to authorized users" option, chosen over per-recipient-set
  // grouping since the query volume this bounds is small -- number of Malls,
  // not number of directors), computing and sending one AI call per Mall that
  // has at least one assigned director, to only that Mall's directors. A
  // director assigned to multiple Malls receives one notification per Mall --
  // intentional, not a duplicate-delivery bug.
  private async sendAiProactiveInsightsUnlocked() {
    this.logger.log('Running AI proactive insights...');
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    const today = new Date();

    await this.sendGlobalInsight(apiKey, today);
    await this.sendPerMallInsightsToDirectors(apiKey, today);
  }

  private async computeOperationalAggregate(mallId?: string) {
    const unitFilter = mallId ? { mallId } : {};
    const [overdueInvoices, expiringContracts, openTickets, units] = await Promise.all([
      this.prisma.invoice.count({ where: { isActive: true, status: 'OVERDUE', ...(mallId ? { mallId } : {}) } }),
      this.prisma.contract.count({
        where: {
          isActive: true,
          status: { in: ['ACTIVE', 'EXPIRING'] },
          endDate: { lte: new Date(Date.now() + 30 * 86400000) },
          ...(mallId ? { unit: { mallId } } : {}),
        },
      }),
      this.prisma.ticket.count({ where: { isActive: true, status: { in: ['NEW', 'IN_PROGRESS'] }, ...(mallId ? { unit: { mallId } } : {}) } }),
      this.prisma.unit.findMany({ where: { isActive: true, ...unitFilter }, select: { status: true } }),
    ]);

    const occupied = units.filter((u) => u.status === 'OCCUPIED').length;
    const occupancyRate = units.length > 0 ? ((occupied / units.length) * 100).toFixed(1) : '0';
    return { overdueInvoices, expiringContracts, openTickets, occupied, totalUnits: units.length, occupancyRate };
  }

  private buildPrompt(today: Date, agg: Awaited<ReturnType<ContractExpiryScheduler['computeOperationalAggregate']>>): string {
    return `Dữ liệu vận hành THISO Mall hôm nay (${today.toLocaleDateString('vi-VN')}):
- Tỷ lệ lấp đầy: ${agg.occupancyRate}% (${agg.occupied}/${agg.totalUnits} lô)
- Hóa đơn quá hạn: ${agg.overdueInvoices} hóa đơn
- Hợp đồng hết hạn trong 30 ngày: ${agg.expiringContracts} hợp đồng
- Ticket đang xử lý: ${agg.openTickets} ticket

Hãy đưa ra 3 điểm cần chú ý quan trọng nhất và 2 hành động ưu tiên cho hôm nay. Ngắn gọn, xúc tích.`;
  }

  private async callInsightModel(apiKey: string, prompt: string): Promise<string | null> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return data.content?.[0]?.text ?? null;
  }

  // Unchanged behavior for ADMIN/CEO -- both are MallAccessService.BYPASS_ROLES
  // (unrestricted access platform-wide already), so the global aggregate is
  // exactly their currently-effective authorized scope, not a new policy.
  private async sendGlobalInsight(apiKey: string, today: Date) {
    try {
      const agg = await this.computeOperationalAggregate();
      const insight = await this.callInsightModel(apiKey, this.buildPrompt(today, agg));
      if (!insight) return;

      const recipients = await this.prisma.user.findMany({
        where: { isActive: true, role: { in: ['ADMIN', 'CEO'] as any } },
        select: { id: true },
      });

      await Promise.all(
        recipients.map((u) =>
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

      this.logger.log(`AI proactive insights (global) sent to ${recipients.length} ADMIN/CEO recipients`);
    } catch (e) {
      this.logger.warn(`AI proactive insights (global) failed: ${e.message}`);
    }
  }

  private async sendPerMallInsightsToDirectors(apiKey: string, today: Date) {
    const grants = await this.prisma.userMallAccess.findMany({
      where: { isActive: true, user: { isActive: true, role: 'MALL_DIRECTOR' as any } },
      select: { mallId: true, userId: true },
    });
    if (grants.length === 0) return;

    const directorIdsByMall = new Map<string, string[]>();
    for (const g of grants) {
      const list = directorIdsByMall.get(g.mallId) ?? [];
      list.push(g.userId);
      directorIdsByMall.set(g.mallId, list);
    }

    let totalSent = 0;
    for (const [mallId, directorIds] of directorIdsByMall) {
      try {
        const agg = await this.computeOperationalAggregate(mallId);
        const insight = await this.callInsightModel(apiKey, this.buildPrompt(today, agg));
        if (!insight) continue;

        await Promise.all(
          directorIds.map((userId) =>
            this.notificationsService.create({
              userId,
              title: `🤖 AI Insights — ${today.toLocaleDateString('vi-VN')}`,
              body: insight.substring(0, 500),
              type: 'SYSTEM',
              entityType: 'SYSTEM',
              entityId: 'ai-insights',
            }),
          ),
        );
        totalSent += directorIds.length;
      } catch (e) {
        // One Mall's failure must not block the others -- matches the
        // existing top-level try/catch's "don't let AI provider errors break
        // the scheduled job" behavior, now scoped per Mall.
        this.logger.warn(`AI proactive insights (Mall ${mallId}) failed: ${e.message}`);
      }
    }
    this.logger.log(`AI proactive insights (per-Mall) sent to ${totalSent} MALL_DIRECTOR notifications across ${directorIdsByMall.size} Malls`);
  }

  // Cron job hàng ngày lúc 9:00 — chỉ đánh dấu OVERDUE (dunning xử lý thông báo)
  @Cron('0 9 * * *', { name: 'invoice-overdue-mark', timeZone: 'Asia/Ho_Chi_Minh' })
  async markOverdueInvoices() {
    return this.schedulerLock.runExclusive('invoice-overdue-mark', 10_800_000, () => this.markOverdueInvoicesUnlocked());
  }

  private async markOverdueInvoicesUnlocked() {
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
