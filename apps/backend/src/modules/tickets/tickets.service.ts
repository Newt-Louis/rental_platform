import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketStatus, TicketPriority, TicketSource } from '@prisma/client';
import * as crypto from 'crypto';

const ENTITY_TYPE = 'TICKET';

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: [TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS],
  ASSIGNED: [TicketStatus.IN_PROGRESS],
  IN_PROGRESS: [TicketStatus.WAITING_TENANT, TicketStatus.RESOLVED],
  WAITING_TENANT: [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED],
  RESOLVED: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  CLOSED: [TicketStatus.IN_PROGRESS],
};

/** Các transition mà role TENANT tự thực hiện được (phải là chủ sở hữu ticket). */
const TENANT_ALLOWED_TRANSITIONS: Partial<Record<TicketStatus, TicketStatus[]>> = {
  RESOLVED: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  WAITING_TENANT: [TicketStatus.CLOSED],
};

interface CurrentUser {
  id: string;
  role: string;
  tenantId?: string | null;
}

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private notifications: NotificationsService,
    private emailService: EmailService,
  ) {}

  async findAll(query: {
    status?: TicketStatus;
    priority?: TicketPriority;
    tenantId?: string;
    assignedToId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }, currentUser?: CurrentUser) {
    const { page = 1, limit = 20, search, ...filters } = query;
    const skip = (page - 1) * +limit;

    const where: any = { isActive: true };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;

    if (currentUser?.role === 'TENANT') {
      // Không tin tưởng tenantId client gửi lên — luôn ép theo tenant của người đăng nhập.
      where.tenantId = currentUser.tenantId ?? '__none__';
    } else if (filters.tenantId) {
      where.tenantId = filters.tenantId;
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { ticketNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        skip,
        take: +limit,
        include: {
          tenant: { select: { id: true, brandName: true } },
          unit: { select: { id: true, code: true, name: true } },
          assignedTo: { select: { id: true, fullName: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findOne(id: string, currentUser?: CurrentUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        tenant: true,
        unit: { include: { floor: true } },
        createdBy: { select: { id: true, fullName: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        comments: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    if (currentUser?.role === 'TENANT') {
      if (ticket.tenantId !== currentUser.tenantId) {
        throw new ForbiddenException('Bạn không có quyền xem yêu cầu này');
      }
      // Ẩn ghi chú nội bộ khỏi tenant.
      ticket.comments = ticket.comments.filter((c) => !c.isInternal);
    }

    return ticket;
  }

  async create(dto: CreateTicketDto, currentUser: CurrentUser) {
    const year = new Date().getFullYear();
    const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
    const ticketNumber = `TKT-${year}-${rand}`;

    const priority = dto.priority ?? 'MEDIUM';
    let sla = dto.sla;
    let slaDueAt: Date | null = null;

    const slaPolicy = await this.prisma.ticketSlaPolicy.findUnique({
      where: { ticketType_priority: { ticketType: dto.type, priority } },
    });

    if (slaPolicy) {
      sla = slaPolicy.resolutionHours;
      slaDueAt = new Date();
      slaDueAt.setHours(slaDueAt.getHours() + slaPolicy.resolutionHours);
    }

    const isTenantCaller = currentUser.role === 'TENANT';
    const source = isTenantCaller ? TicketSource.TENANT_REQUEST : TicketSource.STAFF_INSPECTION;
    const tenantId = isTenantCaller ? (currentUser.tenantId ?? dto.tenantId) : dto.tenantId;

    if (isTenantCaller && !currentUser.tenantId) {
      throw new BadRequestException('Tài khoản của bạn chưa được liên kết với khách thuê nào — liên hệ quản trị viên.');
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        ticketNumber,
        tenantId,
        unitId: dto.unitId,
        type: dto.type,
        priority,
        subject: dto.subject,
        description: dto.description,
        sla,
        slaDueAt,
        createdById: currentUser.id,
        source,
      },
      include: {
        tenant: { select: { id: true, brandName: true, contactEmail: true } },
        unit: { select: { id: true, code: true } },
      },
    });

    if (source === TicketSource.STAFF_INSPECTION) {
      await this.notifyTenantOfInspection(ticket);
    }

    return ticket;
  }

  private async notifyTenantOfInspection(ticket: { id: string; ticketNumber: string; subject: string; tenantId: string; tenant: { brandName: string; contactEmail: string | null }; unit: { code: string } }) {
    const tenantUsers = await this.prisma.user.findMany({
      where: { tenantId: ticket.tenantId, isActive: true },
      select: { id: true, email: true, fullName: true },
    });

    for (const u of tenantUsers) {
      await this.notifications.create({
        userId: u.id,
        title: `Phiếu kiểm tra mới — ${ticket.subject}`,
        body: `Nhân viên vận hành vừa ghi nhận một phiếu kiểm tra cho ${ticket.unit.code}. Vui lòng xem chi tiết và phản hồi.`,
        type: 'TICKET_INSPECTION_CREATED',
        entityType: ENTITY_TYPE,
        entityId: ticket.id,
      });
    }

    if (ticket.tenant.contactEmail) {
      await this.emailService.sendMail({
        to: ticket.tenant.contactEmail,
        subject: `[THISO] Phiếu kiểm tra mới — ${ticket.ticketNumber}`,
        html: this.emailService.ticketInspectionHtml({
          tenantName: ticket.tenant.brandName,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          unitCode: ticket.unit.code,
        }),
      });
    }
  }

  /** Cập nhật thông tin cơ bản (không cho đổi status qua đây — dùng transition()). */
  async update(id: string, data: Partial<CreateTicketDto>, currentUser: CurrentUser) {
    if (currentUser.role === 'TENANT') {
      throw new ForbiddenException('Khách thuê không có quyền chỉnh sửa yêu cầu — dùng bình luận hoặc chuyển trạng thái');
    }
    await this.findOne(id);
    const { ...safeData } = data as any;
    delete safeData.status;
    delete safeData.tenantId;
    return this.prisma.ticket.update({ where: { id }, data: safeData });
  }

  async assign(id: string, assignedToId: string, currentUser: CurrentUser) {
    if (currentUser.role === 'TENANT') {
      throw new ForbiddenException('Khách thuê không có quyền phân công xử lý');
    }
    await this.findOne(id);
    return this.prisma.ticket.update({
      where: { id },
      data: { assignedToId, status: TicketStatus.ASSIGNED },
    });
  }

  async transition(id: string, newStatus: TicketStatus, currentUser: CurrentUser) {
    const ticket = await this.findOne(id);
    const isTenant = currentUser.role === 'TENANT';

    if (isTenant && ticket.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên yêu cầu này');
    }

    const allowed = isTenant
      ? (TENANT_ALLOWED_TRANSITIONS[ticket.status] ?? [])
      : (VALID_TRANSITIONS[ticket.status] ?? []);

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Không thể chuyển từ ${ticket.status} sang ${newStatus}`);
    }

    const data: any = { status: newStatus };
    if (newStatus === TicketStatus.RESOLVED) data.resolvedAt = new Date();
    if (newStatus === TicketStatus.CLOSED) data.closedAt = new Date();
    if (newStatus === TicketStatus.IN_PROGRESS) { data.resolvedAt = null; data.closedAt = null; }

    return this.prisma.ticket.update({ where: { id }, data });
  }

  async addComment(id: string, userId: string, content: string, isInternal = false, currentUser?: CurrentUser) {
    const ticket = await this.findOne(id);
    if (currentUser?.role === 'TENANT') {
      if (ticket.tenantId !== currentUser.tenantId) {
        throw new ForbiddenException('Bạn không có quyền bình luận trên yêu cầu này');
      }
      isInternal = false; // tenant không tạo được ghi chú nội bộ
    }
    return this.prisma.ticketComment.create({
      data: { ticketId: id, userId, content, isInternal },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  // ── Photos (UnifiedDocument) ────────────────────────────────────────────
  async listPhotos(ticketId: string, currentUser?: CurrentUser) {
    await this.findOne(ticketId, currentUser); // 403 nếu tenant khác cố xem
    return this.prisma.unifiedDocument.findMany({
      where: { entityType: ENTITY_TYPE, entityId: ticketId, isActive: true },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async uploadPhoto(ticketId: string, file: Express.Multer.File, uploadedById: string, currentUser?: CurrentUser) {
    await this.findOne(ticketId, currentUser); // 403 nếu tenant khác cố tải lên
    const saved = await this.storageService.saveFile(file, `tickets/${ticketId}`);
    return this.prisma.unifiedDocument.create({
      data: {
        entityType: ENTITY_TYPE,
        entityId: ticketId,
        category: 'ORIGINAL',
        documentType: 'INSPECTION_PHOTO',
        fileName: saved.fileName,
        filePath: saved.filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById,
      },
    });
  }

  async getStats() {
    const [total, byStatus, byPriority] = await Promise.all([
      this.prisma.ticket.count({ where: { isActive: true } }),
      this.prisma.ticket.groupBy({ by: ['status'], where: { isActive: true }, _count: true }),
      this.prisma.ticket.groupBy({ by: ['priority'], where: { isActive: true }, _count: true }),
    ]);

    return { total, byStatus, byPriority };
  }

  async getEscalations(ticketId: string) {
    await this.findOne(ticketId);
    return this.prisma.ticketEscalation.findMany({
      where: { ticketId },
      orderBy: { level: 'asc' },
    });
  }

  async setSlaDueAt(ticketId: string, slaDueAt: Date | null, slaHours?: number) {
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { slaDueAt, sla: slaHours },
    });
  }

  async rateTicket(ticketId: string, rating: number, comment?: string) {
    if (rating < 1 || rating > 5) throw new BadRequestException('Rating must be 1-5');
    await this.findOne(ticketId);
    return this.prisma.ticketRating.upsert({
      where: { ticketId },
      create: { ticketId, rating, comment, ratedAt: new Date() },
      update: { rating, comment, ratedAt: new Date() },
    });
  }

  async getTicketRating(ticketId: string) {
    return this.prisma.ticketRating.findUnique({ where: { ticketId } });
  }

  async getCsatSummary() {
    const ratings = await this.prisma.ticketRating.groupBy({
      by: ['rating'],
      _count: { rating: true },
    });
    const totalRated = ratings.reduce((s, r) => s + r._count.rating, 0);
    const weightedSum = ratings.reduce((s, r) => s + r.rating * r._count.rating, 0);
    const avgRating = totalRated > 0 ? weightedSum / totalRated : 0;
    const csat5 = ratings.filter((r) => r.rating >= 4).reduce((s, r) => s + r._count.rating, 0);
    const csatScore = totalRated > 0 ? Math.round((csat5 / totalRated) * 100) : 0;
    return { totalRated, avgRating: +avgRating.toFixed(2), csatScore, byRating: ratings };
  }

  async listMaintenance(query: { mallId?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20, mallId } = query;
    const skip = (page - 1) * +limit;
    const where: any = { isActive: true };
    if (mallId) where.mallId = mallId;

    const [data, total] = await Promise.all([
      this.prisma.maintenanceSchedule.findMany({
        where,
        skip,
        take: +limit,
        include: { mall: { select: { id: true, name: true } } },
        orderBy: { nextDueDate: 'asc' },
      }),
      this.prisma.maintenanceSchedule.count({ where }),
    ]);
    return { data, total };
  }

  async createMaintenance(dto: {
    mallId: string;
    title: string;
    description?: string;
    frequency: string;
    nextDueDate: string;
    assignedRole?: string;
    estimatedHours?: number;
  }, createdById: string) {
    return this.prisma.maintenanceSchedule.create({
      data: {
        mallId: dto.mallId,
        title: dto.title,
        description: dto.description,
        frequency: dto.frequency,
        nextDueDate: new Date(dto.nextDueDate),
        assignedRole: (dto.assignedRole as any) ?? 'OPERATION',
        estimatedHours: dto.estimatedHours,
        createdById,
      },
    });
  }

  async updateMaintenance(id: string, dto: Partial<{ title: string; description: string; frequency: string; nextDueDate: string; estimatedHours: number; isActive: boolean }>) {
    const data: any = { ...dto };
    if (dto.nextDueDate) data.nextDueDate = new Date(dto.nextDueDate);
    return this.prisma.maintenanceSchedule.update({ where: { id }, data });
  }

  async executeMaintenance(id: string) {
    const sched = await this.prisma.maintenanceSchedule.findUnique({ where: { id } });
    if (!sched) throw new NotFoundException('Maintenance schedule not found');

    const next = new Date(sched.nextDueDate);
    switch (sched.frequency) {
      case 'DAILY': next.setDate(next.getDate() + 1); break;
      case 'WEEKLY': next.setDate(next.getDate() + 7); break;
      case 'MONTHLY': next.setMonth(next.getMonth() + 1); break;
      case 'QUARTERLY': next.setMonth(next.getMonth() + 3); break;
      case 'ANNUALLY': next.setFullYear(next.getFullYear() + 1); break;
    }

    return this.prisma.maintenanceSchedule.update({
      where: { id },
      data: { lastExecutedAt: new Date(), nextDueDate: next },
    });
  }
}
