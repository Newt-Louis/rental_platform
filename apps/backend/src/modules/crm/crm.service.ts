import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeadDto, UpdateLeadDto } from './dto/create-lead.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { LeadStatus, Role } from '@prisma/client';
import { CustomersService } from './customers.service';

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);
  constructor(
    private prisma: PrismaService,
    private customersService: CustomersService,
  ) {}

  private leadScope(scope?: { userId: string; role: Role; mallIds?: string[] }) {
    if (!scope?.mallIds) return {};
    const mallIds = scope.mallIds;
    const relatedToMall = [
      { mallId: { in: mallIds } },
      { assignedTo: { mallAccess: { some: { isActive: true, mallId: { in: mallIds } } } } },
      { bookings: { some: { isActive: true, unit: { OR: [{ mallId: { in: mallIds } }, { floor: { mallId: { in: mallIds } } }] } } } },
      { proposals: { some: { isActive: true, unit: { OR: [{ mallId: { in: mallIds } }, { floor: { mallId: { in: mallIds } } }] } } } },
      { slotBookings: { some: { slot: { unit: { OR: [{ mallId: { in: mallIds } }, { floor: { mallId: { in: mallIds } } }] } } } } },
    ];
    return { AND: [{
      OR: scope.role === Role.LEASING_EXECUTIVE
        ? [{ assignedToId: scope.userId }]
        : relatedToMall,
    }] };
  }

  async assertLeadAccess(id: string, scope?: { userId: string; role: Role; mallIds?: string[] }) {
    const lead = await this.prisma.lead.findFirst({ where: { id, isActive: true, ...this.leadScope(scope) }, select: { id: true } });
    if (!lead) throw new NotFoundException('Lead not found or outside your mall access');
  }

  async findAll(query: {
    status?: LeadStatus;
    statuses?: string;
    assignedToId?: string;
    customerId?: string;
    search?: string;
    page?: number;
    limit?: number;
    scope?: { userId: string; role: Role; mallIds?: string[] };
  }) {
    const { page = 1, limit = 20, search, status, statuses, assignedToId, customerId } = query;
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
          _count: { select: { activities: true, proposals: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async getPipeline(limit = 100, scope?: { userId: string; role: Role; mallIds?: string[] }) {
    const statuses = Object.values(LeadStatus);
    const pipeline: Record<string, { leads: any[]; total: number; hasMore: boolean }> = {};

    await Promise.all(
      statuses.map(async (status) => {
        const [leads, total] = await Promise.all([
          this.prisma.lead.findMany({
            where: { status, isActive: true, deletedAt: null, ...this.leadScope(scope) },
            include: {
              assignedTo: { select: { id: true, fullName: true, avatar: true } },
              customer: { select: { id: true, customerCode: true } },
              _count: { select: { activities: true, proposals: true } },
            },
            orderBy: [
              { priority: 'asc' }, // HOT=0, WARM=1, COLD=2 (enum order)
              { position: 'asc' },
              { updatedAt: 'desc' },
            ],
            take: limit,
          }),
          this.prisma.lead.count({ where: { status, isActive: true, deletedAt: null, ...this.leadScope(scope) } }),
        ]);
        pipeline[status] = { leads, total, hasMore: total > limit };
      }),
    );

    return pipeline;
  }

  async moveLead(id: string, targetStatus: LeadStatus, targetPosition: number, userId?: string) {
    const lead = await this.findOne(id);
    const oldStatus = lead.status;

    // Update the lead
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        status: targetStatus,
        position: targetPosition,
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, avatar: true } },
        customer: { select: { id: true, customerCode: true, status: true } },
      },
    });

    // If status changed, handle side effects
    if (oldStatus !== targetStatus) {
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
        customer: {
          select: {
            id: true, customerCode: true, status: true,
            companyName: true, brandName: true, taxCode: true,
            address: true, industry: true, website: true,
            contactName: true, contactTitle: true, phone: true, email: true,
            rating: true, budgetMin: true, budgetMax: true, notes: true,
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

  async create(dto: CreateLeadDto & { customerId?: string }) {
    return this.prisma.lead.create({
      data: dto,
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        customer: { select: { id: true, customerCode: true } },
      },
    });
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

  async update(id: string, dto: UpdateLeadDto & { customerId?: string }, userId?: string) {
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
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.source !== undefined) updateData.source = dto.source;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.assignedToId !== undefined) updateData.assignedToId = dto.assignedToId;
    if ((dto as any).expectedArea !== undefined) updateData.expectedArea = (dto as any).expectedArea;
    if ((dto as any).expectedRent !== undefined) updateData.expectedRent = (dto as any).expectedRent;
    if ((dto as any).customerId !== undefined) updateData.customerId = (dto as any).customerId;
    const updated = await this.prisma.lead.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        customer: { select: { id: true, customerCode: true, status: true } },
      },
    });

    if (dto.status && dto.status !== existing.status) {
      if (dto.status === 'WON' && userId) {
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
    await this.findOne(leadId);
    
    // Create activity and update lastActivityAt in parallel
    const [activity] = await Promise.all([
      this.prisma.leadActivity.create({
        data: { leadId, type: dto.type, note: dto.note, createdById: userId },
        include: { createdBy: { select: { id: true, fullName: true } } },
      }),
      this.prisma.lead.update({
        where: { id: leadId },
        data: { lastActivityAt: new Date() },
      }),
    ]);
    
    return activity;
  }

  async getStats(scope?: { userId: string; role: Role; mallIds?: string[] }) {
    const scopedWhere = { isActive: true, ...this.leadScope(scope) };
    const [total, byStatus, wonThisMonth, lostThisMonth] = await Promise.all([
      this.prisma.lead.count({ where: scopedWhere }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: scopedWhere,
        _count: true,
      }),
      this.prisma.lead.count({
        where: {
          ...scopedWhere,
          status: 'WON',
          updatedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...scopedWhere,
          status: 'LOST',
          updatedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
    ]);

    return { total, byStatus, wonThisMonth, lostThisMonth };
  }

  async listFollowUps(query: { leadId?: string; assignedToId?: string; isDone?: string; daysAhead?: number; scope?: { userId: string; role: Role; mallIds?: string[] } }) {
    const where: any = {};
    if (query.leadId) where.leadId = query.leadId;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.isDone !== undefined) where.isDone = query.isDone === 'true';
    if (query.daysAhead) {
      const future = new Date();
      future.setDate(future.getDate() + +query.daysAhead);
      where.dueDate = { lte: future };
    }
    if (query.scope?.mallIds && !query.assignedToId) {
      where.AND = [{ OR: [
        { lead: { is: this.leadScope(query.scope) } },
        { assignedTo: { mallAccess: { some: { isActive: true, mallId: { in: query.scope.mallIds } } } } },
      ] }];
    }
    return this.prisma.leadFollowUp.findMany({
      where,
      include: {
        lead: { select: { id: true, brandName: true, status: true } },
        customer: { select: { id: true, companyName: true, brandName: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
      orderBy: [{ isDone: 'asc' }, { dueDate: 'asc' }],
    });
  }

  async createFollowUp(dto: { leadId?: string; customerId?: string; assignedToId: string; dueDate: string; note?: string }, createdById: string) {
    return this.prisma.leadFollowUp.create({
      data: {
        leadId: dto.leadId,
        customerId: dto.customerId,
        assignedToId: dto.assignedToId ?? createdById,
        dueDate: new Date(dto.dueDate),
        note: dto.note,
      },
      include: {
        lead: { select: { id: true, brandName: true } },
        customer: { select: { id: true, companyName: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
    });
  }

  async completeFollowUp(id: string) {
    return this.prisma.leadFollowUp.update({
      where: { id },
      data: { isDone: true, completedAt: new Date() },
    });
  }

  async deleteFollowUp(id: string) {
    return this.prisma.leadFollowUp.delete({ where: { id } });
  }

  // ─── Bulk Actions ───────────────────────────────────────────────────────────────

  async bulkAction(dto: {
    action: 'assign' | 'changeStatus' | 'changePriority' | 'delete';
    leadIds: string[];
    data?: { assignedToId?: string; status?: LeadStatus; priority?: string };
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
        const statusResult = await this.prisma.lead.updateMany({
          where: { id: { in: leadIds }, isActive: true },
          data: { status: data.status },
        });
        result = { updated: statusResult.count, message: `Đã chuyển ${statusResult.count} leads sang ${data.status}` };
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
    const assetScope = mallFilter ? [
      { bookings: { some: { isActive: true, unit: { OR: [{ mallId: { in: mallFilter } }, { floor: { mallId: { in: mallFilter } } }] } } } },
      { proposals: { some: { isActive: true, unit: { OR: [{ mallId: { in: mallFilter } }, { floor: { mallId: { in: mallFilter } } }] } } } },
      { slotBookings: { some: { slot: { unit: { OR: [{ mallId: { in: mallFilter } }, { floor: { mallId: { in: mallFilter } } }] } } } } },
    ] : [];
    const leadWhere: any = { isActive: true };
    if (mallFilter) {
      leadWhere.OR = scope?.role === Role.LEASING_EXECUTIVE
        ? [{ assignedToId: scope.userId }]
        : assetScope;
    }

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
        updatedAt: true,
        lastActivityAt: true,
        estimatedValue: true,
        expectedRent: true,
        expectedArea: true,
      },
    });

    // Count by status
    const statusCounts: Record<string, number> = {};
    const statusValues: Record<string, number> = {};
    leads.forEach((l) => {
      statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
      const value = l.estimatedValue ?? ((l.expectedRent ?? 0) * (l.expectedArea ?? 0));
      statusValues[l.status] = (statusValues[l.status] || 0) + value;
    });

    // Calculate conversion rates
    const totalNew = statusCounts['NEW'] || 0;
    const totalContacted = statusCounts['CONTACTED'] || 0;
    const totalQualified = statusCounts['QUALIFIED'] || 0;
    const totalProposal = statusCounts['PROPOSAL'] || 0;
    const totalNegotiation = statusCounts['NEGOTIATION'] || 0;
    const totalWon = statusCounts['WON'] || 0;
    const totalLost = statusCounts['LOST'] || 0;
    const totalActive = leads.length - totalWon - totalLost;

    const percent = (numerator: number, denominator: number) => denominator > 0 ? (numerator / denominator) * 100 : 0;
    const conversionRates = {
      newToContacted: percent(leads.length - totalNew, leads.length),
      contactedToQualified: percent(totalQualified + totalProposal + totalNegotiation + totalWon, totalContacted + totalQualified + totalProposal + totalNegotiation + totalWon),
      qualifiedToProposal: percent(totalProposal + totalNegotiation + totalWon, totalQualified + totalProposal + totalNegotiation + totalWon),
      proposalToNegotiation: percent(totalNegotiation + totalWon, totalProposal + totalNegotiation + totalWon),
      negotiationToWon: percent(totalWon, totalNegotiation + totalWon),
      overallWinRate: (totalWon + totalLost) > 0 ? (totalWon / (totalWon + totalLost)) * 100 : 0,
    };

    // Average days per stage (simplified - based on createdAt to updatedAt for completed leads)
    const wonLeads = leads.filter(l => l.status === 'WON');
    const avgDaysToWin = wonLeads.length > 0
      ? wonLeads.reduce((sum, l) => sum + Math.floor((new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24)), 0) / wonLeads.length
      : 0;

    // Win/Loss by source
    const winLossBySource: Record<string, { won: number; lost: number; rate: number }> = {};
    leads.filter(l => l.status === 'WON' || l.status === 'LOST').forEach((l) => {
      if (!winLossBySource[l.source]) {
        winLossBySource[l.source] = { won: 0, lost: 0, rate: 0 };
      }
      if (l.status === 'WON') winLossBySource[l.source].won++;
      else winLossBySource[l.source].lost++;
    });
    Object.keys(winLossBySource).forEach((k) => {
      const s = winLossBySource[k];
      s.rate = (s.won + s.lost) > 0 ? (s.won / (s.won + s.lost)) * 100 : 0;
    });

    // Win/Loss by category
    const winLossByCategory: Record<string, { won: number; lost: number; rate: number }> = {};
    leads.filter(l => (l.status === 'WON' || l.status === 'LOST') && l.category).forEach((l) => {
      const cat = l.category!;
      if (!winLossByCategory[cat]) {
        winLossByCategory[cat] = { won: 0, lost: 0, rate: 0 };
      }
      if (l.status === 'WON') winLossByCategory[cat].won++;
      else winLossByCategory[cat].lost++;
    });
    Object.keys(winLossByCategory).forEach((k) => {
      const s = winLossByCategory[k];
      s.rate = (s.won + s.lost) > 0 ? (s.won / (s.won + s.lost)) * 100 : 0;
    });

    // By priority
    const byPriority: Record<string, number> = {};
    leads.forEach((l) => {
      const p = (l as any).priority || 'WARM';
      byPriority[p] = (byPriority[p] || 0) + 1;
    });

    // Pipeline value
    const totalPipelineValue = leads
      .filter(l => !['WON', 'LOST'].includes(l.status))
      .reduce((sum, l) => sum + (l.estimatedValue ?? ((l.expectedRent ?? 0) * (l.expectedArea ?? 0))), 0);

    const proposalWhere: any = { isActive: true };
    if (mallFilter) proposalWhere.unit = { OR: [{ mallId: { in: mallFilter } }, { floor: { mallId: { in: mallFilter } } }] };
    const proposalGroups = await this.prisma.proposal.groupBy({
      by: ['status'], where: proposalWhere, _count: { _all: true }, _sum: { totalContractValue: true },
    });
    const proposalByStatus: Record<string, number> = {};
    const proposalValueByStatus: Record<string, number> = {};
    proposalGroups.forEach((group) => {
      proposalByStatus[group.status] = group._count._all;
      proposalValueByStatus[group.status] = group._sum.totalContractValue ?? 0;
    });

    // This month stats
    const wonThisMonth = leads.filter(l => l.status === 'WON' && new Date(l.updatedAt) >= startOfMonth).length;
    const lostThisMonth = leads.filter(l => l.status === 'LOST' && new Date(l.updatedAt) >= startOfMonth).length;
    const newThisMonth = leads.filter(l => new Date(l.createdAt) >= startOfMonth).length;

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
        avgDaysToWin: Math.round(avgDaysToWin),
      },
      byStatus: statusCounts,
      valueByStatus: statusValues,
      byPriority,
      proposalByStatus,
      proposalValueByStatus,
      conversionRates,
      winLossBySource,
      winLossByCategory,
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

  async autoMoveStaleToLost(days: number = 60) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.prisma.lead.updateMany({
      where: {
        isActive: true,
        status: { notIn: ['WON', 'LOST'] },
        OR: [
          { lastActivityAt: { lt: cutoffDate } },
          { lastActivityAt: null, createdAt: { lt: cutoffDate } },
        ],
      },
      data: {
        status: 'LOST',
        lostReason: `Auto-closed: No activity for ${days}+ days`,
      },
    });

    return { moved: result.count, message: `Moved ${result.count} stale leads to LOST` };
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

  async autoAssignLead(leadId: string) {
    const lead = await this.findOne(leadId);
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
      where: { role: rule.assignToRole as any, isActive: true },
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

  async createAutoFollowUp(leadId: string, daysFromNow: number = 7, note?: string) {
    const lead = await this.findOne(leadId);
    if (!lead.assignedToId) {
      return { created: false, message: 'Lead has no assignee' };
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysFromNow);

    const followUp = await this.prisma.leadFollowUp.create({
      data: {
        leadId,
        assignedToId: lead.assignedToId,
        dueDate,
        note: note || `Auto-generated follow-up reminder`,
      },
    });

    return { created: true, followUp };
  }

  async getUnifiedDeals(query: {
    mallId?: string;
    search?: string;
    stage?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50, search, mallId, stage } = query;
    const skip = (page - 1) * +limit;

    const where: any = {
      isActive: true,
      deletedAt: null,
      status: { not: LeadStatus.LOST },
    };

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

  async getLeadTimeline(leadId: string) {
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
