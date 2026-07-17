import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';
import { EmailDeliveryService } from '../notifications/email-delivery.service';

@Injectable()
export class FitoutSlaService {
  private readonly logger = new Logger(FitoutSlaService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private emailService: EmailService,
    private emailDelivery: EmailDeliveryService,
    private schedulerLock: SchedulerLockService,
  ) {}

  async listPolicies() {
    return this.prisma.fitoutSlaPolicy.findMany({
      where: { isActive: true },
      orderBy: { stage: 'asc' },
    });
  }

  async upsertPolicy(data: {
    stage: string;
    targetDays: number;
    warningDays: number;
    escalateToRole?: Role;
  }) {
    return this.prisma.fitoutSlaPolicy.upsert({
      where: { stage: data.stage },
      create: { ...data, isActive: true },
      update: data,
    });
  }

  async recordMilestone(projectId: string, stage: string) {
    const policy = await this.prisma.fitoutSlaPolicy.findUnique({
      where: { stage },
    });

    const targetDate = policy
      ? new Date(Date.now() + policy.targetDays * 24 * 60 * 60 * 1000)
      : null;

    return this.prisma.fitoutMilestone.upsert({
      where: { projectId_stage: { projectId, stage } },
      create: {
        projectId,
        stage,
        startedAt: new Date(),
        targetDate,
        slaDays: policy?.targetDays,
      },
      update: {
        startedAt: new Date(),
        targetDate,
        slaDays: policy?.targetDays,
        completedAt: null,
        isOverdue: false,
      },
    });
  }

  async completeMilestone(projectId: string, stage: string) {
    const milestone = await this.prisma.fitoutMilestone.findUnique({
      where: { projectId_stage: { projectId, stage } },
    });

    if (milestone) {
      return this.prisma.fitoutMilestone.update({
        where: { id: milestone.id },
        data: { completedAt: new Date() },
      });
    }
  }

  @Cron('0 8 * * *', { name: 'fitout-sla-check', timeZone: 'Asia/Ho_Chi_Minh' })
  async checkSlaBreaches() {
    return this.schedulerLock.runExclusive('fitout-sla-check', 14_400_000, () => this.checkSlaBreachesUnlocked());
  }

  private async checkSlaBreachesUnlocked() {
    this.logger.log('Checking fitout SLA breaches...');
    const now = new Date();

    const overdueMilestones = await this.prisma.fitoutMilestone.findMany({
      where: {
        completedAt: null,
        targetDate: { lt: now },
        isOverdue: false,
      },
      include: {
        project: {
          include: {
            tenant: true,
            unit: { select: { code: true } },
            operationManager: true,
          },
        },
      },
    });

    for (const milestone of overdueMilestones) {
      await this.prisma.fitoutMilestone.update({
        where: { id: milestone.id },
        data: { isOverdue: true, escalatedAt: now },
      });

      const policy = await this.prisma.fitoutSlaPolicy.findUnique({
        where: { stage: milestone.stage },
      });
      const stageConfig = await this.prisma.fitoutStageConfig.findUnique({
        where: { code: milestone.stage },
      });
      const stageName = stageConfig?.name ?? milestone.stage;
      const targetDateStr = milestone.targetDate?.toLocaleDateString('vi-VN') ?? '—';

      if (milestone.project.operationManagerId && milestone.project.operationManager) {
        await this.notifications.create({
          userId: milestone.project.operationManagerId,
          title: `⚠️ Fitout SLA breach — ${milestone.project.tenant.brandName}`,
          body: `Stage ${stageName} is overdue. Target was ${targetDateStr}`,
          type: 'FITOUT_SLA_BREACH',
          entityType: 'FITOUT',
          entityId: milestone.projectId,
        });

        if (milestone.project.operationManager.email) {
          await this.emailDelivery.enqueue(this.prisma, {
            eventKey: `fitout-sla:${milestone.id}:manager:${milestone.project.operationManagerId}`,
            to: milestone.project.operationManager.email,
            subject: `⚠️ Fitout SLA breach — ${milestone.project.tenant.brandName}`,
            html: this.emailService.fitoutSlaHtml({
              managerName: milestone.project.operationManager.fullName,
              tenantName: milestone.project.tenant.brandName,
              unitCode: milestone.project.unit.code,
              stageName,
              targetDate: targetDateStr,
              isEscalation: false,
            }),
          });
        }
      }

      if (policy?.escalateToRole) {
        const managers = await this.prisma.user.findMany({
          where: { role: policy.escalateToRole, isActive: true },
        });
        for (const mgr of managers) {
          await this.notifications.create({
            userId: mgr.id,
            title: `🚨 Fitout escalation — ${milestone.project.tenant.brandName}`,
            body: `Stage ${stageName} escalated. Project has exceeded SLA.`,
            type: 'FITOUT_ESCALATION',
            entityType: 'FITOUT',
            entityId: milestone.projectId,
          });

          if (mgr.email) {
            await this.emailDelivery.enqueue(this.prisma, {
              eventKey: `fitout-sla:${milestone.id}:escalation:${mgr.id}`,
              to: mgr.email,
              subject: `🚨 Fitout escalation — ${milestone.project.tenant.brandName}`,
              html: this.emailService.fitoutSlaHtml({
                managerName: mgr.fullName,
                tenantName: milestone.project.tenant.brandName,
                unitCode: milestone.project.unit.code,
                stageName,
                targetDate: targetDateStr,
                isEscalation: true,
              }),
            });
          }
        }
      }
    }

    this.logger.log(`Processed ${overdueMilestones.length} fitout SLA breaches`);
  }

  async getProjectMilestones(projectId: string) {
    return this.prisma.fitoutMilestone.findMany({
      where: { projectId },
      orderBy: { startedAt: 'asc' },
    });
  }

  async getFitoutProgress() {
    const stages = await this.prisma.fitoutStageConfig.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
    const stageCodes = stages.map((s) => s.code);
    const lastStageCode = stageCodes[stageCodes.length - 1];

    const projects = await this.prisma.fitoutProject.findMany({
      where: { status: { not: lastStageCode } },
      include: {
        tenant: { select: { brandName: true } },
        unit: { select: { code: true } },
        milestones: true,
      },
    });

    return projects.map((p) => {
      const currentIdx = stageCodes.indexOf(p.status);
      const progress = stageCodes.length > 1 && currentIdx >= 0
        ? Math.round((currentIdx / (stageCodes.length - 1)) * 100)
        : 0;
      const overdueMilestones = p.milestones.filter((m) => m.isOverdue);

      return {
        id: p.id,
        tenant: p.tenant.brandName,
        unit: p.unit.code,
        status: p.status,
        progress,
        expectedOpenDate: p.expectedOpenDate,
        overdueCount: overdueMilestones.length,
        isAtRisk: overdueMilestones.length > 0,
      };
    });
  }
}
