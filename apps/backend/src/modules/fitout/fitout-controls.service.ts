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
  private static readonly MAX_SERIALIZABLE_ATTEMPTS = 3;

  constructor(private readonly prisma: PrismaService) {}

  private async runSerializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= FitoutControlsService.MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: any) {
        const retryable = error?.code === 'P2002' || error?.code === 'P2034';
        if (!retryable || attempt === FitoutControlsService.MAX_SERIALIZABLE_ATTEMPTS) throw error;
      }
    }
    throw new Error('Serializable transaction retry exhausted');
  }

  private async requireProject(projectId: string) {
    const project = await this.prisma.fitoutProject.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new NotFoundException('Fitout project not found');
  }

  private toLegacyExactNumber(value: string) {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isInteger() || decimal.abs().greaterThan(Number.MAX_SAFE_INTEGER)) return null;
    return decimal.toNumber();
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
    return this.runSerializable(async (tx) => {
      const count = await tx.fitoutRisk.count({ where: { projectId } });
      return tx.fitoutRisk.create({
        data: {
          projectId,
          riskNumber: `RISK-${String(count + 1).padStart(3, '0')}`,
          ...dto,
          score: dto.probability * dto.impact,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          createdById: userId,
        },
      });
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
    return this.runSerializable(async (tx) => {
      const count = await tx.fitoutChangeOrder.count({ where: { projectId } });
      return tx.fitoutChangeOrder.create({
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
    if (dto.decision === 'APPROVED' && dto.approvedAmount === undefined) {
      throw new BadRequestException('approvedAmount is required for approval');
    }
    try {
      return await this.runSerializable(async (tx) => {
        const current = await tx.fitoutChangeOrder.findFirst({ where: { id: changeId, projectId } });
        if (!current) throw new NotFoundException('Fitout change order not found');
        if (current.status === dto.decision) return current;
        if (!['SUBMITTED', 'UNDER_REVIEW'].includes(current.status)) {
          throw new BadRequestException(`Change order was already decided as ${current.status}`);
        }
        const now = new Date();
        return tx.fitoutChangeOrder.update({
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
      });
    } catch (error: any) {
      if (error?.code === 'P2034') {
        const winner = await this.prisma.fitoutChangeOrder.findFirst({ where: { id: changeId, projectId } });
        if (winner?.status === dto.decision) return winner;
        if (winner && ['APPROVED', 'REJECTED'].includes(winner.status)) {
          throw new BadRequestException(`Change order was already decided as ${winner.status}`);
        }
      }
      throw error;
    }
  }

  async getSummary(projectId: string) {
    await this.requireProject(projectId);
    const [risks, changes] = await Promise.all([
      this.prisma.fitoutRisk.findMany({ where: { projectId }, select: { status: true, score: true } }),
      this.prisma.fitoutChangeOrder.findMany({
        where: { projectId },
        select: { status: true, costType: true, proposedAmount: true, approvedAmount: true, currency: true, scheduleImpactDays: true },
      }),
    ]);
    const approved = changes.filter((item) => item.status === 'APPROVED');
    const grouped = new Map<string, { proposed: Prisma.Decimal; approved: Prisma.Decimal }>();
    for (const item of changes) {
      const bucket = grouped.get(item.currency) ?? {
        proposed: new Prisma.Decimal(0),
        approved: new Prisma.Decimal(0),
      };
      const sign = item.costType === 'DEDUCTION' ? -1 : 1;
      bucket.proposed = bucket.proposed.plus(item.proposedAmount.mul(sign));
      if (item.status === 'APPROVED' && item.approvedAmount) {
        bucket.approved = bucket.approved.plus(item.approvedAmount.mul(sign));
      }
      grouped.set(item.currency, bucket);
    }
    const costByCurrency = Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, totals]) => ({
        currency,
        proposedCostImpact: totals.proposed.toFixed(2),
        approvedCostImpact: totals.approved.toFixed(2),
      }));
    const singleCurrency = costByCurrency.length === 1 ? costByCurrency[0] : null;
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
        proposedCostImpact: singleCurrency ? this.toLegacyExactNumber(singleCurrency.proposedCostImpact) : null,
        approvedCostImpact: singleCurrency ? this.toLegacyExactNumber(singleCurrency.approvedCostImpact) : null,
        costByCurrency,
        approvedScheduleImpactDays: approved.reduce((sum, item) => sum + item.scheduleImpactDays, 0),
      },
    };
  }
}
