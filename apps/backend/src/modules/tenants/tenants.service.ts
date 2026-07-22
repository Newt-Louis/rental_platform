import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: PaginationDto & { category?: string; mallIds?: string[] }) {
    const { page = 1, limit = 20, search, category } = query;
    const skip = (+page - 1) * +limit;

    const where: any = { isActive: true, deletedAt: null };
    if (category) where.category = category;
    if (query.mallIds) where.AND = [{ OR: [
      { contracts: { some: { isActive: true, unit: { mallId: { in: query.mallIds } } } } },
      { proposals: { some: { isActive: true, unit: { mallId: { in: query.mallIds } } } } },
      { occupiedUnits: { some: { mallId: { in: query.mallIds } } } },
    ] }];
    if (search) {
      where.OR = [
        { brandName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total, activeCount] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: +limit,
        include: {
          _count: {
            select: { contracts: true, tickets: true, invoices: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.count({
        where: { AND: [where, { contracts: { some: { isActive: true, status: 'ACTIVE' } } }] },
      }),
    ]);

    return { data, total, activeCount, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
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
    const activeContracts = await this.prisma.contract.count({
      where: { tenantId: id, isActive: true, deletedAt: null, status: { notIn: ['EXPIRED', 'TERMINATED'] } },
    });
    if (activeContracts > 0) throw new BadRequestException('Cannot delete a tenant with active contracts');
    await this.prisma.tenant.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { message: 'Tenant deleted successfully' };
  }
}
