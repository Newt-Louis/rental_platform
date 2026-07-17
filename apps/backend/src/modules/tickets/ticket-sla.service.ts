import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketType, TicketPriority, Role } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

import { EmailService } from '../notifications/email.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';

@Injectable()
export class TicketSlaService {
  private readonly logger = new Logger(TicketSlaService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private emailService: EmailService,
    private schedulerLock: SchedulerLockService,
  ) {}

  async listPolicies() {
    return this.prisma.ticketSlaPolicy.findMany({
      where: { isActive: true },
      orderBy: [{ ticketType: 'asc' }, { priority: 'asc' }],
    });
  }

  async upsertPolicy(data: {
    ticketType: TicketType;
    priority: TicketPriority;
    responseHours: number;
    resolutionHours: number;
    escalateToRole?: Role;
  }) {
    return this.prisma.ticketSlaPolicy.upsert({
      where: {
        ticketType_priority: {
          ticketType: data.ticketType,
          priority: data.priority,
        },
      },
      create: { ...data, isActive: true },
      update: data,
    });
  }

  async getPolicy(ticketType: TicketType, priority: TicketPriority) {
    return this.prisma.ticketSlaPolicy.findUnique({
      where: { ticketType_priority: { ticketType, priority } },
    });
  }

  async computeSlaDueAt(ticketType: TicketType, priority: TicketPriority): Promise<Date | null> {
    const policy = await this.getPolicy(ticketType, priority);
    if (!policy) return null;

    const dueAt = new Date();
    dueAt.setHours(dueAt.getHours() + policy.resolutionHours);
    return dueAt;
  }

  @Cron('0 */2 * * *', { name: 'ticket-sla-check', timeZone: 'Asia/Ho_Chi_Minh' })
  async checkSlaBreaches() {
    return this.schedulerLock.runExclusive('ticket-sla-check', 5_400_000, () => this.checkSlaBreachesUnlocked());
  }

  private async checkSlaBreachesUnlocked() {
    this.logger.log('Checking ticket SLA breaches...');
    const now = new Date();

    const breachedTickets = await this.prisma.ticket.findMany({
      where: {
        isActive: true,
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        slaDueAt: { lt: now },
      },
      include: {
        tenant: { select: { brandName: true } },
        assignedTo: { select: { id: true, fullName: true } },
        escalations: { orderBy: { level: 'desc' }, take: 1 },
      },
    });

    let escalated = 0;

    for (const ticket of breachedTickets) {
      const lastLevel = ticket.escalations[0]?.level ?? 0;
      const nextLevel = lastLevel + 1;

      if (nextLevel > 3) continue;

      const policy = await this.getPolicy(ticket.type, ticket.priority);
      const escalateToRole = policy?.escalateToRole ?? (nextLevel >= 2 ? Role.MALL_DIRECTOR : Role.LEASING_MANAGER);

      await this.prisma.ticketEscalation.create({
        data: {
          ticketId: ticket.id,
          level: nextLevel,
          reason: `SLA breach L${nextLevel}: Ticket overdue`,
          escalatedTo: escalateToRole,
        },
      });

      if (ticket.assignedTo) {
        await this.notifications.create({
          userId: ticket.assignedTo.id,
          title: `⚠️ Ticket SLA breach L${nextLevel} — ${ticket.ticketNumber}`,
          body: `${ticket.subject} (${ticket.tenant.brandName}) has exceeded SLA`,
          type: 'TICKET_SLA_BREACH',
          entityType: 'TICKET',
          entityId: ticket.id,
        });
      }

      const managers = await this.prisma.user.findMany({
        where: { role: escalateToRole, isActive: true },
        select: { id: true, email: true, fullName: true },
        take: 3,
      });
      for (const mgr of managers) {
        await this.notifications.create({
          userId: mgr.id,
          title: `🚨 Ticket escalation L${nextLevel} — ${ticket.ticketNumber}`,
          body: `${ticket.subject} requires attention. ${ticket.tenant.brandName}`,
          type: 'TICKET_ESCALATION',
          entityType: 'TICKET',
          entityId: ticket.id,
        });

        if (mgr.email) {
          try {
            await this.emailService.sendMail({
              to: mgr.email,
              subject: `[THISO] Ticket SLA L${nextLevel} — ${ticket.ticketNumber}`,
              html: this.emailService.ticketSlaHtml({
                managerName: mgr.fullName,
                ticketNumber: ticket.ticketNumber,
                subject: ticket.subject,
                tenantName: ticket.tenant.brandName,
                level: nextLevel,
              }),
            });
          } catch (e) {
            this.logger.warn(`Ticket SLA email failed: ${e.message}`);
          }
        }
      }

      escalated++;
    }

    this.logger.log(`Ticket SLA check: ${breachedTickets.length} breached, ${escalated} escalated`);
  }

  async getStats() {
    const now = new Date();

    const [total, openTickets, breached, byPriority] = await Promise.all([
      this.prisma.ticket.count({ where: { isActive: true } }),
      this.prisma.ticket.findMany({
        where: { isActive: true, status: { notIn: ['RESOLVED', 'CLOSED'] } },
        select: { slaDueAt: true, resolvedAt: true, createdAt: true },
      }),
      this.prisma.ticket.count({
        where: {
          isActive: true,
          status: { notIn: ['RESOLVED', 'CLOSED'] },
          slaDueAt: { lt: now },
        },
      }),
      this.prisma.ticket.groupBy({
        by: ['priority'],
        where: { isActive: true },
        _count: true,
      }),
    ]);

    const resolvedTickets = await this.prisma.ticket.findMany({
      where: {
        isActive: true,
        status: { in: ['RESOLVED', 'CLOSED'] },
        resolvedAt: { not: null },
      },
      select: { createdAt: true, resolvedAt: true },
    });

    const avgResolutionHours =
      resolvedTickets.length > 0
        ? resolvedTickets.reduce((sum, t) => {
            const hours = (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3600000;
            return sum + hours;
          }, 0) / resolvedTickets.length
        : 0;

    const onTrack = openTickets.filter((t) => t.slaDueAt && t.slaDueAt > now).length;
    const slaComplianceRate = openTickets.length > 0 ? Math.round((onTrack / openTickets.length) * 100) : 100;

    return {
      total,
      open: openTickets.length,
      breached,
      slaComplianceRate,
      avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
      byPriority: byPriority.reduce((acc, p) => ({ ...acc, [p.priority]: p._count }), {}),
    };
  }
}
