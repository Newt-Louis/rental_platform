import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateFitoutChangeOrderDto,
  CreateFitoutRiskDto,
  DecideFitoutChangeOrderDto,
  UpdateFitoutRiskDto,
} from './dto/fitout-controls.dto';

@Injectable()
export class FitoutControlsService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireProject(projectId: string) {
    const project = await this.prisma.fitoutProject.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new NotFoundException('Fitout project not found');
  }

  async listRisks(projectId: string, status?: string) {
    await this.requireProject(projectId);
    return this.prisma.fitoutRisk.findMany({
      where: { projectId, ...(status ? { status } : {}) },
      include: { owner: { select: { id: true, fullName: true } }, createdBy: { select: { id: true, fullName: true } } },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createRisk(projectId: string, dto: CreateFitoutRiskDto, userId: string) {
    await this.requireProject(projectId);
    const count = await this.prisma.fitoutRisk.count({ where: { projectId } });
    return this.prisma.fitoutRisk.create({
      data: {
        projectId,
        riskNumber: `RISK-${String(count + 1).padStart(3, '0')}`,
        ...dto,
        score: dto.probability * dto.impact,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        createdById: userId,
      },
    });
  }

  async updateRisk(projectId: string, riskId: string, dto: UpdateFitoutRiskDto) {
    const current = await this.prisma.fitoutRisk.findFirst({ where: { id: riskId, projectId } });
    if (!current) throw new NotFoundException('Fitout risk not found');
    const probability = dto.probability ?? current.probability;
    const impact = dto.impact ?? current.impact;
    return this.prisma.fitoutRisk.update({
      where: { id: riskId },
      data: {
        ...dto,
        score: probability * impact,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        closedAt: dto.status === 'CLOSED' ? new Date() : dto.status ? null : undefined,
      },
    });
  }

  async listChangeOrders(projectId: string, status?: string) {
    await this.requireProject(projectId);
    return this.prisma.fitoutChangeOrder.findMany({
      where: { projectId, ...(status ? { status } : {}) },
      include: {
        requestedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createChangeOrder(projectId: string, dto: CreateFitoutChangeOrderDto, userId: string) {
    await this.requireProject(projectId);
    const count = await this.prisma.fitoutChangeOrder.count({ where: { projectId } });
    return this.prisma.fitoutChangeOrder.create({
      data: {
        projectId,
        changeNumber: `CO-${String(count + 1).padStart(3, '0')}`,
        title: dto.title,
        description: dto.description,
        reason: dto.reason,
        costType: dto.costType ?? 'ADDITION',
        proposedAmount: new Prisma.Decimal(dto.proposedAmount),
        currency: dto.currency ?? 'VND',
        scheduleImpactDays: dto.scheduleImpactDays ?? 0,
        requestedById: userId,
        status: 'SUBMITTED',
      },
    });
  }

  async decideChangeOrder(
    projectId: string,
    changeId: string,
    dto: DecideFitoutChangeOrderDto,
    user: { id: string; role: Role },
  ) {
    const decisionRoles: Role[] = [Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION];
    if (!decisionRoles.includes(user.role)) {
      throw new ForbiddenException('Only authorized management roles can decide change orders');
    }
    const current = await this.prisma.fitoutChangeOrder.findFirst({ where: { id: changeId, projectId } });
    if (!current) throw new NotFoundException('Fitout change order not found');
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(current.status)) {
      throw new BadRequestException('Only submitted change orders can be decided');
    }
    if (dto.decision === 'APPROVED' && dto.approvedAmount === undefined) {
      throw new BadRequestException('approvedAmount is required for approval');
    }
    const now = new Date();
    return this.prisma.fitoutChangeOrder.update({
      where: { id: changeId },
      data: {
        status: dto.decision,
        approvedAmount: dto.decision === 'APPROVED' ? new Prisma.Decimal(dto.approvedAmount!) : null,
        approvedById: user.id,
        approvedAt: dto.decision === 'APPROVED' ? now : null,
        rejectedAt: dto.decision === 'REJECTED' ? now : null,
        decisionNote: dto.decisionNote,
      },
    });
  }

  async getSummary(projectId: string) {
    await this.requireProject(projectId);
    const [risks, changes] = await Promise.all([
      this.prisma.fitoutRisk.findMany({ where: { projectId }, select: { status: true, score: true } }),
      this.prisma.fitoutChangeOrder.findMany({
        where: { projectId },
        select: { status: true, costType: true, proposedAmount: true, approvedAmount: true, scheduleImpactDays: true },
      }),
    ]);
    const approved = changes.filter((item) => item.status === 'APPROVED');
    const signed = (item: (typeof approved)[number], amount: Prisma.Decimal | null) =>
      (item.costType === 'DEDUCTION' ? -1 : 1) * Number(amount ?? 0);
    return {
      risks: {
        total: risks.length,
        open: risks.filter((item) => item.status !== 'CLOSED').length,
        high: risks.filter((item) => item.status !== 'CLOSED' && item.score >= 15).length,
        critical: risks.filter((item) => item.status !== 'CLOSED' && item.score >= 20).length,
      },
      changes: {
        total: changes.length,
        pending: changes.filter((item) => ['SUBMITTED', 'UNDER_REVIEW'].includes(item.status)).length,
        proposedCostImpact: changes.reduce((sum, item) => sum + signed(item, item.proposedAmount), 0),
        approvedCostImpact: approved.reduce((sum, item) => sum + signed(item, item.approvedAmount), 0),
        approvedScheduleImpactDays: approved.reduce((sum, item) => sum + item.scheduleImpactDays, 0),
      },
    };
  }
}
