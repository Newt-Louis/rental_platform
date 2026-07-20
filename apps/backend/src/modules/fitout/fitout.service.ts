import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatus } from '@prisma/client';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { FitoutStageConfigService } from './fitout-stage-config.service';
import { FitoutDocumentsService } from './fitout-documents.service';
import { FitoutSlaService } from './fitout-sla.service';

interface ContractActivatedEvent {
  contractId: string;
  tenantId: string;
  unitId: string;
  handoverDate: Date | null;
  openingDate: Date | null;
}

interface CurrentUser {
  id: string;
  role: string;
  tenantId?: string | null;
}

@Injectable()
export class FitoutService {
  private readonly logger = new Logger(FitoutService.name);

  constructor(
    private prisma: PrismaService,
    private unitStatus: UnitStatusService,
    private stageConfig: FitoutStageConfigService,
    private documentsService: FitoutDocumentsService,
    private slaService: FitoutSlaService,
  ) {}

  async findAll(query: { status?: string; tenantId?: string; mallIds?: string[]; page?: number; limit?: number }, currentUser?: CurrentUser) {
    const { page = 1, limit = 20, ...filters } = query;
    const skip = (page - 1) * +limit;

    const where: any = {};
    if (query.mallIds && currentUser?.role !== 'TENANT') {
      where.unit = { OR: [{ mallId: { in: query.mallIds } }, { floor: { mallId: { in: query.mallIds } } }] };
    }
    if (filters.status) where.status = filters.status;
    if (currentUser?.role === 'TENANT') {
      // Không tin tưởng tenantId client gửi lên — luôn ép theo tenant của người đăng nhập.
      where.tenantId = currentUser.tenantId ?? '__none__';
    } else if (filters.tenantId) {
      where.tenantId = filters.tenantId;
    }

    const [data, total] = await Promise.all([
      this.prisma.fitoutProject.findMany({
        where,
        skip,
        take: +limit,
        include: {
          tenant: { select: { id: true, brandName: true, companyName: true } },
          unit: { select: { id: true, code: true, name: true, floor: { select: { name: true } } } },
          operationManager: { select: { id: true, fullName: true } },
          _count: { select: { checklists: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fitoutProject.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findOne(id: string, currentUser?: CurrentUser) {
    const project = await this.prisma.fitoutProject.findUnique({
      where: { id },
      include: {
        tenant: true,
        unit: { include: { floor: true, zone: true } },
        operationManager: { select: { id: true, fullName: true, email: true } },
        checklists: { orderBy: { order: 'asc' } },
        contract: { select: { id: true, contractNumber: true } },
      },
    });

    if (!project) throw new NotFoundException('Fitout project not found');

    if (currentUser?.role === 'TENANT' && project.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException('Bạn không có quyền xem dự án fitout này');
    }

    return project;
  }

  /**
   * Tự tạo FitoutProject khi hợp đồng chuyển ACTIVE — idempotent (bỏ qua nếu contract đã có project).
   * Stage khởi tạo luôn là stage có order nhỏ nhất đang active (mặc định CONTRACT_SIGNED).
   */
  async createFromContract(contract: {
    id: string;
    tenantId: string;
    unitId: string;
    handoverDate?: Date | null;
    fitoutDays?: number | null;
    openingDate?: Date | null;
  }) {
    const existing = await this.prisma.fitoutProject.findUnique({ where: { contractId: contract.id } });
    if (existing) return existing;

    const stages = await this.stageConfig.getOrderedActive();
    const firstStage = stages[0];
    if (!firstStage) throw new BadRequestException('No active fitout stage configured');

    const project = await this.prisma.fitoutProject.create({
      data: {
        contractId: contract.id,
        tenantId: contract.tenantId,
        unitId: contract.unitId,
        status: firstStage.code,
        handoverDate: contract.handoverDate ?? undefined,
        expectedOpenDate: contract.openingDate ?? undefined,
      },
    });

    await this.slaService.recordMilestone(project.id, firstStage.code);
    return project;
  }

  @OnEvent('contract.activated')
  async handleContractActivated(payload: ContractActivatedEvent) {
    try {
      await this.createFromContract({
        id: payload.contractId,
        tenantId: payload.tenantId,
        unitId: payload.unitId,
        handoverDate: payload.handoverDate,
        openingDate: payload.openingDate,
      });
    } catch (err) {
      this.logger.error(`Failed to auto-create FitoutProject for contract ${payload.contractId}: ${err.message}`);
    }
  }

  async advanceStatus(
    id: string,
    newStatus: string,
    opts: { userId?: string; override?: boolean; overrideReason?: string } = {},
  ) {
    const project = await this.findOne(id);
    const stages = await this.stageConfig.getOrderedActive();
    const currentIdx = stages.findIndex((s) => s.code === project.status);
    const newIdx = stages.findIndex((s) => s.code === newStatus);

    if (newIdx === -1) throw new BadRequestException(`Unknown fitout stage "${newStatus}"`);
    if (currentIdx !== -1 && newIdx <= currentIdx) {
      throw new BadRequestException('Can only advance to a later status');
    }

    const gateResult = await this.documentsService.checkGateRequirements(id, newStatus);
    if (!gateResult.canAdvance) {
      if (!opts.override) {
        throw new BadRequestException({
          message: 'Gate requirements not met for target stage',
          missing: gateResult.missing,
        });
      }
      if (!opts.overrideReason?.trim()) {
        throw new BadRequestException('overrideReason is required to bypass gate requirements');
      }
    }

    const targetStage = stages[newIdx];
    const updateData: any = { status: newStatus };

    if (targetStage.setsField === 'startDate' && !project.startDate) {
      updateData.startDate = new Date();
    }
    if (targetStage.setsField === 'actualOpenDate') {
      updateData.actualOpenDate = new Date();
    }
    if (targetStage.triggersUnitStatus) {
      await this.unitStatus.transition(project.unitId, targetStage.triggersUnitStatus as UnitStatus, {
        reason: `Fit-out ${project.id} → ${newStatus}`,
        ...(targetStage.triggersUnitStatus === 'OCCUPIED' ? { tenantId: project.tenantId } : {}),
      });
    }

    const updated = await this.prisma.fitoutProject.update({ where: { id }, data: updateData });

    if (currentIdx !== -1) {
      await this.slaService.completeMilestone(id, project.status);
    }
    await this.slaService.recordMilestone(id, newStatus);

    if (!gateResult.canAdvance && opts.override) {
      await this.prisma.auditLog.create({
        data: {
          userId: opts.userId,
          action: 'FITOUT_GATE_OVERRIDE',
          entityType: 'FITOUT',
          entityId: id,
          payload: JSON.stringify({ from: project.status, to: newStatus, missing: gateResult.missing, reason: opts.overrideReason }),
          status: 'SUCCESS',
        },
      });
    }

    return updated;
  }

  async getChecklists(id: string) {
    await this.findOne(id);
    return this.prisma.fitoutChecklist.findMany({
      where: { projectId: id },
      orderBy: { order: 'asc' },
    });
  }

  async createChecklist(id: string, data: { title: string; description?: string }) {
    await this.findOne(id);
    const lastItem = await this.prisma.fitoutChecklist.findFirst({
      where: { projectId: id },
      orderBy: { order: 'desc' },
    });
    return this.prisma.fitoutChecklist.create({
      data: { projectId: id, title: data.title, description: data.description, order: (lastItem?.order ?? 0) + 1 },
    });
  }

  async deleteChecklist(id: string, checklistId: string) {
    const item = await this.prisma.fitoutChecklist.findFirst({ where: { id: checklistId, projectId: id } });
    if (!item) throw new NotFoundException('Checklist item not found');
    return this.prisma.fitoutChecklist.delete({ where: { id: checklistId } });
  }

  async updateChecklist(id: string, checklistId: string, isCompleted: boolean, userId: string) {
    return this.prisma.fitoutChecklist.update({
      where: { id: checklistId, projectId: id },
      data: {
        isCompleted,
        completedById: isCompleted ? userId : null,
        completedAt: isCompleted ? new Date() : null,
      },
    });
  }

  async assign(id: string, operationManagerId: string) {
    await this.findOne(id);
    return this.prisma.fitoutProject.update({
      where: { id },
      data: { operationManagerId },
    });
  }
}
