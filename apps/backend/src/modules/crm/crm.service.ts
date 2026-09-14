import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeadDto, UpdateLeadDto } from './dto/create-lead.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import {
  CrmActorType,
  CrmBusinessEventType,
  CrmEventSourceModule,
  CrmFollowUpStatus,
  LeadStatus,
  Role,
  UnitLeaseTermType,
  CurrencyCode,
  Prisma,
} from '@prisma/client';
import {
  groupPipelineValueByCurrency,
  groupValueByStatusAndCurrency,
  resolveDealCurrency,
  leadValue,
} from './lead-pipeline-currency';
import { CustomersService } from './customers.service';
import { CategoryResolverService } from '../../common/services/category-resolver.service';
import { CRM_EVENT_LEDGER_ACTIVATION_AT, CrmBusinessEventService } from './crm-business-event.service';
import { LeadLifecycleService } from './lead-lifecycle.service';
import { randomUUID } from 'crypto';

/**
 * CR-CRM-BUSINESS-EVENT-001A — stale evaluation is report-only until the
 * activity source, last-touch projection and final BC-029 policy are trusted.
 */
export const AUTO_LOST_MODE = 'DRY_RUN' as const;
export const AUTO_LOST_REASON_CODE = 'NO_ACTIVITY_BEFORE_CUTOFF' as const;

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);
  constructor(
    private prisma: PrismaService,
    private customersService: CustomersService,
    private categoryResolver: CategoryResolverService,
    private crmEvents: CrmBusinessEventService,
    private leadLifecycle: LeadLifecycleService,
  ) {}

  // CR-CRM-CATEGORY-MASTER-001 — every Lead read exposes the authoritative
  // Category relation so the UI never has to reconstruct identity from the
  // legacy text snapshot.
  private static readonly CATEGORY_REF_SELECT = {
    select: { id: true, code: true, name: true, isActive: true },
  } as const;

  // Read access is mall-scoped for every role, LEASING_EXECUTIVE included — they
  // can see all leads related to their malls, not just their own assignments.
  // Editing a lead someone else owns is a separate, stricter check: see
  // assertLeadEditAccess().
  private leadScope(scope?: { userId: string; role: Role; mallIds?: string[] }) {
    if (!scope?.mallIds) return {};
    // BC-030 safe fallback: persisted Lead.mallId is the only Mall authority.
    // Relationship inference changes over time and can cross Malls, so a
    // Mall-scoped user must not read or mutate a null-Mall Lead. Global ADMIN
    // access reaches this method without mallIds and remains explicit.
    return { mallId: { in: scope.mallIds } };
  }

  async assertLeadAccess(id: string, scope?: { userId: string; role: Role; mallIds?: string[] }) {
    const lead = await this.prisma.lead.findFirst({ where: { id, isActive: true, ...this.leadScope(scope) }, select: { id: true } });
    if (!lead) throw new NotFoundException('Lead not found or outside your mall access');
  }

  // A LEASING_EXECUTIVE can view every lead in their malls but may only
  // mutate (update/move/delete/log activity/link customer) leads assigned to
  // themselves.
  async assertLeadEditAccess(id: string, scope?: { userId: string; role: Role; mallIds?: string[] }) {
    await this.assertLeadAccess(id, scope);
    if (scope?.role === Role.LEASING_EXECUTIVE) {
      const lead = await this.prisma.lead.findFirst({ where: { id, assignedToId: scope.userId }, select: { id: true } });
      if (!lead) throw new ForbiddenException('Bạn chỉ có thể thao tác trên lead do mình phụ trách');
    }
  }

  async findAll(query: {
    status?: LeadStatus;
    statuses?: string;
    assignedToId?: string;
    customerId?: string;
    mallId?: string;
    categoryId?: string;
    leaseTermType?: UnitLeaseTermType;
    search?: string;
    page?: number;
    limit?: number;
    scope?: { userId: string; role: Role; mallIds?: string[] };
  }) {
    const { page = 1, limit = 20, search, status, statuses, assignedToId, customerId, mallId, leaseTermType, categoryId } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true, deletedAt: null, ...this.leadScope(query.scope) };
    if (status && statuses) {
      throw new BadRequestException('Chỉ dùng một trong hai bộ lọc status hoặc statuses');
    }
    if (statuses) {
      const requestedStatuses = [...new Set(statuses.split(',').map((value) => value.trim()).filter(Boolean))];
      const validStatuses = new Set<string>(Object.values(LeadStatus));
      const invalidStatuses = requestedStatuses.filter((value) => !validStatuses.has(value));
      if (!requestedStatuses.length || invalidStatuses.length) {
        throw new BadRequestException(`Trạng thái Lead không hợp lệ: ${invalidStatuses.join(', ') || statuses}`);
      }
      where.status = { in: requestedStatuses as LeadStatus[] };
    } else if (status) {
      where.status = status;
    }
    if (assignedToId) where.assignedToId = assignedToId;
    if (customerId) where.customerId = customerId;
    // CR-CRM-CATEGORY-MASTER-001 — category filtering is by FK identity, never
    // by display text, so renaming a Category cannot break a saved filter.
    if (categoryId) where.categoryId = categoryId;
    // An explicit Mall filter is stricter than the general CRM visibility
    // scope. Booking may only pair a Lead whose owning mallId matches the
    // selected Unit, so related/assigned Leads from another Mall must not be
    // returned as selectable finder results.
    if (mallId) where.mallId = mallId;
    if (leaseTermType) where.leaseTermType = leaseTermType;
    if (search) {
      where.OR = [
        { brandName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: +limit,
        include: {
          assignedTo: { select: { id: true, fullName: true, email: true } },
          tenant: { select: { id: true, brandName: true, companyName: true } },
          customer: { select: { id: true, customerCode: true, companyName: true } },
          categoryRef: CrmService.CATEGORY_REF_SELECT,
          _count: { select: { activities: true, proposals: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async getPipeline(limit = 100, scope?: { userId: string; role: Role; mallIds?: string[] }, leaseTermType?: UnitLeaseTermType) {
    const statuses = Object.values(LeadStatus);
    const pipeline: Record<string, { leads: any[]; total: number; hasMore: boolean }> = {};

    await Promise.all(
      statuses.map(async (status) => {
        const [leads, total] = await Promise.all([
          this.prisma.lead.findMany({
            where: { status, isActive: true, deletedAt: null, ...(leaseTermType ? { leaseTermType } : {}), ...this.leadScope(scope) },
            include: {
              assignedTo: { select: { id: true, fullName: true, avatar: true } },
              customer: { select: { id: true, customerCode: true } },
              categoryRef: CrmService.CATEGORY_REF_SELECT,
              _count: { select: { activities: true, proposals: true } },
            },
            orderBy: [
              { priority: 'asc' }, // HOT=0, WARM=1, COLD=2 (enum order)
              { position: 'asc' },
              { updatedAt: 'desc' },
            ],
            take: limit,
          }),
          this.prisma.lead.count({ where: { status, isActive: true, deletedAt: null, ...(leaseTermType ? { leaseTermType } : {}), ...this.leadScope(scope) } }),
        ]);
        pipeline[status] = { leads, total, hasMore: total > limit };
      }),
    );

    return pipeline;
  }

  async moveLead(
    id: string,
    targetStatus: LeadStatus,
    targetPosition: number,
    userId: string,
    idempotencyKey?: string,
  ) {
    const lead = await this.findOne(id);
    const oldStatus = lead.status;

    const transition = await this.leadLifecycle.transition({
      leadId: id,
      targetStatus,
      position: targetPosition,
      actor: LeadLifecycleService.userActor(userId),
      sourceModule: CrmEventSourceModule.CRM,
      sourceEntityType: 'LEAD',
      sourceEntityId: id,
      occurredAt: new Date(),
      idempotencyKey: idempotencyKey ?? `manual-lead-move:${id}:${randomUUID()}`,
    });
    const updated = await this.findOne(id);

    // If status changed, handle side effects
    if (transition.changed && oldStatus !== targetStatus) {
      // Sync customer status if linked
      if (updated.customerId) {
        const targetCustomerStatus = this.LEAD_TO_CUSTOMER[targetStatus];
        const currentStatus = (updated.customer as any)?.status ?? 'PROSPECT';
        const shouldAdvance =
          targetCustomerStatus &&
          this.CUSTOMER_RANK[targetCustomerStatus] > this.CUSTOMER_RANK[currentStatus];
        const shouldMarkLost =
          targetStatus === 'LOST' && !['ACTIVE', 'BLACKLISTED'].includes(currentStatus);

        if (shouldAdvance) {
          await this.prisma.customer.update({
            where: { id: updated.customerId },
            data: { status: targetCustomerStatus as any },
          });
        } else if (shouldMarkLost) {
          await this.prisma.customer.update({
            where: { id: updated.customerId },
            data: { status: 'INACTIVE' as any, lostAt: new Date() },
          });
        }
      }

      // If WON, create customer from lead
      if (targetStatus === 'WON' && userId) {
        await this.customersService.createFromLead(id, userId);
      }
    }

    return updated;
  }

  async findOne(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        tenant: true,
        categoryRef: CrmService.CATEGORY_REF_SELECT,
        customer: {
          select: {
            id: true, customerCode: true, status: true,
            companyName: true, brandName: true, taxCode: true,
            address: true, industry: true, website: true,
            contactName: true, contactTitle: true, phone: true, email: true,
            rating: true, budgetMin: true, budgetMax: true, notes: true,
            preferredCategory: true, preferredCategoryId: true,
            preferredCategoryRef: { select: { id: true, code: true, name: true, isActive: true } },
            assignedTo: { select: { id: true, fullName: true } },
            activities: {
              include: { createdBy: { select: { id: true, fullName: true } } },
              orderBy: { createdAt: 'desc' },
              take: 30,
            },
          },
        },
        activities: {
          include: { createdBy: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        proposals: {
          where: { isActive: true },
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
    });

    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  /**
   * RPT-CUR-005 — a Lead may not be written with money but no unit of account.
   *
   * `Lead` has no mandatory monetary parent: `mallId` is optional, there is no
   * Unit relation, and Proposal/UnitBooking are one-to-many and only appear
   * AFTER the lead's figures are entered. Reconciliation confirmed inference is
   * unsafe in practice — one seeded lead links to an MMK Proposal and a VND
   * UnitBooking at once. So there is no deterministic inheritance rule to fall
   * back on and the currency must be supplied explicitly.
   *
   * Legacy rows (money, currency NULL) stay editable: this only fires when a
   * write actually introduces or changes an amount.
   */
  private assertLeadCurrency(
    incoming: { expectedRent?: number | null; estimatedValue?: number | null; currencyCode?: CurrencyCode | null },
    existing?: { expectedRent?: number | null; estimatedValue?: number | null; currencyCode?: CurrencyCode | null },
  ) {
    const writesMoney =
      (incoming.expectedRent !== undefined && incoming.expectedRent !== null) ||
      (incoming.estimatedValue !== undefined && incoming.estimatedValue !== null);
    if (!writesMoney) return;

    const resultingCurrency = incoming.currencyCode ?? existing?.currencyCode ?? null;
    if (!resultingCurrency) {
      throw new BadRequestException(
        'Vui lòng chọn đơn vị tiền tệ cho giá thuê kỳ vọng / giá trị ước tính. ' +
          'Hệ thống không mặc định VND và không quy đổi tỷ giá.',
      );
    }
  }

  async create(dto: CreateLeadDto & { customerId?: string }, userId: string) {
    this.assertLeadCurrency(dto);

    // CR-CRM-CATEGORY-MASTER-001 — the category pair is never written straight
    // from the payload. An unknown/inactive categoryId throws here, before the
    // create, so a rejected category leaves no partial Lead behind.
    const { category, categoryId, ...rest } = dto;
    const resolved = await this.categoryResolver.resolveForWrite({
      categoryId,
      legacyText: category,
      existingCategoryId: null,
      subject: 'new Lead',
    });

    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          ...rest,
          ...(resolved.categoryId !== undefined ? { categoryId: resolved.categoryId } : {}),
          ...(resolved.categoryName !== undefined ? { category: resolved.categoryName } : {}),
        } as any,
        include: {
          assignedTo: { select: { id: true, fullName: true } },
          customer: { select: { id: true, customerCode: true } },
          categoryRef: CrmService.CATEGORY_REF_SELECT,
        },
      });
      await this.crmEvents.append({
        leadId: lead.id,
        eventType: CrmBusinessEventType.LEAD_CREATED,
        occurredAt: lead.createdAt,
        actor: { type: CrmActorType.USER, userId },
        sourceModule: CrmEventSourceModule.CRM,
        sourceEntityType: 'LEAD',
        sourceEntityId: lead.id,
        toStatus: lead.status,
        idempotencyKey: `lead-created:${lead.id}`,
      }, tx);
      return lead;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async createCustomerProfile(leadId: string, userId: string) {
    return this.customersService.createProfileFromLead(leadId, userId);
  }

  async syncLeadToCustomer(leadId: string, customerId: string) {
    if (!customerId) throw new BadRequestException('Vui lòng chọn hồ sơ khách hàng.');
    return this.customersService.syncFromLead(customerId, leadId);
  }

  // Lead status → corresponding Customer status
  private readonly LEAD_TO_CUSTOMER: Record<string, string> = {
    NEW: 'PROSPECT', CONTACTED: 'PROSPECT', QUALIFIED: 'PROSPECT',
    PROPOSAL: 'NEGOTIATING', NEGOTIATION: 'NEGOTIATING',
    WON: 'ACTIVE', LOST: 'INACTIVE',
  };
  // ACTIVE/INACTIVE are terminal — never downgrade past them
  private readonly CUSTOMER_RANK: Record<string, number> = {
    PROSPECT: 1, NEGOTIATING: 2, ACTIVE: 3, INACTIVE: 0, BLACKLISTED: 0,
  };

  async update(
    id: string,
    dto: UpdateLeadDto & { customerId?: string },
    userId: string,
    idempotencyKey?: string,
  ) {
    const existing = await this.findOne(id);

    // Chặn nhảy thẳng lên WON khi chưa có Proposal nào được duyệt — tránh tạo Customer/kích hoạt
    // (customersService.createFromLead bên dưới) cho một lead chưa thực sự chốt được deal, cùng
    // lớp bảo vệ như state machine đã thêm cho Contract/Proposal.
    if (dto.status === 'WON' && existing.status !== 'WON') {
      const hasApprovedProposal = (existing as any).proposals?.some((p: any) =>
        ['APPROVED', 'CONVERTED'].includes(p.status),
      );
      if (!hasApprovedProposal) {
        throw new BadRequestException(
          'Lead cần có ít nhất một đề xuất (Proposal) đã được duyệt trước khi đánh dấu Đã chốt (WON).',
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (dto.brandName !== undefined) updateData.brandName = dto.brandName;
    if (dto.company !== undefined) updateData.company = dto.company;
    if (dto.contactName !== undefined) updateData.contactName = dto.contactName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.email !== undefined) updateData.email = dto.email;
    // CR-CRM-CATEGORY-MASTER-001 — category is resolved against the master, not
    // copied from the payload. `categoryId` omitted means UNCHANGED, so editing
    // an unrelated field can never erase the category (CRM-CAT-004).
    const resolvedCategory = await this.categoryResolver.resolveForWrite({
      categoryId: (dto as any).categoryId,
      legacyText: dto.category,
      existingCategoryId: (existing as any).categoryId ?? null,
      subject: `Lead ${id}`,
    });
    if (resolvedCategory.categoryId !== undefined) updateData.categoryId = resolvedCategory.categoryId;
    if (resolvedCategory.categoryName !== undefined) updateData.category = resolvedCategory.categoryName;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.source !== undefined) updateData.source = dto.source;
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.leaseTermType !== undefined) updateData.leaseTermType = dto.leaseTermType;
    if (dto.assignedToId !== undefined) updateData.assignedToId = dto.assignedToId;
    if ((dto as any).mallId !== undefined) updateData.mallId = (dto as any).mallId;
    if ((dto as any).expectedArea !== undefined) updateData.expectedArea = (dto as any).expectedArea;
    if ((dto as any).expectedRent !== undefined) updateData.expectedRent = (dto as any).expectedRent;
    if ((dto as any).currencyCode !== undefined) updateData.currencyCode = (dto as any).currencyCode;
    if ((dto as any).customerId !== undefined) updateData.customerId = (dto as any).customerId;

    // RPT-CUR-005 — checked against the MERGED state, so setting a new amount on
    // a legacy currency-less lead is rejected while editing its other fields is
    // still allowed.
    this.assertLeadCurrency(dto as any, existing as any);

    const include = {
      assignedTo: { select: { id: true, fullName: true } },
      customer: { select: { id: true, customerCode: true, status: true } },
      categoryRef: CrmService.CATEGORY_REF_SELECT,
    } as const;

    const changedFields = Object.keys(updateData).filter((field) => {
      const previous = field === 'assignedToId'
        ? (existing as any).assignedTo?.id ?? null
        : field === 'customerId'
          ? (existing as any).customer?.id ?? null
          : (existing as any)[field] ?? null;
      return previous !== (updateData as any)[field];
    });
    const changesStatus = dto.status !== undefined && dto.status !== existing.status;
    if (!changesStatus && changedFields.length === 0) return existing;
    const operationKey = idempotencyKey ?? `manual-lead-update:${id}:${randomUUID()}`;
    const occurredAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      if (changedFields.length) {
        await tx.lead.update({ where: { id }, data: updateData });
        const specializedType = changedFields.length === 1
          ? changedFields[0] === 'assignedToId'
            ? CrmBusinessEventType.LEAD_OWNER_CHANGED
            : changedFields[0] === 'categoryId' || changedFields[0] === 'category'
              ? CrmBusinessEventType.LEAD_CATEGORY_CHANGED
              : changedFields[0] === 'mallId'
                ? CrmBusinessEventType.LEAD_MALL_ASSIGNED
                : CrmBusinessEventType.LEAD_UPDATED
          : CrmBusinessEventType.LEAD_UPDATED;
        await this.crmEvents.append({
          leadId: id,
          eventType: specializedType,
          occurredAt,
          actor: LeadLifecycleService.userActor(userId),
          sourceModule: CrmEventSourceModule.CRM,
          sourceEntityType: 'LEAD',
          sourceEntityId: id,
          metadata: { changedFields },
          idempotencyKey: `${operationKey}:fields`,
        }, tx);
      }
      if (changesStatus) {
          await this.leadLifecycle.transition({
            leadId: id,
            targetStatus: dto.status!,
            actor: LeadLifecycleService.userActor(userId),
            sourceModule: CrmEventSourceModule.CRM,
            sourceEntityType: 'LEAD',
            sourceEntityId: id,
            occurredAt,
            idempotencyKey: `${operationKey}:status`,
            preserveExistingWonValidation: true,
          }, tx);
      }
      return tx.lead.findUniqueOrThrow({ where: { id }, include });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (dto.status && dto.status !== existing.status) {
      if (dto.status === 'WON') {
        await this.customersService.createFromLead(id, userId);
      } else if (updated.customerId) {
        const targetStatus = this.LEAD_TO_CUSTOMER[dto.status];
        const currentStatus = (updated.customer as any)?.status ?? 'PROSPECT';
        const shouldAdvance =
          targetStatus &&
          this.CUSTOMER_RANK[targetStatus] > this.CUSTOMER_RANK[currentStatus];
        const shouldMarkLost =
          dto.status === 'LOST' && !['ACTIVE', 'BLACKLISTED'].includes(currentStatus);

        if (shouldAdvance) {
          await this.prisma.customer.update({
            where: { id: updated.customerId },
            data: { status: targetStatus as any },
          });
        } else if (shouldMarkLost) {
          await this.prisma.customer.update({
            where: { id: updated.customerId },
            data: { status: 'INACTIVE' as any, lostAt: new Date() },
          });
        }
      }
    }

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.lead.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { message: 'Lead deleted' };
  }

  async addActivity(leadId: string, dto: CreateActivityDto, userId: string) {
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id: leadId },
        select: { id: true, isActive: true, deletedAt: true, lastActivityAt: true },
      });
      if (!lead || !lead.isActive || lead.deletedAt) throw new NotFoundException('Lead not found');

      const activity = await tx.leadActivity.create({
        data: {
          leadId,
          type: dto.type,
          note: dto.note,
          outcome: dto.outcome,
          source: dto.source ?? 'CRM',
          occurredAt,
          createdById: userId,
        },
        include: { createdBy: { select: { id: true, fullName: true } } },
      });

      // A back-dated activity is valid evidence but must not move the current
      // last-touch projection backwards.
      if (!lead.lastActivityAt || occurredAt > lead.lastActivityAt) {
        await tx.lead.update({
          where: { id: leadId },
          data: { lastActivityAt: occurredAt },
        });
      }

      await this.crmEvents.append({
        leadId,
        eventType: CrmBusinessEventType.ACTIVITY_ADDED,
        occurredAt,
        actor: LeadLifecycleService.userActor(userId),
        sourceModule: CrmEventSourceModule.CRM,
        sourceEntityType: 'LEAD_ACTIVITY',
        sourceEntityId: activity.id,
        comment: dto.note,
        metadata: {
          activityType: dto.type,
          outcome: dto.outcome ?? null,
          source: dto.source ?? 'CRM',
        },
        idempotencyKey: `lead-activity-created:${activity.id}`,
      }, tx);

      return activity;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getStats(scope?: { userId: string; role: Role; mallIds?: string[] }) {
    const scopedWhere = { isActive: true, ...this.leadScope(scope) };
    const [total, byStatus] = await Promise.all([
      this.prisma.lead.count({ where: scopedWhere }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: scopedWhere,
        _count: true,
      }),
    ]);

    return {
      total,
      byStatus,
      wonThisMonth: null,
      lostThisMonth: null,
      historicalCoverage: 'PARTIAL' as const,
      coverageMessage: `Không đủ dữ liệu lịch sử trước ${CRM_EVENT_LEDGER_ACTIVATION_AT}; dùng /crm/pipeline/stats cho KPI event-based.`,
    };
  }

  async listFollowUps(query: { leadId?: string; assignedToId?: string; isDone?: string; daysAhead?: number; scope?: { userId: string; role: Role; mallIds?: string[] } }) {
    const where: any = {};
    if (query.leadId) where.leadId = query.leadId;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.isDone !== undefined) {
      where.status = query.isDone === 'true'
        ? CrmFollowUpStatus.COMPLETED
        : CrmFollowUpStatus.OPEN;
    }
    if (query.daysAhead) {
      const future = new Date();
      future.setDate(future.getDate() + +query.daysAhead);
      where.dueDate = { lte: future };
    }
    Object.assign(where, this.followUpScope(query.scope));
    return this.prisma.leadFollowUp.findMany({
      where,
      include: {
        lead: { select: { id: true, brandName: true, status: true } },
        customer: { select: { id: true, companyName: true, brandName: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
  }

  async createFollowUp(
    dto: { leadId?: string; customerId?: string; assignedToId: string; dueDate: string; note?: string },
    createdById: string,
    scope?: { userId: string; role: Role; mallIds?: string[] },
  ) {
    if (dto.leadId) await this.assertLeadEditAccess(dto.leadId, scope);
    const assignedToId = dto.assignedToId ?? createdById;
    if (scope?.mallIds) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: assignedToId, mallAccess: { some: { isActive: true, mallId: { in: scope.mallIds } } } },
        select: { id: true },
      });
      if (!assignee) throw new ForbiddenException('Follow-up assignee is outside your mall access');
    }
    return this.prisma.$transaction(async (tx) => {
      const followUp = await tx.leadFollowUp.create({
        data: {
          leadId: dto.leadId,
          customerId: dto.customerId,
          assignedToId,
          createdById,
          dueDate: new Date(dto.dueDate),
          note: dto.note,
          status: CrmFollowUpStatus.OPEN,
        },
        include: {
          lead: { select: { id: true, brandName: true } },
          customer: { select: { id: true, companyName: true } },
          assignedTo: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      });
      if (followUp.leadId) {
        await this.crmEvents.append({
          leadId: followUp.leadId,
          eventType: CrmBusinessEventType.FOLLOW_UP_CREATED,
          occurredAt: followUp.createdAt,
          actor: LeadLifecycleService.userActor(createdById),
          sourceModule: CrmEventSourceModule.CRM,
          sourceEntityType: 'FOLLOW_UP',
          sourceEntityId: followUp.id,
          comment: followUp.note ?? undefined,
          metadata: { dueDate: followUp.dueDate.toISOString(), assignedToId },
          idempotencyKey: `follow-up-created:${followUp.id}`,
        }, tx);
      }
      return followUp;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async completeFollowUp(
    id: string,
    input: { outcome?: string; comment?: string } = {},
    scope?: { userId: string; role: Role; mallIds?: string[] },
  ) {
    if (!scope?.userId) throw new ForbiddenException('Authenticated user is required');
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.leadFollowUp.findFirst({
        where: { id, ...this.followUpScope(scope) },
      });
      if (!current) throw new NotFoundException('Follow-up not found or outside your mall access');
      if (current.status === CrmFollowUpStatus.COMPLETED) return current;
      if (current.status !== CrmFollowUpStatus.OPEN) {
        throw new ConflictException('Cancelled follow-up cannot be completed');
      }
      const completedAt = new Date();
      const winner = await tx.leadFollowUp.updateMany({
        where: { id, status: CrmFollowUpStatus.OPEN },
        data: {
          status: CrmFollowUpStatus.COMPLETED,
          isDone: true,
          completedAt,
          completedById: scope.userId,
          outcome: input.outcome,
          completionComment: input.comment,
        },
      });
      if (winner.count !== 1) throw new ConflictException('Follow-up lifecycle changed concurrently');
      if (current.leadId) {
        await this.crmEvents.append({
          leadId: current.leadId,
          eventType: CrmBusinessEventType.FOLLOW_UP_COMPLETED,
          occurredAt: completedAt,
          actor: LeadLifecycleService.userActor(scope.userId),
          sourceModule: CrmEventSourceModule.CRM,
          sourceEntityType: 'FOLLOW_UP',
          sourceEntityId: id,
          comment: input.comment,
          metadata: { outcome: input.outcome ?? null },
          idempotencyKey: `follow-up-completed:${id}`,
        }, tx);
      }
      return tx.leadFollowUp.findUniqueOrThrow({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancelFollowUp(
    id: string,
    cancellationReason: string,
    scope?: { userId: string; role: Role; mallIds?: string[] },
  ) {
    if (!scope?.userId) throw new ForbiddenException('Authenticated user is required');
    if (!cancellationReason?.trim()) throw new BadRequestException('Cancellation reason is required');
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.leadFollowUp.findFirst({
        where: { id, ...this.followUpScope(scope) },
      });
      if (!current) throw new NotFoundException('Follow-up not found or outside your mall access');
      if (current.status === CrmFollowUpStatus.CANCELLED) return current;
      if (current.status !== CrmFollowUpStatus.OPEN) {
        throw new ConflictException('Completed follow-up cannot be cancelled');
      }
      const cancelledAt = new Date();
      const winner = await tx.leadFollowUp.updateMany({
        where: { id, status: CrmFollowUpStatus.OPEN },
        data: {
          status: CrmFollowUpStatus.CANCELLED,
          isDone: false,
          cancelledAt,
          cancelledById: scope.userId,
          cancellationReason: cancellationReason.trim(),
        },
      });
      if (winner.count !== 1) throw new ConflictException('Follow-up lifecycle changed concurrently');
      if (current.leadId) {
        await this.crmEvents.append({
          leadId: current.leadId,
          eventType: CrmBusinessEventType.FOLLOW_UP_CANCELLED,
          occurredAt: cancelledAt,
          actor: LeadLifecycleService.userActor(scope.userId),
          sourceModule: CrmEventSourceModule.CRM,
          sourceEntityType: 'FOLLOW_UP',
          sourceEntityId: id,
          reason: cancellationReason.trim(),
          idempotencyKey: `follow-up-cancelled:${id}`,
        }, tx);
      }
      return tx.leadFollowUp.findUniqueOrThrow({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** @deprecated Normal business deletion is cancellation, never a hard delete. */
  async deleteFollowUp(id: string, scope?: { userId: string; role: Role; mallIds?: string[] }) {
    return this.cancelFollowUp(id, 'Cancelled through legacy DELETE endpoint', scope);
  }

  /**
   * A Lead is the authoritative Mall owner when present. A personal/customer
   * follow-up has no Mall-bearing Customer relation (BC-016), so its assigned
   * user's active Mall membership is the only existing authoritative boundary.
   * Keeping the fallback behind `leadId: null` prevents a Mall-B Lead from being
   * smuggled through a Mall-A assignee.
   */
  private followUpScope(scope?: { userId: string; role: Role; mallIds?: string[] }) {
    if (!scope?.mallIds) return {};
    return {
      AND: [{ OR: [
        { lead: { is: this.leadScope(scope) } },
        { leadId: null, assignedTo: { mallAccess: { some: { isActive: true, mallId: { in: scope.mallIds } } } } },
      ] }],
    };
  }

  private async assertFollowUpAccess(id: string, scope?: { userId: string; role: Role; mallIds?: string[] }) {
    const followUp = await this.prisma.leadFollowUp.findFirst({
      where: { id, ...this.followUpScope(scope) },
      select: { id: true },
    });
    if (!followUp) throw new NotFoundException('Follow-up not found or outside your mall access');
  }

  // ─── Bulk Actions ───────────────────────────────────────────────────────────────

  async bulkAction(dto: {
    action: 'assign' | 'changeStatus' | 'changePriority' | 'delete';
    leadIds: string[];
    data?: { assignedToId?: string; status?: LeadStatus; priority?: string };
    idempotencyKey?: string;
  }, userId: string) {
    const { action, leadIds, data } = dto;

    if (!leadIds?.length) {
      throw new Error('No leads selected');
    }

    let result: { updated: number; message: string };

    switch (action) {
      case 'assign':
        if (!data?.assignedToId) throw new Error('assignedToId required');
        const assignResult = await this.prisma.lead.updateMany({
          where: { id: { in: leadIds }, isActive: true },
          data: { assignedToId: data.assignedToId },
        });
        result = { updated: assignResult.count, message: `Đã assign ${assignResult.count} leads` };
        break;

      case 'changeStatus':
        if (!data?.status) throw new Error('status required');
        if (leadIds.length > 100) throw new BadRequestException('A status batch is limited to 100 Leads');
        const bulkKey = dto.idempotencyKey ?? `manual-lead-bulk:${randomUUID()}`;
        const statusCount = await this.prisma.$transaction(async (tx) => {
          let matched = 0;
          for (const leadId of leadIds) {
            await this.leadLifecycle.transition({
              leadId,
              targetStatus: data.status!,
              actor: LeadLifecycleService.userActor(userId),
              sourceModule: CrmEventSourceModule.CRM,
              sourceEntityType: 'LEAD_BULK',
              sourceEntityId: bulkKey,
              occurredAt: new Date(),
              idempotencyKey: `${bulkKey}:lead:${leadId}`,
            }, tx);
            matched += 1;
          }
          return matched;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        result = { updated: statusCount, message: `Đã chuyển ${statusCount} leads sang ${data.status}` };
        break;

      case 'changePriority':
        if (!data?.priority) throw new Error('priority required');
        const priorityResult = await this.prisma.lead.updateMany({
          where: { id: { in: leadIds }, isActive: true },
          data: { priority: data.priority as any },
        });
        result = { updated: priorityResult.count, message: `Đã đổi priority ${priorityResult.count} leads sang ${data.priority}` };
        break;

      case 'delete':
        const deleteResult = await this.prisma.lead.updateMany({
          where: { id: { in: leadIds }, isActive: true },
          data: { isActive: false, deletedAt: new Date() },
        });
        result = { updated: deleteResult.count, message: `Đã xóa ${deleteResult.count} leads` };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return result;
  }

  // ─── Pipeline Analytics ─────────────────────────────────────────────────────────

  async getPipelineStats(scope?: { userId: string; role: Role; mallIds?: string[] }) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const mallFilter = scope?.mallIds;
    // Reuse the canonical Lead scope. The prior analytics-only predicate let a
    // LEASING_EXECUTIVE see any directly assigned Lead even when Lead.mallId
    // explicitly belonged to another Mall, and omitted direct Mall ownership
    // for other roles. Aggregates must have the same boundary as record lists.
    const leadWhere: any = { isActive: true, ...this.leadScope(scope) };

    // Get all leads for calculations
    const leads = await this.prisma.lead.findMany({
      where: leadWhere,
      select: {
        id: true,
        status: true,
        priority: true,
        source: true,
        category: true,
        createdAt: true,
        lastActivityAt: true,
        estimatedValue: true,
        expectedRent: true,
        expectedArea: true,
        // RPT-CUR-005: needed to bucket pipeline value by its actual unit.
        currencyCode: true,
        leaseTermType: true,
      },
    });

    // Count by status
    const statusCounts: Record<string, number> = {};
    const statusValues: Record<string, number> = {};
    leads.forEach((l) => {
      statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
      statusValues[l.status] = (statusValues[l.status] || 0) + leadValue(l);
    });
    // RPT-CUR-005 — the authoritative monetary contract. `statusValues` above
    // is retained for backward compatibility but is a cross-currency sum and
    // must never be presented as money; `valueByStatusAndCurrency` is what a
    // consumer should read.
    const valueByStatusAndCurrency = groupValueByStatusAndCurrency(leads);

    // Current-state counts are snapshots, not historical conversion evidence.
    const totalNew = statusCounts['NEW'] || 0;
    const totalContacted = statusCounts['CONTACTED'] || 0;
    const totalQualified = statusCounts['QUALIFIED'] || 0;
    const totalProposal = statusCounts['PROPOSAL'] || 0;
    const totalNegotiation = statusCounts['NEGOTIATION'] || 0;
    const totalWon = statusCounts['WON'] || 0;
    const totalLost = statusCounts['LOST'] || 0;
    const totalActive = leads.length - totalWon - totalLost;

    const eventAccessWhere: Prisma.CrmBusinessEventWhereInput = scope?.role === Role.ADMIN
      ? {}
      : { mallId: { in: scope?.mallIds ?? [] }, scope: 'MALL' };
    const activationAt = new Date(CRM_EVENT_LEDGER_ACTIVATION_AT);
    const evidenceRows = await this.prisma.crmBusinessEvent.findMany({
      where: { ...eventAccessWhere, occurredAt: { gte: activationAt } },
      select: {
        id: true,
        leadId: true,
        eventType: true,
        occurredAt: true,
        fromStatus: true,
        toStatus: true,
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: 5001,
    });
    const evidenceTruncated = evidenceRows.length > 5000;
    const evidence = evidenceRows.slice(0, 5000);
    const eventCount = (predicate: (event: typeof evidence[number]) => boolean) => evidence.filter(predicate).length;
    const transitionCount = (from: LeadStatus, to: LeadStatus) => eventCount(
      (event) => event.fromStatus === from && event.toStatus === to,
    );
    const transitionRate = (from: LeadStatus, to: LeadStatus) => {
      const entered = eventCount((event) => event.toStatus === from || event.eventType === CrmBusinessEventType.LEAD_CREATED && from === LeadStatus.NEW);
      return entered > 0 ? transitionCount(from, to) / entered * 100 : null;
    };
    const createdAtByLead = new Map<string, Date>();
    const durationsToWin: number[] = [];
    for (const event of evidence) {
      if (event.eventType === CrmBusinessEventType.LEAD_CREATED) createdAtByLead.set(event.leadId, event.occurredAt);
      if (event.eventType === CrmBusinessEventType.LEAD_WON) {
        const createdAt = createdAtByLead.get(event.leadId);
        if (createdAt && event.occurredAt >= createdAt) {
          durationsToWin.push((event.occurredAt.getTime() - createdAt.getTime()) / 86_400_000);
        }
      }
    }
    const wonEvidence = eventCount((event) => event.eventType === CrmBusinessEventType.LEAD_WON);
    const lostEvidence = eventCount((event) => event.eventType === CrmBusinessEventType.LEAD_LOST);
    const conversionRates = {
      newToContacted: transitionRate(LeadStatus.NEW, LeadStatus.CONTACTED),
      contactedToQualified: transitionRate(LeadStatus.CONTACTED, LeadStatus.QUALIFIED),
      qualifiedToProposal: transitionRate(LeadStatus.QUALIFIED, LeadStatus.PROPOSAL),
      proposalToNegotiation: transitionRate(LeadStatus.PROPOSAL, LeadStatus.NEGOTIATION),
      negotiationToWon: transitionRate(LeadStatus.NEGOTIATION, LeadStatus.WON),
      overallWinRate: wonEvidence + lostEvidence > 0 ? wonEvidence / (wonEvidence + lostEvidence) * 100 : null,
    };
    const avgDaysToWin = durationsToWin.length
      ? durationsToWin.reduce((sum, value) => sum + value, 0) / durationsToWin.length
      : null;
    // Source/category-at-event were not historically captured. Do not group
    // terminal snapshot rows and present them as historical attribution.
    const winLossBySource: Record<string, never> = {};
    const winLossByCategory: Record<string, never> = {};

    // By priority
    const byPriority: Record<string, number> = {};
    leads.forEach((l) => {
      const p = (l as any).priority || 'WARM';
      byPriority[p] = (byPriority[p] || 0) + 1;
    });

    // Pipeline value
    const openLeads = leads.filter((l) => !['WON', 'LOST'].includes(l.status));
    // RPT-CUR-005 — one bucket per currency, plus UNKNOWN for legacy rows whose
    // unit of account was never captured. There is no combined total: producing
    // one would require FX the platform does not have.
    const pipelineValueByCurrency = groupPipelineValueByCurrency(openLeads);
    const totalPipelineValue = openLeads.reduce((sum, l) => sum + leadValue(l), 0);

    const proposalWhere: any = { isActive: true };
    if (mallFilter) proposalWhere.unit = { OR: [{ mallId: { in: mallFilter } }, { floor: { mallId: { in: mallFilter } } }] };
    const proposalGroups = await this.prisma.proposal.groupBy({
      by: ['status'], where: proposalWhere, _count: { _all: true }, _sum: { totalContractValue: true },
    });
    // Multi-currency: proposalValueByStatus/totalContractValue sums are single VND figures --
    // a separate VND-scoped groupBy avoids blending USD/MMK proposals into them, while
    // proposalByStatus (a pure count) stays currency-agnostic from the query above.
    const proposalValueGroups = await this.prisma.proposal.groupBy({
      by: ['status'], where: { ...proposalWhere, rentCurrency: 'VND' }, _sum: { totalContractValue: true },
    });
    const proposalByStatus: Record<string, number> = {};
    const proposalValueByStatus: Record<string, number> = {};
    proposalGroups.forEach((group) => {
      proposalByStatus[group.status] = group._count._all;
    });
    proposalValueGroups.forEach((group) => {
      proposalValueByStatus[group.status] = group._sum.totalContractValue ?? 0;
    });

    // This-month lifecycle counts come only from immutable event timestamps.
    const wonThisMonth = eventCount((event) => event.eventType === CrmBusinessEventType.LEAD_WON && event.occurredAt >= startOfMonth);
    const lostThisMonth = eventCount((event) => event.eventType === CrmBusinessEventType.LEAD_LOST && event.occurredAt >= startOfMonth);
    const newThisMonth = leads.filter(l => new Date(l.createdAt) >= startOfMonth).length;

    const summarizeLeaseTerm = (leaseTermType: UnitLeaseTermType) => {
      const segment = leads.filter((lead) => lead.leaseTermType === leaseTermType);
      const byStatus: Record<string, number> = {};
      const valueByStatus: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      segment.forEach((lead) => {
        byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
        valueByStatus[lead.status] = (valueByStatus[lead.status] || 0) + leadValue(lead);
        byPriority[lead.priority] = (byPriority[lead.priority] || 0) + 1;
      });
      const won = byStatus.WON || 0;
      const lost = byStatus.LOST || 0;
      const segmentOpen = segment.filter((lead) => !['WON', 'LOST'].includes(lead.status));
      return {
        summary: {
          total: segment.length,
          totalActive: segment.length - won - lost,
          totalWon: won,
          totalLost: lost,
          // RPT-CUR-005 — the authoritative figure for this segment.
          pipelineValueByCurrency: groupPipelineValueByCurrency(segmentOpen),
          totalPipelineValue: segmentOpen.reduce((sum, lead) => sum + leadValue(lead), 0),
          // Historical segment attribution is unavailable because lease-term
          // was not captured on the immutable event payload.
          wonThisMonth: null,
          lostThisMonth: null,
          newThisMonth: segment.filter((lead) => new Date(lead.createdAt) >= startOfMonth).length,
        },
        // RPT-CUR-005 — `totalPipelineValue` and `valueByStatus` here remain
        // cross-currency sums kept only for backward compatibility. This flag
        // says so; read the *ByCurrency fields instead.
        pipelineValueCurrencyUnknown: true,
        valueByStatusAndCurrency: groupValueByStatusAndCurrency(segment),
        byStatus,
        valueByStatus,
        byPriority,
        conversionRates: { overallWinRate: null },
      };
    };

    return {
      summary: {
        total: leads.length,
        totalActive,
        totalWon,
        totalLost,
        totalPipelineValue,
        wonThisMonth,
        lostThisMonth,
        newThisMonth,
        avgDaysToWin: avgDaysToWin === null ? null : Math.round(avgDaysToWin * 10) / 10,
      },
      // RPT-CUR-005 — FIXED in Wave 3. `Lead.currencyCode` now exists, so the
      // pipeline value is GROUPED by currency instead of being a currency-less
      // scalar. There is no combined total: no FX engine exists.
      //
      // A lead whose currency was never captured lands in the `UNKNOWN` bucket
      // and is NEVER counted as VND. `pipelineValueCurrencyUnknown` is kept and
      // now means "at least one lead still has money with no unit of account",
      // so a consumer can tell an incomplete pipeline from a complete one.
      pipelineValueByCurrency,
      pipelineValueCurrencyUnknown: pipelineValueByCurrency.some((b) => b.currencyCode === 'UNKNOWN'),
      valueByStatusAndCurrency,
      byStatus: statusCounts,
      // Legacy cross-currency sums, retained for backward compatibility only.
      // Never present these as money — read the *ByCurrency fields.
      valueByStatus: statusValues,
      byPriority,
      proposalByStatus,
      proposalValueByStatus,
      // Proposal value sums are scoped to `rentCurrency: 'VND'` in the query
      // above, so they are arithmetically safe but silently exclude USD/MMK
      // proposals. Declaring the scope is what stops a consumer presenting
      // them as an all-currency total (RPT-CUR-004).
      proposalValueCurrency: 'VND' as const,
      conversionRates,
      winLossBySource,
      winLossByCategory,
      analyticsSemantics: {
        currentSnapshot: ['summary.total', 'summary.totalActive', 'summary.totalWon', 'summary.totalLost', 'byStatus', 'byPriority', 'pipelineValueByCurrency'],
        historicalEvidence: ['summary.wonThisMonth', 'summary.lostThisMonth', 'summary.avgDaysToWin', 'conversionRates'],
        historicalCoverage: 'PARTIAL' as const,
        coverageStartedAt: CRM_EVENT_LEDGER_ACTIVATION_AT,
        coverageMessage: `Không đủ dữ liệu lịch sử trước ${CRM_EVENT_LEDGER_ACTIVATION_AT}`,
        evidenceTruncated,
        eventSampleLimit: 5000,
      },
      byLeaseTerm: {
        LONG: summarizeLeaseTerm(UnitLeaseTermType.LONG),
        SHORT: summarizeLeaseTerm(UnitLeaseTermType.SHORT),
      },
    };
  }

  // ─── Stale Leads ────────────────────────────────────────────────────────────────

  async getStaleLeads(days: number = 14, scope?: { userId: string; role: Role; mallIds?: string[] }) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return this.prisma.lead.findMany({
      where: {
        isActive: true,
        ...this.leadScope(scope),
        status: { notIn: ['WON', 'LOST'] },
        OR: [
          { lastActivityAt: { lt: cutoffDate } },
          { lastActivityAt: null, createdAt: { lt: cutoffDate } },
        ],
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        _count: { select: { activities: true } },
      },
      orderBy: [
        { lastActivityAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'asc' },
      ],
    });
  }

  // ─── Auto Actions ───────────────────────────────────────────────────────────────

  async autoMoveStaleToLost(days: number = 60, scope?: { userId: string; role: Role; mallIds?: string[] }) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // SAFETY GATE 001A: preserve the exact candidate predicate, but never turn
    // an unreliable stale projection into a lifecycle mutation. This method is
    // intentionally independent of HTTP so a scheduler can call the same
    // idempotent, read-only operation later.
    const candidates = await this.prisma.lead.findMany({
      where: {
        isActive: true,
        ...this.leadScope(scope),
        status: { notIn: ['WON', 'LOST'] },
        OR: [
          { lastActivityAt: { lt: cutoffDate } },
          { lastActivityAt: null, createdAt: { lt: cutoffDate } },
        ],
      },
      select: {
        id: true,
        brandName: true,
        status: true,
        mallId: true,
        lastActivityAt: true,
        createdAt: true,
      },
      orderBy: [
        { lastActivityAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });

    const reason = `No Lead activity recorded for ${days}+ days`;
    const result = {
      mode: AUTO_LOST_MODE,
      dryRun: true,
      thresholdDays: days,
      evaluatedAt: new Date().toISOString(),
      cutoffAt: cutoffDate.toISOString(),
      candidateCount: candidates.length,
      moved: 0,
      statusMutations: 0,
      candidates: candidates.map((lead) => ({
        leadId: lead.id,
        brandName: lead.brandName,
        currentStatus: lead.status,
        mallId: lead.mallId,
        reasonCode: AUTO_LOST_REASON_CODE,
        reason,
        basis: lead.lastActivityAt ? 'LAST_ACTIVITY_AT' : 'CREATED_AT',
        basisAt: (lead.lastActivityAt ?? lead.createdAt).toISOString(),
      })),
      message: `DRY_RUN: ${candidates.length} stale Lead candidate(s); no status changed`,
    };

    this.logger.log(JSON.stringify({
      event: 'crm.auto_lost.evaluated',
      mode: AUTO_LOST_MODE,
      candidateCount: candidates.length,
      statusMutations: 0,
      thresholdDays: days,
    }));

    return result;
  }

  async getAutoAssignRules() {
    // Return current auto-assign rules (stored in database or config)
    // For now, return hardcoded rules - can be expanded to database later
    return [
      { category: 'F&B', assignToRole: 'LEASING_EXECUTIVE', description: 'F&B leads assigned to Leasing Executive' },
      { category: 'Fashion', assignToRole: 'LEASING_MANAGER', description: 'Fashion leads assigned to Leasing Manager' },
      { category: 'Entertainment', assignToRole: 'MALL_DIRECTOR', description: 'Entertainment leads assigned to Mall Director' },
    ];
  }

  async autoAssignLead(leadId: string, scope?: { userId: string; role: Role; mallIds?: string[] }) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, isActive: true, ...this.leadScope(scope) },
    });
    if (!lead) throw new NotFoundException('Lead not found or outside your mall access');
    if (!lead.category || lead.assignedToId) {
      return { assigned: false, message: 'Lead already assigned or no category' };
    }

    // Find matching rule
    const rules = await this.getAutoAssignRules();
    const rule = rules.find(r => r.category === lead.category);
    if (!rule) {
      return { assigned: false, message: 'No matching rule for category' };
    }

    // Find user with matching role
    const user = await this.prisma.user.findFirst({
      where: {
        role: rule.assignToRole as any,
        isActive: true,
        ...(scope?.mallIds ? { mallAccess: { some: { isActive: true, mallId: { in: scope.mallIds } } } } : {}),
      },
      orderBy: { createdAt: 'asc' }, // Simple round-robin: oldest user
    });

    if (!user) {
      return { assigned: false, message: `No active user with role ${rule.assignToRole}` };
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { assignedToId: user.id },
    });

    return { assigned: true, assignedTo: user.fullName, message: `Lead assigned to ${user.fullName}` };
  }

  async createAutoFollowUp(leadId: string, userId: string, daysFromNow: number = 7, note?: string) {
    const lead = await this.findOne(leadId);
    if (!lead.assignedToId) {
      return { created: false, message: 'Lead has no assignee' };
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysFromNow);

    const followUp = await this.createFollowUp({
      leadId,
      assignedToId: lead.assignedToId,
      dueDate: dueDate.toISOString(),
      note: note || 'Auto-generated follow-up reminder',
    }, userId);

    return { created: true, followUp };
  }

  async getUnifiedDeals(query: {
    mallId?: string;
    search?: string;
    stage?: string;
    page?: number;
    limit?: number;
    scope?: { userId: string; role: Role; mallIds?: string[] };
  }) {
    const { page = 1, limit = 50, search, mallId, stage } = query;
    const skip = (page - 1) * +limit;

    const where: any = {
      isActive: true,
      deletedAt: null,
      status: { not: LeadStatus.LOST },
      ...this.leadScope(query.scope),
    };

    if (mallId) where.mallId = mallId;

    if (search) {
      where.OR = [
        { brandName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    const leads = await this.prisma.lead.findMany({
      where,
      skip,
      take: +limit,
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            unit: {
              select: {
                id: true,
                code: true,
                floor: { select: { mallId: true, mall: { select: { id: true, name: true } } } },
              },
            },
          },
        },
        proposals: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            unit: {
              select: {
                code: true,
                floor: { select: { mallId: true, mall: { select: { id: true, name: true } } } },
              },
            },
            approvalWorkflow: {
              include: {
                steps: { orderBy: { stepOrder: 'asc' } },
              },
            },
            contract: {
              select: { id: true, contractNumber: true, status: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const deals = leads
      .map((lead) => {
        const booking = lead.bookings[0];
        const proposal = lead.proposals[0];
        const mallFromBooking = booking?.unit?.floor?.mall;
        const mallFromProposal = proposal?.unit?.floor?.mall;
        const mall = mallFromProposal ?? mallFromBooking ?? null;
        const unitCode = proposal?.unit?.code ?? booking?.unit?.code ?? null;

        const dealStage = this.resolveDealStage(lead.status, booking, proposal);
        const nextAction = this.resolveNextAction(dealStage, booking, proposal);

        return {
          leadId: lead.id,
          brandName: lead.brandName,
          contactName: lead.contactName,
          leadStatus: lead.status,
          priority: lead.priority,
          assignedTo: lead.assignedTo,
          estimatedValue: lead.estimatedValue ?? proposal?.totalContractValue ?? null,
          // RPT-CUR-005 — this used to emit a hardcoded 'VND' whenever the Lead
          // supplied the amount, which asserted a unit of account the model
          // could not prove. The currency now travels with whichever amount was
          // actually chosen above: the Lead's own currency when the Lead value
          // is used, the Proposal's when it falls back to the proposal. A Lead
          // with money but no captured currency yields `null` -- rendered as
          // unknown, never as VND.
          currencyCode: resolveDealCurrency(lead, proposal),
          stage: dealStage,
          nextAction,
          mall,
          unitCode,
          booking: booking
            ? { id: booking.id, status: booking.status, expiresAt: booking.expiresAt }
            : null,
          proposal: proposal
            ? {
                id: proposal.id,
                proposalNumber: proposal.proposalNumber,
                status: proposal.status,
                approvalStatus: proposal.approvalWorkflow?.status ?? null,
              }
            : null,
          contract: proposal?.contract ?? null,
          updatedAt: lead.updatedAt,
        };
      })
      .filter((deal) => {
        // LEAD stage has no booking/proposal yet → no mall association → show under any mall
        if (mallId && deal.mall?.id && deal.mall.id !== mallId) return false;
        if (stage && deal.stage !== stage) return false;
        return true;
      });

    const stageCounts = deals.reduce<Record<string, number>>((acc, d) => {
      acc[d.stage] = (acc[d.stage] ?? 0) + 1;
      return acc;
    }, {});

    return {
      data: deals,
      summary: { stageCounts, total: deals.length },
      page: +page,
      limit: +limit,
    };
  }

  private resolveDealStage(
    leadStatus: LeadStatus,
    booking?: { status: string } | null,
    proposal?: {
      status: string;
      approvalWorkflow?: { status: string } | null;
      contract?: unknown | null;
    } | null,
  ): string {
    if (leadStatus === LeadStatus.WON) return 'WON';
    if (proposal?.contract) return 'CONTRACT';
    if (
      proposal?.approvalWorkflow?.status === 'IN_PROGRESS' ||
      proposal?.approvalWorkflow?.status === 'PENDING' ||
      proposal?.status === 'SUBMITTED'
    ) {
      return 'APPROVAL';
    }
    if (proposal) return 'PROPOSAL';
    if (booking && !['CANCELLED', 'EXPIRED', 'REJECTED'].includes(booking.status)) {
      return 'BOOKING';
    }
    return 'LEAD';
  }

  private resolveNextAction(
    stage: string,
    booking?: { status: string } | null,
    proposal?: {
      status: string;
      tenantId?: string | null;
      approvalWorkflow?: {
        steps?: Array<{ status: string; approverRole: string; stepName: string }>;
      } | null;
      contract?: { status: string } | null;
    } | null,
  ): string {
    switch (stage) {
      case 'LEAD':
        return 'Liên hệ khách / tạo booking';
      case 'BOOKING':
        // BookingStatus thực tế chỉ có PENDING (đang xếp hàng)/ACTIVE (đang giữ chỗ) ở giai đoạn này —
        // 'APPROVED' không tồn tại trong enum nên nhánh đó trước đây không bao giờ khớp được.
        if (booking?.status === 'PENDING') return 'Đang xếp hàng, chờ đến lượt';
        if (booking?.status === 'ACTIVE') return 'Chuyển sang đề xuất thuê';
        return 'Theo dõi booking';
      case 'PROPOSAL':
        if (proposal?.status === 'DRAFT') return 'Hoàn thiện và submit đề xuất';
        if (proposal?.status === 'APPROVED' && !proposal.tenantId) {
          return 'Gán tenant và tạo hợp đồng';
        }
        if (proposal?.status === 'CONVERTED') return 'Hợp đồng đã được tạo tự động';
        return 'Theo dõi đề xuất';
      case 'APPROVAL': {
        const pending = proposal?.approvalWorkflow?.steps?.find((s) => s.status === 'PENDING');
        return pending
          ? `Chờ ${pending.approverRole} duyệt — ${pending.stepName}`
          : 'Chờ phê duyệt';
      }
      case 'CONTRACT':
        return proposal?.contract?.status === 'DRAFT'
          ? 'Hoàn thiện và ký hợp đồng'
          : 'Theo dõi hợp đồng';
      case 'WON':
        return 'Chuyển sang fit-out / vận hành';
      default:
        return '—';
    }
  }

  async getLeadTimeline(
    leadId: string,
    scope: { userId: string; role: Role; mallIds?: string[] },
    options: { limit?: number; cursor?: string } = {},
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, brandName: true, status: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const page = await this.crmEvents.listForLead(leadId, scope, options);
    const authoritative = page.data.map((event) => ({
      id: event.id,
      type: event.eventType,
      label: event.eventType.replaceAll('_', ' '),
      status: event.toStatus ?? undefined,
      entityId: event.sourceEntityId ?? undefined,
      entityType: event.sourceEntityType ?? undefined,
      date: event.occurredAt.toISOString(),
      actor: event.actor
        ? { id: event.actor.id, name: event.actor.fullName, role: event.actor.role }
        : { id: null, name: 'SYSTEM', role: null },
      source: event.sourceModule,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      reasonCode: event.reasonCode,
      reason: event.reason,
      comment: event.comment,
      commentStatus: event.commentStatus,
      mallId: event.mallId,
      eventScope: event.scope,
      evidence: 'CRM_BUSINESS_EVENT' as const,
    }));

    // Pre-ledger activities are genuine records, but not lifecycle evidence.
    // Include them only on the first page and label coverage as partial; never
    // reconstruct status changes from current snapshots or updatedAt.
    const legacyActivities = options.cursor ? [] : await this.prisma.leadActivity.findMany({
      where: {
        leadId,
        createdAt: { lt: new Date(CRM_EVENT_LEDGER_ACTIVATION_AT) },
      },
      select: {
        id: true,
        type: true,
        occurredAt: true,
        createdAt: true,
        source: true,
        createdBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(options.limit ?? 50, 1), 100),
    });

    const events = [
      ...authoritative,
      ...legacyActivities.map((activity) => ({
        id: activity.id,
        type: 'LEAD_ACTIVITY',
        label: activity.type,
        entityId: activity.id,
        entityType: 'LEAD_ACTIVITY',
        date: (activity.occurredAt ?? activity.createdAt).toISOString(),
        actor: { id: activity.createdBy.id, name: activity.createdBy.fullName, role: activity.createdBy.role },
        source: activity.source ?? 'LEGACY_LEAD_ACTIVITY',
        fromStatus: null,
        toStatus: null,
        reasonCode: null,
        reason: null,
        comment: null,
        commentStatus: 'WITHHELD_PENDING_BC_028',
        mallId: null,
        eventScope: null,
        evidence: 'LEGACY_SOURCE_RECORD' as const,
      })),
    ].sort((left, right) => {
      const dateOrder = new Date(right.date).getTime() - new Date(left.date).getTime();
      return dateOrder || right.id.localeCompare(left.id);
    });

    return {
      leadId,
      brandName: lead.brandName,
      currentStatus: lead.status,
      events,
      nextCursor: page.nextCursor,
      historicalCoverage: page.historicalCoverage,
      coverageStartedAt: page.coverageStartedAt,
      coverageMessage: page.coverageMessage,
    };
  }

  // Kept temporarily as a private comparison aid during UAT. Runtime APIs do
  // not call this snapshot reconstruction and therefore cannot present it as
  // historical evidence.
  private async getDeprecatedSnapshotTimeline(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        brandName: true,
        status: true,
        createdAt: true,
        activities: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, type: true, note: true, createdAt: true },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    const [bookings, proposals] = await Promise.all([
      this.prisma.unitBooking.findMany({
        where: { leadId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          unit: { select: { id: true, code: true } },
        },
      }),
      this.prisma.proposal.findMany({
        where: { leadId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          proposalNumber: true,
          status: true,
          createdAt: true,
          unit: { select: { id: true, code: true } },
          approvalWorkflow: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              steps: {
                orderBy: { stepOrder: 'asc' },
                select: {
                  id: true,
                  stepName: true,
                  status: true,
                  approverRole: true,
                  decidedAt: true,
                },
              },
            },
          },
          contract: {
            select: {
              id: true,
              contractNumber: true,
              status: true,
              startDate: true,
              endDate: true,
            },
          },
        },
      }),
    ]);

    const events: Array<{
      type: string;
      label: string;
      status?: string;
      entityId?: string;
      entityType?: string;
      date: string;
      meta?: Record<string, unknown>;
    }> = [
      {
        type: 'LEAD_CREATED',
        label: `Lead tạo: ${lead.brandName}`,
        status: lead.status,
        entityId: lead.id,
        entityType: 'LEAD',
        date: lead.createdAt.toISOString(),
      },
    ];

    for (const activity of lead.activities) {
      events.push({
        type: 'LEAD_ACTIVITY',
        label: activity.note || activity.type,
        entityId: activity.id,
        entityType: 'LEAD_ACTIVITY',
        date: activity.createdAt.toISOString(),
        meta: { activityType: activity.type },
      });
    }

    for (const booking of bookings) {
      events.push({
        type: 'BOOKING',
        label: `Booking ${booking.unit.code}`,
        status: booking.status,
        entityId: booking.id,
        entityType: 'BOOKING',
        date: booking.createdAt.toISOString(),
        meta: { unitCode: booking.unit.code, expiresAt: booking.expiresAt },
      });
    }

    for (const proposal of proposals) {
      events.push({
        type: 'PROPOSAL',
        label: `Đề xuất ${proposal.proposalNumber}`,
        status: proposal.status,
        entityId: proposal.id,
        entityType: 'PROPOSAL',
        date: proposal.createdAt.toISOString(),
        meta: { unitCode: proposal.unit.code },
      });

      if (proposal.approvalWorkflow) {
        events.push({
          type: 'APPROVAL',
          label: 'Workflow phê duyệt',
          status: proposal.approvalWorkflow.status,
          entityId: proposal.approvalWorkflow.id,
          entityType: 'APPROVAL',
          date: proposal.approvalWorkflow.createdAt.toISOString(),
          meta: { steps: proposal.approvalWorkflow.steps },
        });
      }

      if (proposal.contract) {
        events.push({
          type: 'CONTRACT',
          label: `Hợp đồng ${proposal.contract.contractNumber}`,
          status: proposal.contract.status,
          entityId: proposal.contract.id,
          entityType: 'CONTRACT',
          date: proposal.contract.startDate.toISOString(),
        });
      }
    }

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      leadId,
      brandName: lead.brandName,
      currentStatus: lead.status,
      events,
    };
  }
}
