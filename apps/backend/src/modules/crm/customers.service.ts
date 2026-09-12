import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CustomerStatus, ActivityType, LeadSource, CurrencyCode, Role,
  CrmEventSourceModule, LeadStatus, Prisma,
} from '@prisma/client';
import { CategoryResolverService } from '../../common/services/category-resolver.service';
import { LeadLifecycleService } from './lead-lifecycle.service';
import { randomUUID } from 'crypto';

export interface CustomerScope {
  userId: string;
  role: Role;
}

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
  /** CR-CRM-CATEGORY-MASTER-001 — deprecated input, display snapshot only. */
  preferredCategory?: string;
  /** Authoritative identity: Category.id. null clears, undefined leaves unchanged. */
  preferredCategoryId?: string | null;
  expectedArea?: number;
  budgetMin?: number;
  budgetMax?: number;
  // CUR-002-CUSTOMER: required whenever a budget figure is supplied.
  currencyCode?: CurrencyCode;
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
  constructor(
    private prisma: PrismaService,
    private categoryResolver: CategoryResolverService,
    private leadLifecycle: LeadLifecycleService,
  ) {}

  // CR-CRM-CATEGORY-MASTER-001 — reads expose the authoritative Category
  // relation alongside the legacy snapshot.
  private static readonly PREFERRED_CATEGORY_REF_SELECT = {
    select: { id: true, code: true, name: true, isActive: true },
  } as const;

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

  // A LEASING_EXECUTIVE can view every Customer (same as other CRM roles) but
  // may only mutate (update/delete/log activity/link tenant) ones assigned to
  // themselves — see assertCustomerEditAccess(). Unrelated to BC-016
  // (Mall-scoping), which stays unresolved since Customer still has no mallId.
  private async assertCustomerEditAccess(id: string, scope?: CustomerScope) {
    if (scope?.role !== Role.LEASING_EXECUTIVE) return;
    const customer = await this.prisma.customer.findUnique({ where: { id }, select: { assignedToId: true } });
    if (customer?.assignedToId !== scope.userId) {
      throw new ForbiddenException('Bạn chỉ có thể chỉnh sửa khách hàng do mình phụ trách');
    }
  }

  async findAll(query: {
    status?: CustomerStatus;
    search?: string;
    assignedToId?: string;
    preferredCategoryId?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, search, status, assignedToId, preferredCategoryId } = query;
    const skip = (page - 1) * +limit;

    const where: any = { isActive: true, deletedAt: null };
    if (status) where.status = status;
    if (assignedToId) where.assignedToId = assignedToId;
    // Filter by FK identity, never by display text.
    if (preferredCategoryId) where.preferredCategoryId = preferredCategoryId;
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
          preferredCategoryRef: CustomersService.PREFERRED_CATEGORY_REF_SELECT,
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
        preferredCategoryRef: CustomersService.PREFERRED_CATEGORY_REF_SELECT,
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

  /**
   * MON-CUR-CUST-03 — a Customer is never persisted with a budget and no unit of
   * account on a direct write. Checked against the MERGED state, so a legacy row
   * stays editable and only a write that introduces or changes a budget figure
   * is blocked.
   */
  private assertCustomerBudgetCurrency(
    incoming: { budgetMin?: number | null; budgetMax?: number | null; currencyCode?: CurrencyCode | null },
    existing?: { budgetMin?: number | null; budgetMax?: number | null; currencyCode?: CurrencyCode | null },
  ) {
    const writesMoney =
      (incoming.budgetMin !== undefined && incoming.budgetMin !== null) ||
      (incoming.budgetMax !== undefined && incoming.budgetMax !== null);
    if (!writesMoney) return;

    const resulting = incoming.currencyCode ?? existing?.currencyCode ?? null;
    if (!resulting) {
      throw new BadRequestException(
        'Vui lòng chọn đơn vị tiền tệ cho ngân sách thuê (budgetMin/budgetMax). ' +
          'Hệ thống không mặc định VND và không quy đổi tỷ giá.',
      );
    }
  }

  /**
   * MON-CUR-CUST-02 — a budget currency copied from a Lead must equal the source
   * Lead's currency. Fails closed rather than converting or overwriting.
   *
   * Two ways this trips:
   *   - both sides carry an explicit currency and they differ;
   *   - the Lead's currency is UNKNOWN while the Customer has an explicit one,
   *     which would stamp a unit of account onto an amount that has none.
   */
  private assertLeadCustomerCurrencyCompatible(lead: any, customer: any) {
    const copiesMoney = lead?.expectedRent !== undefined && lead?.expectedRent !== null;
    if (!copiesMoney) return;

    const leadCurrency: CurrencyCode | null = lead.currencyCode ?? null;
    const customerCurrency: CurrencyCode | null = customer?.currencyCode ?? null;
    if (!customerCurrency) return;
    if (leadCurrency === customerCurrency) return;

    throw new ConflictException({
      code: 'CUSTOMER_CURRENCY_CONFLICT',
      message:
        'Không thể đồng bộ ngân sách: đơn vị tiền tệ của Lead và của hồ sơ khách hàng khác nhau. ' +
        'Hệ thống không quy đổi tỷ giá — vui lòng thống nhất đơn vị tiền tệ trước khi đồng bộ.',
      leadId: lead.id,
      customerId: customer?.id ?? null,
      leadCurrency,
      customerCurrency,
      field: 'budgetMin',
    });
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
    this.assertCustomerBudgetCurrency(customerDto as any);

    // CR-CRM-CATEGORY-MASTER-001 — resolve against the Category master before
    // the insert, so an unknown/inactive id yields no Customer at all.
    const { preferredCategory, preferredCategoryId, ...rest } = customerDto as any;
    const resolved = await this.categoryResolver.resolveForWrite({
      categoryId: preferredCategoryId,
      legacyText: preferredCategory,
      existingCategoryId: null,
      subject: 'new Customer',
    });

    const customerCode = await this.generateCustomerCode();
    return this.prisma.customer.create({
      data: {
        ...rest,
        ...(resolved.categoryId !== undefined ? { preferredCategoryId: resolved.categoryId } : {}),
        ...(resolved.categoryName !== undefined ? { preferredCategory: resolved.categoryName } : {}),
        customerCode,
        createdById: userId,
        ...(leadId ? { leads: { connect: { id: leadId } } } : {}),
      } as any,
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        preferredCategoryRef: CustomersService.PREFERRED_CATEGORY_REF_SELECT,
        leads: { select: { id: true, brandName: true, contactName: true, status: true } },
      },
    });
  }

  async update(
    id: string,
    dto: Partial<CreateCustomerDto> & { status?: CustomerStatus; lostReason?: string; tenantId?: string },
    scope?: CustomerScope,
    idempotencyKey?: string,
  ) {
    const existing = await this.findOne(id);
    await this.assertCustomerEditAccess(id, scope);
    this.assertCustomerBudgetCurrency(dto as any, existing as any);
    const data: any = { ...dto };

    // CR-CRM-CATEGORY-MASTER-001 — the category pair never reaches Prisma
    // straight from the payload. Omitting preferredCategoryId means UNCHANGED,
    // so a status change or a budget edit can never erase it (CRM-CAT-013).
    delete data.preferredCategory;
    delete data.preferredCategoryId;
    const resolvedCategory = await this.categoryResolver.resolveForWrite({
      categoryId: (dto as any).preferredCategoryId,
      legacyText: (dto as any).preferredCategory,
      existingCategoryId: (existing as any).preferredCategoryId ?? null,
      subject: `Customer ${id}`,
    });
    if (resolvedCategory.categoryId !== undefined) data.preferredCategoryId = resolvedCategory.categoryId;
    if (resolvedCategory.categoryName !== undefined) data.preferredCategory = resolvedCategory.categoryName;

    if (dto.status === CustomerStatus.ACTIVE && !data.wonAt) data.wonAt = new Date();
    if (dto.status === CustomerStatus.INACTIVE && !data.lostAt) data.lostAt = new Date();

    const include = {
      assignedTo: { select: { id: true, fullName: true } },
      tenant: { select: { id: true, brandName: true, companyName: true } },
      preferredCategoryRef: CustomersService.PREFERRED_CATEGORY_REF_SELECT,
    } as const;
    if (!dto.status || dto.status === existing.status) {
      return this.prisma.customer.update({ where: { id }, data, include });
    }

    const targetByCustomerStatus: Partial<Record<CustomerStatus, {
      target: LeadStatus;
      where: Prisma.LeadWhereInput;
    }>> = {
      [CustomerStatus.ACTIVE]: {
        target: LeadStatus.WON,
        where: { status: { notIn: [LeadStatus.WON, LeadStatus.LOST] } },
      },
      [CustomerStatus.INACTIVE]: {
        target: LeadStatus.LOST,
        where: { status: { not: LeadStatus.WON } },
      },
      [CustomerStatus.NEGOTIATING]: {
        target: LeadStatus.NEGOTIATION,
        where: { status: { in: [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.QUALIFIED] } },
      },
    };
    const mapping = targetByCustomerStatus[dto.status];
    if (mapping && !scope?.userId) {
      throw new BadRequestException('Customer status transition requires an actor');
    }
    const operationKey = idempotencyKey ?? `customer-status:${id}:${dto.status}:${randomUUID()}`;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id }, data, include });
      if (!mapping) return updated;

      const leads = await tx.lead.findMany({
        where: { customerId: id, isActive: true, ...mapping.where },
        select: { id: true },
      });
      for (const lead of leads) {
        await this.leadLifecycle.transition({
          leadId: lead.id,
          targetStatus: mapping.target,
          actor: LeadLifecycleService.userActor(scope!.userId),
          sourceModule: CrmEventSourceModule.CUSTOMER,
          sourceEntityType: 'CUSTOMER',
          sourceEntityId: id,
          occurredAt: new Date(),
          reasonCode: `CUSTOMER_STATUS_${dto.status}`,
          idempotencyKey: `${operationKey}:lead:${lead.id}`,
        }, tx);
      }
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async remove(id: string, scope?: CustomerScope) {
    await this.findOne(id);
    await this.assertCustomerEditAccess(id, scope);
    await this.prisma.customer.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { message: 'Customer deleted' };
  }

  async addActivity(customerId: string, dto: CreateCustomerActivityDto, userId: string, scope?: CustomerScope) {
    await this.findOne(customerId);
    await this.assertCustomerEditAccess(customerId, scope);
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

  /**
   * MON-CUR-CUST-01 — a monetary value copied from a Lead keeps its unit of
   * account.
   *
   * `budgetMin <- lead.expectedRent` used to travel alone. Once Wave 3 gave
   * `Lead` an explicit currency, that copy started DROPPING a currency that
   * existed (CUR-002-CUSTOMER). The currency now moves with the amount.
   *
   * A NULL `lead.currencyCode` is copied as NULL, not as VND: the destination
   * then explicitly means UNKNOWN. Rejecting instead would block a legacy lead
   * from ever being marked WON, since `createFromLead` runs on that transition
   * -- a business regression, not a safety gain. This is the "legacy
   * synchronisation" carve-out, and it is surfaced, never silent.
   */
  private customerDataFromLead(lead: any) {
    const data: any = {};
    const mappedFields: Array<[string, unknown]> = [
      ['companyName', lead.company || lead.brandName],
      ['brandName', lead.brandName],
      ['contactName', lead.contactName],
      ['phone', lead.phone],
      ['email', lead.email],
      // CR-CRM-CATEGORY-MASTER-001 — conversion carries the CANONICAL identity
      // across. The text is only the snapshot that travels with it; it is never
      // re-matched against the master by name, which is what previously let a
      // Lead and its Customer drift onto different categories.
      ['preferredCategoryId', lead.categoryId],
      ['preferredCategory', lead.categoryId ? lead.category : lead.preferredCategory || lead.category],
      ['expectedArea', lead.expectedArea],
      ['budgetMin', lead.expectedRent],
      ['currencyCode', lead.currencyCode],
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
    const existingCustomer = await this.findOne(customerId);
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || !lead.isActive || lead.deletedAt) {
      throw new NotFoundException('Không tìm thấy Lead để đồng bộ.');
    }
    if (lead.customerId && lead.customerId !== customerId) {
      throw new ConflictException('Lead này đã liên kết với một hồ sơ khách hàng khác.');
    }

    // MON-CUR-CUST-02 — refuse to move money across a currency boundary.
    this.assertLeadCustomerCurrencyCompatible(lead, existingCustomer);

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

  async linkTenant(customerId: string, tenantId: string, scope?: CustomerScope) {
    await this.findOne(customerId);
    await this.assertCustomerEditAccess(customerId, scope);
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { tenantId, status: CustomerStatus.ACTIVE, wonAt: new Date() },
      include: {
        tenant: { select: { id: true, brandName: true, companyName: true } },
      },
    });
  }
}
