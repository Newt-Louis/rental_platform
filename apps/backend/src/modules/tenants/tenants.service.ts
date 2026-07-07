import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: PaginationDto & { category?: string }) {
    const { page = 1, limit = 20, search, category } = query;
    const skip = (+page - 1) * +limit;

    const where: any = { isActive: true, deletedAt: null };
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { brandName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: +limit,
        include: {
          _count: {
            select: { contracts: true, tickets: true, invoices: true },
          },
        },
        orderBy: { brandName: 'asc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        occupiedUnits: {
          include: {
            floor: { select: { name: true, level: true } },
            zone: { select: { name: true, code: true } },
          },
        },
        contracts: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            unit: { select: { code: true, name: true } },
          },
        },
        invoices: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        tickets: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { contracts: true, tickets: true, invoices: true, leads: true },
        },
      },
    });

    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async create(dto: CreateTenantDto) {
    if (dto.taxCode) {
      const existing = await this.prisma.tenant.findUnique({ where: { taxCode: dto.taxCode } });
      if (existing) throw new ConflictException('Tax code already exists');
    }

    return this.prisma.tenant.create({ data: dto });
  }

  async update(id: string, dto: Partial<CreateTenantDto>) {
    await this.findOne(id);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.tenant.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { message: 'Tenant deleted successfully' };
  }
}
