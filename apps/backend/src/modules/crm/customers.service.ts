import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerStatus, ActivityType, LeadSource } from '@prisma/client';

export interface CreateCustomerDto {
  leadId?: string;
  companyName: string;
  brandName?: string;
  taxCode?: string;
  industry?: string;
  contactName: string;
  contactTitle?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  source?: LeadSource;
  preferredCategory?: string;
  expectedArea?: number;
  budgetMin?: number;
  budgetMax?: number;
  rating?: number;
  assignedToId?: string;
  notes?: string;
}

export interface CreateCustomerActivityDto {
  type: ActivityType;
  subject?: string;
  note: string;
  scheduledAt?: string;
  outcome?: string;
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  private async generateCustomerCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `KH-${year}-`;
    const last = await this.prisma.customer.findFirst({
      where: { customerCode: { startsWith: prefix } },
      orderBy: { customerCode: 'desc' },
      select: { customerCode: true },
    });
    const seq = last ? parseInt(last.customerCode.split('-')[2], 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  async findAll(query: {
    status?: CustomerStatus;
    search?: string;
    assignedToId?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, search, status, assignedToId } = query;
    const skip = (page - 1) * +limit;

    const where: any = { isActive: true, deletedAt: null };
    if (status) where.status = status;
    if (assignedToId) where.assignedToId = assignedToId;
    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { brandName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { customerCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: +limit,
        include: {
          assignedTo: { select: { id: true, fullName: true, email: true } },
          tenant: { select: { id: true, brandName: true, companyName: true } },
          _count: { select: { leads: true, activities: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async getStats() {
    const statuses = Object.values(CustomerStatus);
    const [total, byStatus] = await Promise.all([
      this.prisma.customer.count({ where: { isActive: true } }),
      Promise.all(
        statuses.map(async (status) => ({
          status,
          count: await this.prisma.customer.count({ where: { status, isActive: true } }),
        })),
      ),
    ]);
    return { total, byStatus };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        tenant: { select: { id: true, brandName: true, companyName: true, contactPhone: true } },
        leads: {
          where: { isActive: true },
          include: {
            assignedTo: { select: { id: true, fullName: true } },
            proposals: {
              include: {
                unit: { select: { id: true, code: true, name: true } },
                approvalWorkflow: {
                  select: {
                    id: true, status: true,
                    steps: {
                      select: { id: true, stepOrder: true, stepName: true, approverRole: true, status: true, comment: true, approver: { select: { id: true, fullName: true } } },
                      orderBy: { stepOrder: 'asc' },
                    },
                  },
                },
                contract: { select: { id: true, contractNumber: true, status: true } },
              },
              orderBy: { createdAt: 'desc' },
            },
            bookings: {
              where: { isActive: true },
              orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
              include: {
                unit: { select: { id: true, code: true, name: true } },
                assignedTo: { select: { id: true, fullName: true } },
                proposal: { select: { id: true, proposalNumber: true, status: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        bookings: {
          where: { isActive: true },
          orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
          take: 20,
          include: {
            unit: { select: { id: true, code: true, name: true } },
            lead: { select: { id: true, brandName: true } },
            assignedTo: { select: { id: true, fullName: true } },
            proposal: { select: { id: true, proposalNumber: true, status: true } },
          },
        },
        activities: {
          include: { createdBy: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(dto: CreateCustomerDto, userId: string) {
    const { leadId, ...customerDto } = dto;
    let lead: any = null;
    if (leadId) {
      lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead || !lead.isActive || lead.deletedAt) {
        throw new NotFoundException('Không tìm thấy Lead đã chọn.');
      }
      if (lead.customerId) {
        throw new ConflictException('Lead đã được liên kết với một hồ sơ khách hàng khác.');
      }
    }
    const customerCode = await this.generateCustomerCode();
    return this.prisma.customer.create({
      data: {
        ...customerDto,
        customerCode,
        createdById: userId,
        ...(leadId ? { leads: { connect: { id: leadId } } } : {}),
      } as any,
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        leads: { select: { id: true, brandName: true, contactName: true, status: true } },
      },
    });
  }

  async update(id: string, dto: Partial<CreateCustomerDto> & { status?: CustomerStatus; lostReason?: string; tenantId?: string }) {
    const existing = await this.findOne(id);
    const data: any = { ...dto };
    if (dto.status === CustomerStatus.ACTIVE && !data.wonAt) data.wonAt = new Date();
    if (dto.status === CustomerStatus.INACTIVE && !data.lostAt) data.lostAt = new Date();

    const updated = await this.prisma.customer.update({
      where: { id },
      data,
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        tenant: { select: { id: true, brandName: true, companyName: true } },
      },
    });

    // Sync linked leads when customer status changes
    if (dto.status && dto.status !== existing.status) {
      if (dto.status === CustomerStatus.ACTIVE) {
        // All active leads (not already WON/LOST) → WON
        await this.prisma.lead.updateMany({
          where: { customerId: id, isActive: true, status: { notIn: ['WON', 'LOST'] as any } },
          data: { status: 'WON' as any },
        });
      } else if (dto.status === CustomerStatus.INACTIVE) {
        // All active leads (not WON) → LOST
        await this.prisma.lead.updateMany({
          where: { customerId: id, isActive: true, status: { not: 'WON' as any } },
          data: { status: 'LOST' as any },
        });
      } else if (dto.status === CustomerStatus.NEGOTIATING) {
        // Early-stage leads → NEGOTIATION (don't touch PROPOSAL/NEGOTIATION/WON/LOST)
        await this.prisma.lead.updateMany({
          where: { customerId: id, isActive: true, status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] as any } },
          data: { status: 'NEGOTIATION' as any },
        });
      }
      // PROSPECT / BLACKLISTED: don't modify leads
    }

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.customer.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { message: 'Customer deleted' };
  }

  async addActivity(customerId: string, dto: CreateCustomerActivityDto, userId: string) {
    await this.findOne(customerId);
    return this.prisma.customerActivity.create({
      data: {
        customerId,
        type: dto.type,
        subject: dto.subject,
        note: dto.note,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        outcome: dto.outcome,
        createdById: userId,
      },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
  }

  private customerStatusFromLead(status: string): CustomerStatus {
    if (status === 'WON') return CustomerStatus.ACTIVE;
    if (status === 'LOST') return CustomerStatus.INACTIVE;
    if (['PROPOSAL', 'NEGOTIATION'].includes(status)) return CustomerStatus.NEGOTIATING;
    return CustomerStatus.PROSPECT;
  }

  private customerDataFromLead(lead: any) {
    const data: any = {};
    const mappedFields: Array<[string, unknown]> = [
      ['companyName', lead.company || lead.brandName],
      ['brandName', lead.brandName],
      ['contactName', lead.contactName],
      ['phone', lead.phone],
      ['email', lead.email],
      ['preferredCategory', lead.preferredCategory || lead.category],
      ['expectedArea', lead.expectedArea],
      ['budgetMin', lead.expectedRent],
      ['source', lead.source],
      ['notes', lead.notes],
      ['assignedToId', lead.assignedToId],
    ];
    for (const [key, value] of mappedFields) {
      if (value !== undefined && value !== null && value !== '') data[key] = value;
    }
    return data;
  }

  async createFromLead(leadId: string, userId: string, activate = true): Promise<any> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { customer: true },
    });
    if (!lead || !lead.isActive || lead.deletedAt) {
      throw new NotFoundException('Không tìm thấy Lead để tạo hồ sơ khách hàng.');
    }

    if (lead.customerId && lead.customer) {
      if (activate && lead.customer.status !== CustomerStatus.ACTIVE) {
        await this.prisma.customer.update({
          where: { id: lead.customerId },
          data: { status: CustomerStatus.ACTIVE, wonAt: new Date() },
        });
      }
      return this.findOne(lead.customerId);
    }

    const customerCode = await this.generateCustomerCode();
    const customer = await this.prisma.customer.create({
      data: {
        customerCode,
        ...this.customerDataFromLead(lead),
        status: activate ? CustomerStatus.ACTIVE : this.customerStatusFromLead(lead.status),
        wonAt: activate || lead.status === 'WON' ? new Date() : undefined,
        lostAt: !activate && lead.status === 'LOST' ? new Date() : undefined,
        createdById: userId,
      },
    });

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { customerId: customer.id },
    });

    return this.findOne(customer.id);
  }

  async createProfileFromLead(leadId: string, userId: string) {
    return this.createFromLead(leadId, userId, false);
  }

  async syncFromLead(customerId: string, leadId: string) {
    await this.findOne(customerId);
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || !lead.isActive || lead.deletedAt) {
      throw new NotFoundException('Không tìm thấy Lead để đồng bộ.');
    }
    if (lead.customerId && lead.customerId !== customerId) {
      throw new ConflictException('Lead này đã liên kết với một hồ sơ khách hàng khác.');
    }

    await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id: customerId },
        data: this.customerDataFromLead(lead),
      }),
      this.prisma.lead.update({
        where: { id: leadId },
        data: { customerId },
      }),
    ]);
    return this.findOne(customerId);
  }

  async linkTenant(customerId: string, tenantId: string) {
    await this.findOne(customerId);
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { tenantId, status: CustomerStatus.ACTIVE, wonAt: new Date() },
      include: {
        tenant: { select: { id: true, brandName: true, companyName: true } },
      },
    });
  }
}
