import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: { mallId?: string; category?: string; priority?: string; page?: number; limit?: number }, currentUser?: { role: string; tenantId?: string | null }) {
    const { page = 1, limit = 20, ...filters } = query;
    const skip = (page - 1) * +limit;
    const now = new Date();

    const where: any = {
      isActive: true,
      publishedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    };
    if (currentUser?.role === 'TENANT') {
      const units = await this.prisma.unit.findMany({
        where: { tenantId: currentUser.tenantId ?? '__none__', isActive: true },
        select: { mallId: true },
      });
      const allowedMallIds = [...new Set(units.map((unit) => unit.mallId))];
      where.mallId = filters.mallId && allowedMallIds.includes(filters.mallId)
        ? filters.mallId
        : { in: allowedMallIds };
    } else if (filters.mallId) where.mallId = filters.mallId;
    if (filters.category) where.category = filters.category;
    if (filters.priority) where.priority = filters.priority;

    const [data, total] = await Promise.all([
      this.prisma.mallAnnouncement.findMany({
        where,
        skip,
        take: +limit,
        include: {
          mall: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }],
      }),
      this.prisma.mallAnnouncement.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findAllAdmin(query: { mallId?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20, mallId } = query;
    const skip = (page - 1) * +limit;
    const where: any = { isActive: true };
    if (mallId) where.mallId = mallId;

    const [data, total] = await Promise.all([
      this.prisma.mallAnnouncement.findMany({
        where,
        skip,
        take: +limit,
        include: {
          mall: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mallAnnouncement.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findOne(id: string) {
    const a = await this.prisma.mallAnnouncement.findUnique({
      where: { id },
      include: { mall: { select: { id: true, name: true } }, createdBy: { select: { id: true, fullName: true } } },
    });
    if (!a) throw new NotFoundException('Announcement not found');
    return a;
  }

  async findOneForUser(id: string, currentUser: { role: string; tenantId?: string | null }) {
    const announcement = await this.findOne(id);
    if (currentUser.role === 'TENANT') {
      const hasAccess = await this.prisma.unit.count({
        where: { tenantId: currentUser.tenantId ?? '__none__', mallId: announcement.mallId, isActive: true },
      });
      if (!hasAccess) throw new ForbiddenException('Bạn không có quyền xem thông báo này');
    }
    return announcement;
  }

  async create(dto: {
    mallId: string;
    title: string;
    content: string;
    category: string;
    priority?: string;
    publishedAt?: string;
    expiresAt?: string;
    targetAll?: boolean;
    targetCategories?: string[];
    attachmentUrl?: string;
  }, createdById: string) {
    if (!dto.mallId || !dto.title?.trim() || !dto.content?.trim() || !dto.category) {
      throw new BadRequestException('Vui lòng chọn Mall và nhập đầy đủ tiêu đề, nội dung, danh mục');
    }
    const publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : new Date();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (Number.isNaN(publishedAt.getTime()) || (expiresAt && Number.isNaN(expiresAt.getTime()))) {
      throw new BadRequestException('Thời gian đăng hoặc hết hạn không hợp lệ');
    }
    if (expiresAt && expiresAt <= publishedAt) {
      throw new BadRequestException('Thời gian hết hạn phải sau thời gian đăng');
    }
    return this.prisma.mallAnnouncement.create({
      data: {
        mallId: dto.mallId,
        title: dto.title,
        content: dto.content,
        category: dto.category,
        priority: dto.priority ?? 'NORMAL',
        publishedAt,
        expiresAt,
        targetAll: dto.targetAll ?? true,
        targetCategories: dto.targetCategories ?? [],
        attachmentUrl: dto.attachmentUrl,
        createdById,
      },
      include: { mall: { select: { id: true, name: true } }, createdBy: { select: { id: true, fullName: true } } },
    });
  }

  async update(id: string, dto: Partial<{
    title: string;
    content: string;
    category: string;
    priority: string;
    publishedAt: string;
    expiresAt: string;
    targetAll: boolean;
    targetCategories: string[];
    attachmentUrl: string;
    isActive: boolean;
  }>) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.publishedAt) data.publishedAt = new Date(dto.publishedAt);
    if (dto.expiresAt) data.expiresAt = new Date(dto.expiresAt);
    return this.prisma.mallAnnouncement.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.mallAnnouncement.update({ where: { id }, data: { isActive: false } });
  }
}
