import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';

const ENTITY_TYPE = 'FITOUT_ISSUE';

const VALID_TRANSITIONS: Record<string, string[]> = {
  OPENED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DONE', 'CANCELLED'],
  DONE: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  CANCELLED: [],
};

@Injectable()
export class FitoutIssueService {
  private readonly logger = new Logger(FitoutIssueService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private notifications: NotificationsService,
    private emailService: EmailService,
    private schedulerLock: SchedulerLockService,
  ) {}

  async list(projectId: string, query: { status?: string; category?: string; assigneeId?: string } = {}) {
    return this.prisma.fitoutIssue.findMany({
      where: { projectId, status: query.status, category: query.category, assigneeId: query.assigneeId },
      include: {
        unit: { select: { id: true, code: true } },
        createdBy: { select: { id: true, fullName: true } },
        assignee: { select: { id: true, fullName: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getOne(id: string) {
    const issue = await this.prisma.fitoutIssue.findUnique({
      where: { id },
      include: {
        unit: { select: { id: true, code: true, mapPolygon: true, mapPosX: true, mapPosY: true, mapPosW: true, mapPosH: true, floorId: true } },
        project: { select: { id: true, tenantId: true } },
        createdBy: { select: { id: true, fullName: true } },
        assignee: { select: { id: true, fullName: true } },
      },
    });
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  async create(projectId: string, dto: {
    unitId: string;
    title: string;
    description?: string;
    category?: string;
    severity?: string;
    assigneeId?: string;
    dueDate?: string;
    positionX?: number;
    positionY?: number;
  }, createdById: string) {
    const project = await this.prisma.fitoutProject.findUnique({
      where: { id: projectId },
      select: { id: true, unitId: true },
    });
    if (!project) throw new NotFoundException('Fitout project not found');

    if (dto.unitId !== project.unitId) {
      throw new BadRequestException('Unit does not belong to this fitout project');
    }

    const unit = await this.prisma.unit.findUnique({ where: { id: project.unitId } });
    if (!unit) throw new NotFoundException('Unit not found');

    const issue = await this.prisma.fitoutIssue.create({
      data: {
        projectId,
        unitId: project.unitId,
        floorId: unit.floorId,
        title: dto.title,
        description: dto.description,
        category: dto.category ?? 'DEFECT',
        severity: dto.severity ?? 'MEDIUM',
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        positionX: dto.positionX,
        positionY: dto.positionY,
        createdById,
      },
    });

    if (dto.assigneeId) {
      await this.notifications.create({
        userId: dto.assigneeId,
        title: `Vấn đề mới được giao — ${issue.title}`,
        body: `Lô ${unit.code}: ${issue.title}`,
        type: 'FITOUT_ISSUE_ASSIGNED',
        entityType: ENTITY_TYPE,
        entityId: issue.id,
      });
    }

    return issue;
  }

  async update(id: string, dto: Partial<{
    title: string; description: string; category: string; severity: string;
    assigneeId: string; dueDate: string;
  }>) {
    await this.getOne(id);
    return this.prisma.fitoutIssue.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        severity: dto.severity,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  async transition(id: string, newStatus: string, userId: string, userRole: string) {
    const issue = await this.getOne(id);
    const allowed = VALID_TRANSITIONS[issue.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition from ${issue.status} to ${newStatus}`);
    }

    const isPrivileged = userRole === 'ADMIN' || userRole === 'MALL_DIRECTOR';
    if (newStatus === 'DONE' && issue.assigneeId && issue.assigneeId !== userId && !isPrivileged) {
      throw new ForbiddenException('Only the assignee can mark this issue as done');
    }
    if (newStatus === 'CLOSED' && issue.createdById !== userId && !isPrivileged) {
      throw new ForbiddenException('Only the creator can close this issue');
    }

    const data: any = { status: newStatus };
    if (newStatus === 'CLOSED') data.closedAt = new Date();
    if (newStatus === 'REOPENED') {
      data.reopenCount = issue.reopenCount + 1;
      data.closedAt = null;
      data.isOverdue = false;
    }
    if (newStatus === 'CANCELLED' || newStatus === 'DONE') data.isOverdue = false;

    const updated = await this.prisma.fitoutIssue.update({ where: { id }, data });

    if (issue.createdById && issue.createdById !== userId) {
      await this.notifications.create({
        userId: issue.createdById,
        title: `Vấn đề cập nhật — ${issue.title}`,
        body: `Trạng thái: ${newStatus}`,
        type: 'FITOUT_ISSUE_UPDATED',
        entityType: ENTITY_TYPE,
        entityId: issue.id,
      });
    }

    return updated;
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  async listComments(id: string) {
    return this.prisma.entityComment.findMany({
      where: { entityType: ENTITY_TYPE, entityId: id },
      include: { author: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addComment(id: string, authorId: string, body: string) {
    await this.getOne(id);
    return this.prisma.entityComment.create({
      data: { entityType: ENTITY_TYPE, entityId: id, authorId, body },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  // ── Photos (UnifiedDocument) ────────────────────────────────────────────
  async listPhotos(id: string) {
    return this.prisma.unifiedDocument.findMany({
      where: { entityType: ENTITY_TYPE, entityId: id, isActive: true },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async uploadPhoto(id: string, file: Express.Multer.File, uploadedById: string) {
    await this.getOne(id);
    const saved = await this.storageService.saveFile(file, `fitout-issue/${id}`);
    return this.prisma.unifiedDocument.create({
      data: {
        entityType: ENTITY_TYPE,
        entityId: id,
        category: 'ORIGINAL',
        documentType: 'ISSUE_PHOTO',
        fileName: saved.fileName,
        filePath: saved.filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById,
      },
    });
  }

  // ── D-Map ────────────────────────────────────────────────────────────────
  async getDMap(projectId: string) {
    const project = await this.prisma.fitoutProject.findUnique({
      where: { id: projectId },
      include: {
        unit: {
          select: {
            id: true, code: true, floorId: true,
            mapPolygon: true, mapPosX: true, mapPosY: true, mapPosW: true, mapPosH: true,
            floor: { select: { id: true, floorPlanUrl: true, floorPlanRatio: true, level: true, name: true } },
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Fitout project not found');

    const openIssues = await this.prisma.fitoutIssue.findMany({
      where: { projectId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
      select: { id: true, title: true, severity: true, status: true, positionX: true, positionY: true },
    });

    return {
      unit: project.unit,
      floor: project.unit.floor,
      pins: openIssues,
    };
  }

  @Cron('0 8 * * *', { name: 'fitout-issue-overdue-check', timeZone: 'Asia/Ho_Chi_Minh' })
  async checkOverdueIssues() {
    return this.schedulerLock.runExclusive('fitout-issue-overdue-check', 14_400_000, () => this.checkOverdueIssuesUnlocked());
  }

  private async checkOverdueIssuesUnlocked() {
    this.logger.log('Checking overdue fitout issues...');
    const now = new Date();

    const overdue = await this.prisma.fitoutIssue.findMany({
      where: {
        dueDate: { lt: now },
        status: { notIn: ['DONE', 'CLOSED', 'CANCELLED'] },
        isOverdue: false,
      },
      include: { unit: { select: { code: true } } },
    });

    for (const issue of overdue) {
      await this.prisma.fitoutIssue.update({ where: { id: issue.id }, data: { isOverdue: true } });

      const recipients = [issue.assigneeId, issue.createdById].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i);
      for (const userId of recipients) {
        await this.notifications.create({
          userId,
          title: `⚠️ Vấn đề quá hạn — ${issue.title}`,
          body: `Lô ${issue.unit.code} — hạn xử lý đã qua.`,
          type: 'FITOUT_ISSUE_OVERDUE',
          entityType: ENTITY_TYPE,
          entityId: issue.id,
        });
      }
    }

    this.logger.log(`Processed ${overdue.length} overdue fitout issues`);
  }
}
