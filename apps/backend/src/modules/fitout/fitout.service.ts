import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FitoutStatus, UnitStatus } from '@prisma/client';
import { UnitStatusService } from '../../common/services/unit-status.service';

const STATUS_ORDER = [
  FitoutStatus.CONTRACT_SIGNED,
  FitoutStatus.SUBMIT_DESIGN,
  FitoutStatus.DESIGN_REVIEW,
  FitoutStatus.FIRE_SAFETY_REVIEW,
  FitoutStatus.CONSTRUCTION_PERMIT,
  FitoutStatus.FITOUT_IN_PROGRESS,
  FitoutStatus.INSPECTION,
  FitoutStatus.APPROVED_TO_OPEN,
  FitoutStatus.OPENED,
];

@Injectable()
export class FitoutService {
  constructor(
    private prisma: PrismaService,
    private unitStatus: UnitStatusService,
  ) {}

  async findAll(query: { status?: FitoutStatus; tenantId?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20, ...filters } = query;
    const skip = (page - 1) * +limit;

    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.tenantId) where.tenantId = filters.tenantId;

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

  async findOne(id: string) {
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
    return project;
  }

  async advanceStatus(id: string, newStatus: FitoutStatus) {
    const project = await this.findOne(id);
    const currentIdx = STATUS_ORDER.indexOf(project.status);
    const newIdx = STATUS_ORDER.indexOf(newStatus);

    if (newIdx <= currentIdx) {
      throw new BadRequestException('Can only advance to a later status');
    }

    const updateData: any = { status: newStatus };
    if (newStatus === FitoutStatus.FITOUT_IN_PROGRESS) {
      if (!project.startDate) updateData.startDate = new Date();
      await this.unitStatus.transition(project.unitId, UnitStatus.UNDER_FITOUT, {
        reason: `Fit-out ${project.id} in progress`,
      });
    }
    if (newStatus === FitoutStatus.OPENED) {
      updateData.actualOpenDate = new Date();
      await this.unitStatus.transition(project.unitId, UnitStatus.OCCUPIED, {
        reason: `Fit-out ${project.id} opened`,
        tenantId: project.tenantId,
      });
    }

    return this.prisma.fitoutProject.update({ where: { id }, data: updateData });
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
