import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { FitoutStatus, Role } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

const STAGE_ORDER: FitoutStatus[] = [
  'CONTRACT_SIGNED',
  'SUBMIT_DESIGN',
  'DESIGN_REVIEW',
  'FIRE_SAFETY_REVIEW',
  'CONSTRUCTION_PERMIT',
  'FITOUT_IN_PROGRESS',
  'INSPECTION',
  'APPROVED_TO_OPEN',
  'OPENED',
];

@Injectable()
export class FitoutSlaService {
  private readonly logger = new Logger(FitoutSlaService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async listPolicies() {
    return this.prisma.fitoutSlaPolicy.findMany({
      where: { isActive: true },
      orderBy: { stage: 'asc' },
    });
  }

  async upsertPolicy(data: {
    stage: FitoutStatus;
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

  async recordMilestone(projectId: string, stage: FitoutStatus) {
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

  async completeMilestone(projectId: string, stage: FitoutStatus) {
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

      if (milestone.project.operationManagerId) {
        await this.notifications.create({
          userId: milestone.project.operationManagerId,
          title: `⚠️ Fitout SLA breach — ${milestone.project.tenant.brandName}`,
          body: `Stage ${milestone.stage} is overdue. Target was ${milestone.targetDate?.toLocaleDateString('vi-VN')}`,
          type: 'FITOUT_SLA_BREACH',
          entityType: 'FITOUT',
          entityId: milestone.projectId,
        });
      }

      if (policy?.escalateToRole) {
        const managers = await this.prisma.user.findMany({
          where: { role: policy.escalateToRole, isActive: true },
        });
        for (const mgr of managers) {
          await this.notifications.create({
            userId: mgr.id,
            title: `🚨 Fitout escalation — ${milestone.project.tenant.brandName}`,
            body: `Stage ${milestone.stage} escalated. Project has exceeded SLA.`,
            type: 'FITOUT_ESCALATION',
            entityType: 'FITOUT',
            entityId: milestone.projectId,
          });
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
    const projects = await this.prisma.fitoutProject.findMany({
      where: { status: { not: 'OPENED' } },
      include: {
        tenant: { select: { brandName: true } },
        unit: { select: { code: true } },
        milestones: true,
      },
    });

    return projects.map((p) => {
      const currentIdx = STAGE_ORDER.indexOf(p.status);
      const progress = Math.round((currentIdx / (STAGE_ORDER.length - 1)) * 100);
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
