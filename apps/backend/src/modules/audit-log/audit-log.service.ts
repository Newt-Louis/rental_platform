import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    userId?: string;
    entityType?: string;
    action?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50, search, dateFrom, dateTo, ...filters } = query;
    const skip = (page - 1) * +limit;

    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.action) where.action = filters.action;
    if (filters.status) where.status = filters.status;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    if (search) {
      where.OR = [
        { endpoint: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: +limit,
        include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  /** Danh sách entityType đã từng xuất hiện — phục vụ dropdown lọc, không hardcode. */
  async listEntityTypes() {
    const rows = await this.prisma.auditLog.findMany({
      distinct: ['entityType'],
      select: { entityType: true },
      orderBy: { entityType: 'asc' },
    });
    return rows.map((r) => r.entityType);
  }

  async getStats(dateFrom?: string) {
    const where: any = {};
    if (dateFrom) where.createdAt = { gte: new Date(dateFrom) };

    const [total, errorCount, byAction] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.count({ where: { ...where, status: 'ERROR' } }),
      this.prisma.auditLog.groupBy({ by: ['action'], where, _count: true }),
    ]);

    return { total, errorCount, byAction };
  }
}
