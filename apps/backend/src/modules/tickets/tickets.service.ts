import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketStatus, TicketPriority } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    status?: TicketStatus;
    priority?: TicketPriority;
    tenantId?: string;
    assignedToId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, search, ...filters } = query;
    const skip = (page - 1) * +limit;

    const where: any = { isActive: true };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
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

  async findOne(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        tenant: true,
        unit: { include: { floor: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async create(dto: CreateTicketDto) {
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

    return this.prisma.ticket.create({
      data: {
        ticketNumber,
        tenantId: dto.tenantId,
        unitId: dto.unitId,
        type: dto.type,
        priority,
        subject: dto.subject,
        description: dto.description,
        sla,
        slaDueAt,
      },
      include: {
        tenant: { select: { id: true, brandName: true } },
        unit: { select: { id: true, code: true } },
      },
    });
  }

  async update(id: string, data: Partial<CreateTicketDto & { status: TicketStatus }>) {
    await this.findOne(id);
    const updateData: any = { ...data };
    if (data.status === TicketStatus.RESOLVED) updateData.resolvedAt = new Date();
    if (data.status === TicketStatus.CLOSED) updateData.closedAt = new Date();

    return this.prisma.ticket.update({ where: { id }, data: updateData });
  }

  async assign(id: string, assignedToId: string) {
    await this.findOne(id);
    return this.prisma.ticket.update({
      where: { id },
      data: { assignedToId, status: TicketStatus.ASSIGNED },
    });
  }

  async addComment(id: string, userId: string, content: string, isInternal = false) {
    await this.findOne(id);
    return this.prisma.ticketComment.create({
      data: { ticketId: id, userId, content, isInternal },
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
