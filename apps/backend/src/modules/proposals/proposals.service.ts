import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProposalDto, UpdateProposalDto } from './dto/create-proposal.dto';
import { BookingStatus, ContractStatus, ProposalStatus, UnitStatus, WorkflowStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { buildApprovalStepsFromRules } from '../approvals/approval-policy.util';
import type {
  ApprovalWorkflowCompletedEvent,
  ApprovalWorkflowStepAdvancedEvent,
  ApprovalWorkflowRejectedEvent,
} from '../approvals/approvals.service';
import {
  buildProposalSnapshot,
  compareProposalSnapshots,
  ProposalSnapshot,
} from './proposal-version.util';
import { CustomersService } from '../crm/customers.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { BillingScheduleService } from '../billing/billing-schedule.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { CategoriesService } from '../categories/categories.service';
import { OperationalMetricsService } from '../../common/services/operational-metrics.service';

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(
    private prisma: PrismaService,
    private customersService: CustomersService,
    private unitStatus: UnitStatusService,
    private billingSchedule: BillingScheduleService,
    private notifications: NotificationsService,
    private emailService: EmailService,
    private categoriesService: CategoriesService,
    private metrics: OperationalMetricsService,
  ) {}

  private generateProposalNumber() {
    const year = new Date().getFullYear();
    const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
    return `PRO-${year}-${rand}`;
  }

  private async snapshotProposal(
    proposal: Record<string, unknown>,
    createdById?: string,
    changeReason?: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const latest = await client.proposalVersion.findFirst({
      where: { proposalId: proposal.id as string },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    return client.proposalVersion.create({
      data: {
        proposalId: proposal.id as string,
        version,
        snapshot: buildProposalSnapshot(proposal) as object,
        createdById,
        changeReason,
      },
    });
  }

  private calcFinancials(dto: CreateProposalDto) {
    const area = dto.area;
    const rentPerSqm = dto.rentPerSqm;
    const camPerSqm = dto.camPerSqm ?? 0;
    const deposit = dto.deposit ?? 3;
    const term = dto.term;
    const rentFree = dto.rentFree ?? 0;
    const escalation = dto.escalationPercent ?? 0;
    const discount = dto.discount ?? 0;

    const baseMonthlyRent = area * rentPerSqm;
    const discountedRent = baseMonthlyRent * (1 - discount / 100);
    const monthlyCAM = area * camPerSqm;
    const depositAmount = discountedRent * deposit;
    const billableMonths = term - rentFree;
    const totalContractValue = discountedRent * billableMonths + monthlyCAM * term;

    const endDate = new Date(dto.startDate);
    endDate.setMonth(endDate.getMonth() + term);

    return {
      monthlyRent: discountedRent,
      monthlyCAM,
      depositAmount,
      totalContractValue,
      endDate,
    };
  }

  async findAll(query: { status?: ProposalStatus; leaseTermType?: string; unitId?: string; floorId?: string; tenantId?: string; mallId?: string; mallIds?: string[]; search?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number }) {
    const { ...filters } = query;
    const page = Math.max(1, +query.page || 1);
    const limit = Math.max(1, +query.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = { isActive: true, deletedAt: null };
    if (filters.status === 'PENDING_APPROVAL' as any) where.status = { in: [ProposalStatus.SUBMITTED, ProposalStatus.UNDER_REVIEW] };
    else if (filters.status) where.status = filters.status;
    if (filters.unitId) where.unitId = filters.unitId;
    if (filters.tenantId) where.tenantId = filters.tenantId;
    const mallIds = filters.mallId ? [filters.mallId] : filters.mallIds;
    if (mallIds || filters.floorId || filters.leaseTermType) where.unit = {
      ...(mallIds ? { mallId: { in: mallIds } } : {}),
      ...(filters.floorId ? { floorId: filters.floorId } : {}),
      ...(filters.leaseTermType ? { leaseTermType: filters.leaseTermType } : {}),
    };
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      where.AND = [{ OR: [
        { proposalNumber: { contains: search, mode: 'insensitive' } },
        { tenant: { brandName: { contains: search, mode: 'insensitive' } } },
        { tenant: { companyName: { contains: search, mode: 'insensitive' } } },
        { lead: { brandName: { contains: search, mode: 'insensitive' } } },
        { unit: { code: { contains: search, mode: 'insensitive' } } },
      ] }];
    }
    if (filters.dateFrom || filters.dateTo) where.createdAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.proposal.findMany({
        where,
        skip,
        take: +limit,
        include: {
          unit: { select: { id: true, code: true, name: true, leaseTermType: true, floor: { select: { id: true, name: true, level: true } } } },
          tenant: { select: { id: true, brandName: true, companyName: true } },
          lead: { select: { id: true, brandName: true, contactName: true } },
          booking: {
            select: {
              lead: { select: { id: true, brandName: true, contactName: true } },
              customer: { select: { id: true, brandName: true, companyName: true } },
            },
          },
          approvalWorkflow: { select: { id: true, status: true } },
          contract: { select: { id: true, contractNumber: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.proposal.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async getStats(mallIds?: string[], leaseTermType?: string) {
    const base: any = { isActive: true, deletedAt: null };
    if (mallIds || leaseTermType) base.unit = {
      ...(mallIds ? { mallId: { in: mallIds } } : {}),
      ...(leaseTermType ? { leaseTermType } : {}),
    };
    const statuses = Object.values(ProposalStatus);
    const grouped = await this.prisma.proposal.groupBy({ by: ['status'], where: base, _count: { _all: true } });
    const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
    grouped.forEach((row: any) => { counts[row.status] = row._count._all; });
    return { total: grouped.reduce((sum: number, row: any) => sum + row._count._all, 0), ...counts };
  }

  async findOne(id: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        unit: { include: { floor: true, zone: true } },
        tenant: true,
        lead: true,
        approvalWorkflow: {
          include: {
            steps: {
              include: { approver: { select: { id: true, fullName: true, role: true } } },
              orderBy: { stepOrder: 'asc' },
            },
          },
        },
        contract: { select: { id: true, contractNumber: true, status: true } },
      },
    });

    if (!proposal) throw new NotFoundException('Proposal not found');
    return proposal;
  }

  async create(dto: CreateProposalDto, userId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: dto.unitId } });
    if (!unit) throw new NotFoundException('Unit not found');
    if (!unit.isActive) throw new BadRequestException('Cannot create a proposal for an inactive unit');
    if (dto.area > unit.areaNLA) throw new BadRequestException('Proposal area exceeds the unit leasable area');

    // Auto-inherit tenantId from lead when not explicitly provided
    let resolvedTenantId = dto.tenantId;
    if (!resolvedTenantId && dto.leadId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId }, select: { tenantId: true } });
      resolvedTenantId = lead?.tenantId ?? undefined;
    }

    const financials = this.calcFinancials(dto);
    const proposalNumber = this.generateProposalNumber();

    const proposal = await this.prisma.proposal.create({
      data: {
        proposalNumber,
        leadId: dto.leadId,
        tenantId: resolvedTenantId,
        unitId: dto.unitId,
        area: dto.area,
        term: dto.term,
        startDate: new Date(dto.startDate),
        endDate: financials.endDate,
        rentPerSqm: dto.rentPerSqm,
        camPerSqm: dto.camPerSqm ?? 0,
        deposit: dto.deposit ?? 3,
        rentFree: dto.rentFree ?? 0,
        escalationPercent: dto.escalationPercent ?? 0,
        revenueSharePercent: dto.revenueSharePercent ?? 0,
        marketingFee: dto.marketingFee ?? 0,
        discount: dto.discount ?? 0,
        monthlyRent: financials.monthlyRent,
        monthlyCAM: financials.monthlyCAM,
        depositAmount: financials.depositAmount,
        totalContractValue: financials.totalContractValue,
        notes: dto.notes,
        businessModel: dto.businessModel as any,
        serviceFeeSqm: dto.serviceFeeSqm ?? 0,
        businessSupportFeeSqm: dto.businessSupportFeeSqm ?? 0,
        rentCurrency: dto.rentCurrency ?? 'VND',
        fitoutDays: dto.fitoutDays ?? 90,
        handoverDate: dto.handoverDate ? new Date(dto.handoverDate) : undefined,
        openingDate: dto.openingDate ? new Date(dto.openingDate) : undefined,
        specialConditions: dto.specialConditions,
        // GAP #91–94
        utilityFee: dto.utilityFee ?? 0,
        operatingHours: dto.operatingHours,
        afterHoursFee: dto.afterHoursFee ?? 0,
        paymentTermDays: dto.paymentTermDays ?? 30,
        // GAP #41
        depositLease: dto.depositLease,
        depositFitout: dto.depositFitout ?? 0,
        fitoutFee: dto.fitoutFee ?? 0,
        createdById: userId,
      },
      include: {
        unit: { select: { id: true, code: true, name: true } },
        tenant: { select: { id: true, brandName: true } },
      },
    });

    await this.snapshotProposal(proposal as unknown as Record<string, unknown>, userId, 'CREATED');

    // Advance lead status to PROPOSAL if still in early stage
    if (dto.leadId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId }, select: { status: true } });
      const earlyStatuses = ['NEW', 'CONTACTED', 'QUALIFIED'];
      if (lead && earlyStatuses.includes(lead.status)) {
        await this.prisma.lead.update({ where: { id: dto.leadId }, data: { status: 'PROPOSAL' as any } });
      }
    }

    return proposal;
  }

  async update(id: string, dto: UpdateProposalDto, userId?: string) {
    const proposal = await this.findOne(id);
    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT proposals can be edited');
    }

    const updateData: any = { ...dto };
    const financialFields: (keyof UpdateProposalDto)[] = [
      'startDate', 'area', 'rentPerSqm', 'camPerSqm', 'term', 'deposit', 'rentFree', 'discount',
    ];
    if (financialFields.some((field) => dto[field] !== undefined)) {
      const merged = { ...proposal, ...dto };
      const financials = this.calcFinancials(merged as any);
      Object.assign(updateData, {
        monthlyRent: financials.monthlyRent,
        monthlyCAM: financials.monthlyCAM,
        depositAmount: financials.depositAmount,
        totalContractValue: financials.totalContractValue,
        endDate: financials.endDate,
      });
    }

    const updated = await this.prisma.proposal.update({ where: { id }, data: updateData });
    await this.snapshotProposal(updated as unknown as Record<string, unknown>, userId, 'UPDATED');
    return updated;
  }

  /**
   * Phase 3 hardening (docs/program/02-E2E-WORKFLOW.md, backlog #4): this used to do three
   * unwrapped writes (pricing update → workflow create → status update) — a crash between
   * them could leave a live ApprovalWorkflow against a still-DRAFT proposal. All state
   * writes now happen inside one Serializable transaction, re-checking DRAFT status inside
   * it to close the double-submit race (browser retry / double-click / concurrent API
   * calls). `ApprovalWorkflow.proposalId` already has a DB-level unique constraint
   * (schema.prisma), so a genuine concurrent double-submit resolves via the same
   * P2002-repair pattern already proven in `createContractFromProposal`, rather than a new
   * idempotency-key mechanism this flow doesn't need.
   */
  async submit(id: string) {
    const proposal = await this.findOne(id);
    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new BadRequestException('Proposal is not in DRAFT status');
    }

    const hasArDebt = proposal.tenantId
      ? (await this.prisma.invoice.count({
          where: { tenantId: proposal.tenantId, status: 'OVERDUE', isActive: true },
        })) > 0
      : false;

    const rules = await this.prisma.approvalPolicyRule.findMany({
      where: { isActive: true },
      orderBy: [{ stepOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (!rules.length) {
      throw new BadRequestException(
        'Approval policy is not configured. Please create active approval rules before submitting proposal.',
      );
    }

    // Tính % lệch giá so với bảng giá ngành hàng (master data) NGAY TẠI THỜI ĐIỂM submit — trước đây
    // luồng này không truyền priceDeviationPct nên các rule PRICE_DEVIATION_PCT (Director/CEO price
    // review) không bao giờ khớp được, dù booking gốc đã bị flag lệch giá lớn.
    let priceDeviationPct = 0;
    let pricingRuleId: string | null = null;
    let pricingSnapshot: Prisma.InputJsonValue | undefined;
    // CategoryPricing now carries its own currencyCode (previously a plain VND-denominated
    // Float with no currency field at all -- docs/program/MULTI_CURRENCY_ARCHITECTURE.md).
    // validateProposedPrice() only matches a pricing rule in the SAME currency as the
    // proposal, so a USD/MMK proposal is no longer silently skipped (which previously let
    // large USD/MMK deviations bypass CEO/Director review entirely) -- it's now checked
    // against a same-currency band where one exists, and otherwise falls through to the
    // "no pricing rule configured" CEO-escalation path below, same as a VND proposal would.
    if (proposal.unit?.categoryId) {
      const validation = await this.categoriesService.validateProposedPrice({
        mallId: proposal.unit.mallId,
        categoryId: proposal.unit.categoryId,
        floorId: proposal.unit.floorId ?? undefined,
        zoneId: proposal.unit.zoneId ?? undefined,
        proposedRentPerSqm: proposal.rentPerSqm,
        currencyCode: proposal.rentCurrency,
      });
      priceDeviationPct = validation.deviationPercent;
      pricingRuleId = validation.categoryPricing?.id ?? null;
      pricingSnapshot = {
        evaluatedAt: new Date().toISOString(),
        proposedRentPerSqm: proposal.rentPerSqm,
        minRentPerSqm: validation.minRentPerSqm,
        maxRentPerSqm: validation.maxRentPerSqm,
        suggestedRent: validation.categoryPricing?.suggestedRent ?? null,
        camPerSqm: validation.categoryPricing?.camPerSqm ?? null,
        sources: validation.categoryPricing?.sources ?? null,
      };
    }

    const steps = buildApprovalStepsFromRules(rules, {
      discountPct: proposal.discount ?? 0,
      rentFreeDays: proposal.rentFree ?? 0,
      industryTag: proposal.unit?.category ?? proposal.tenant?.category ?? null,
      hasArDebt,
      priceDeviationPct,
    });

    if (!steps.length) {
      throw new BadRequestException(
        'No approval step matched current proposal. Please review approval policy rules.',
      );
    }

    let workflow: { id: string };
    const startedAt = Date.now();
    this.logger.log(JSON.stringify({ event: 'proposal.submit.started', proposalId: id, tenantId: proposal.tenantId ?? null }));
    try {
      workflow = await this.prisma.$transaction(async (tx) => {
        // Re-check inside the transaction: closes the TOCTOU window between the pre-check
        // above and here, so a double-click/browser-retry/concurrent-API-call can't create
        // two workflows for the same proposal.
        const current = await tx.proposal.findUniqueOrThrow({ where: { id } });
        if (current.status !== ProposalStatus.DRAFT) {
          throw new BadRequestException('Proposal is not in DRAFT status');
        }

        if (pricingRuleId || pricingSnapshot) {
          await tx.proposal.update({ where: { id }, data: { pricingRuleId, pricingSnapshot } });
        }

        await this.snapshotProposal(
          { ...proposal, pricingRuleId, pricingSnapshot } as unknown as Record<string, unknown>,
          undefined,
          'SUBMITTED',
          tx,
        );

        const created = await tx.approvalWorkflow.create({
          data: {
            entityType: 'PROPOSAL',
            entityId: id,
            proposalId: id,
            status: WorkflowStatus.IN_PROGRESS,
            steps: {
              create: steps,
            },
          },
        });

        await tx.proposal.update({
          where: { id },
          data: { status: ProposalStatus.SUBMITTED },
        });

        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      this.logger.log(JSON.stringify({
        event: 'proposal.submit.completed',
        proposalId: id,
        tenantId: proposal.tenantId ?? null,
        workflowId: workflow.id,
        durationMs: Date.now() - startedAt,
      }));
    } catch (error: any) {
      // Concurrent request won the race: our insert hit the unique constraint on
      // ApprovalWorkflow.proposalId. Resolve to the workflow that now exists instead of
      // surfacing a raw database error — the proposal was submitted exactly once either way.
      if (error?.code === 'P2002') {
        const winner = await this.prisma.approvalWorkflow.findUnique({ where: { proposalId: id } });
        if (winner) {
          this.metrics.increment('duplicate_transition_blocked_total');
          this.logger.log(JSON.stringify({
            event: 'proposal.submit.completed',
            proposalId: id,
            workflowId: winner.id,
            durationMs: Date.now() - startedAt,
            resolvedConcurrentSubmit: true,
          }));
          return { message: 'Proposal submitted for approval', workflowId: winner.id };
        }
      }
      this.metrics.increment('proposal_submit_failure_total');
      this.logger.warn(JSON.stringify({
        event: 'proposal.submit.failed',
        proposalId: id,
        durationMs: Date.now() - startedAt,
        error: error?.message ?? String(error),
      }));
      throw error;
    }

    // Best-effort, not part of the atomic core: in-app + email notifications to approvers.
    // A failure here must not roll back a proposal that was already correctly submitted —
    // matches the "notification is not state" rule (network side effects stay out of the
    // DB transaction; the workflow itself is already durable at this point).
    await this.notifyPendingApprovers(workflow.id, 1);

    return { message: 'Proposal submitted for approval', workflowId: workflow.id };
  }

  /** Notify users with pending approval role + optional email */
  async notifyPendingApprovers(workflowId: string, stepOrder: number) {
    const step = await this.prisma.approvalStep.findFirst({
      where: {
        workflowId,
        stepOrder,
        status: 'PENDING',
      },
      include: {
        workflow: {
          include: {
            proposal: {
              include: {
                unit: { select: { code: true } },
                tenant: { select: { brandName: true } },
              },
            },
          },
        },
      },
    });

    if (!step?.workflow.proposal) return;

    const proposal = step.workflow.proposal;
    const approvers = await this.prisma.user.findMany({
      where: { role: step.approverRole, isActive: true, deletedAt: null },
      select: { id: true, email: true, fullName: true },
      take: 5,
    });

    const creator = await this.prisma.user.findUnique({
      where: { id: proposal.createdById },
      select: { fullName: true },
    });

    for (const approver of approvers) {
      await this.notifications.create({
        userId: approver.id,
        title: `Phê duyệt: ${proposal.proposalNumber}`,
        body: `${step.stepName} — ${proposal.tenant?.brandName ?? 'Chưa có tenant'} / ${proposal.unit.code}`,
        type: 'APPROVAL_PENDING',
        entityType: 'PROPOSAL',
        entityId: proposal.id,
      });

      if (approver.email) {
        try {
          await this.emailService.sendMail({
            to: approver.email,
            subject: `[THISO] Phê duyệt Proposal ${proposal.proposalNumber}`,
            html: this.emailService.proposalApprovalHtml({
              approverName: approver.fullName,
              proposalNumber: proposal.proposalNumber,
              tenantName: proposal.tenant?.brandName ?? '—',
              unitCode: proposal.unit.code,
              rentPerSqm: proposal.rentPerSqm,
              monthlyRent: proposal.monthlyRent,
              discount: proposal.discount,
              submittedBy: creator?.fullName ?? 'Leasing',
            }),
          });
        } catch (e) {
          this.logger.warn(`Approval email failed for ${approver.email}: ${e.message}`);
        }
      }
    }
  }

  /**
   * Auto post-approval: draft contract + billing schedule when tenant is assigned.
   */
  @OnEvent('approval.workflow.completed')
  async onApprovalWorkflowCompleted(payload: ApprovalWorkflowCompletedEvent) {
    if (payload.entityType !== 'PROPOSAL') return;
    const proposalId = payload.entityId;

    await this.prisma.proposal.update({
      where: { id: proposalId },
      data: { status: ProposalStatus.APPROVED },
    });

    await this.handleProposalFullyApproved(proposalId, payload.decidedByUserId);

    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { proposalNumber: true, createdById: true },
    });
    if (proposal?.createdById) {
      await this.notifications.create({
        userId: proposal.createdById,
        title: `Proposal ${proposal.proposalNumber} đã được phê duyệt`,
        body: 'Deal đã hoàn tất quy trình phê duyệt.',
        type: 'PROPOSAL_APPROVED',
        entityType: 'PROPOSAL',
        entityId: proposalId,
      });
    }
  }

  @OnEvent('approval.workflow.step-advanced')
  async onApprovalWorkflowStepAdvanced(payload: ApprovalWorkflowStepAdvancedEvent) {
    if (payload.entityType !== 'PROPOSAL') return;
    await this.notifyPendingApprovers(payload.workflowId, payload.nextStepOrder);
  }

  @OnEvent('approval.workflow.rejected')
  async onApprovalWorkflowRejected(payload: ApprovalWorkflowRejectedEvent) {
    if (payload.entityType !== 'PROPOSAL') return;
    await this.prisma.proposal.update({
      where: { id: payload.entityId },
      data: { status: ProposalStatus.REJECTED },
    });
  }

  async handleProposalFullyApproved(proposalId: string, userId?: string) {
    const proposal = await this.findOne(proposalId);
    if (proposal.status !== ProposalStatus.APPROVED) {
      return { success: false, reason: 'NOT_APPROVED' };
    }

    if (!proposal.tenantId) {
      const creator = await this.prisma.user.findUnique({
        where: { id: proposal.createdById },
        select: { id: true },
      });
      if (creator) {
        await this.notifications.create({
          userId: creator.id,
          title: `Proposal ${proposal.proposalNumber} đã duyệt — cần gán tenant`,
          body: 'Gán khách thuê và chuyển hợp đồng để hoàn tất deal.',
          type: 'PROPOSAL_APPROVED',
          entityType: 'PROPOSAL',
          entityId: proposalId,
        });
      }
      return { success: false, reason: 'NO_TENANT' };
    }

    const existing = await this.prisma.contract.findFirst({ where: { proposalId } });
    if (existing) {
      await this.billingSchedule.buildScheduleForContract(existing.id);
      return { success: true, contractId: existing.id, created: false };
    }

    const contract = await this.createContractFromProposal(proposalId, { userId });
    await this.billingSchedule.buildScheduleForContract(contract.id);

    const creator = await this.prisma.user.findUnique({
      where: { id: proposal.createdById },
      select: { id: true },
    });
    if (creator) {
      await this.notifications.create({
        userId: creator.id,
        title: `HĐ nháp đã tạo từ ${proposal.proposalNumber}`,
        body: `Số HĐ: ${contract.contractNumber}. Kiểm tra và ký hợp đồng.`,
        type: 'CONTRACT_DRAFT',
        entityType: 'CONTRACT',
        entityId: contract.id,
      });
    }

    return { success: true, contractId: contract.id, created: true };
  }

  /**
   * Data integrity hardening (docs/security/DATA_INTEGRITY_PROPOSAL_CONTRACT.md):
   * this used to run Contract create → Unit status transition → Booking
   * cancellation → Proposal status update → Lead status update as separate,
   * unwrapped writes. A failure partway through (e.g. the unit-status
   * transition's own validation throwing) left a Contract row committed with
   * everything after it silently skipped — a half-created state. The
   * existing-contract idempotency check (`existing`) was also a
   * check-then-act race: two concurrent calls could both pass it before
   * either committed. `Contract.proposalId` is `@unique` in the schema, so
   * true duplicates were never actually possible, but the loser of that race
   * used to get a raw unhandled Prisma P2002 error instead of the existing
   * contract back.
   *
   * Fix: every write that must be consistent with "a contract now exists for
   * this proposal" runs inside one Serializable transaction (same isolation
   * level already used for approval decisions in ApprovalsService, for the
   * same reason — this is a decision-with-side-effects, not a simple CRUD
   * write). A concurrent-duplicate attempt now either serializes cleanly
   * behind the winner, or hits the P2002 unique-constraint path, both of
   * which are caught and resolved to "return the contract that now exists"
   * rather than surfacing a raw database error.
   */
  async createContractFromProposal(
    id: string,
    options?: { userId?: string; markConverted?: boolean },
  ) {
    const proposal = await this.findOne(id);
    // Chỉ chấp nhận APPROVED — trước đây còn chấp nhận cả SUBMITTED (trạng thái ngay sau khi nộp,
    // trước khi có bước duyệt nào), là kẽ hở lý thuyết cho phép tạo hợp đồng khi chưa qua phê duyệt
    // nào nếu có endpoint/tác vụ khác gọi thẳng hàm này trong tương lai.
    if (proposal.status !== ProposalStatus.APPROVED) {
      throw new BadRequestException('Proposal must be approved before creating contract');
    }
    if (!proposal.tenantId) {
      throw new BadRequestException('Proposal must have a tenant before converting to contract');
    }

    const existing = await this.prisma.contract.findFirst({ where: { proposalId: id } });
    if (existing) return existing;

    let contract: Awaited<ReturnType<typeof this.prisma.contract.create>>;
    try {
      contract = await this.prisma.$transaction(async (tx) => {
        // Re-check inside the transaction: closes the TOCTOU window between the
        // pre-check above and here under Serializable isolation.
        const alreadyExists = await tx.contract.findFirst({ where: { proposalId: id } });
        if (alreadyExists) return alreadyExists;

        // Một mặt bằng chỉ nên có một hợp đồng còn hiệu lực — chặn trường hợp 2 proposal khác
        // nhau cho cùng unit đều được duyệt và cùng cố tạo hợp đồng.
        const existingUnitContract = await tx.contract.findFirst({
          where: {
            unitId: proposal.unitId,
            isActive: true,
            deletedAt: null,
            status: { notIn: [ContractStatus.EXPIRED, ContractStatus.TERMINATED] },
          },
        });
        if (existingUnitContract) {
          throw new BadRequestException(
            `Mặt bằng này đã có hợp đồng đang hiệu lực (${existingUnitContract.contractNumber}) từ một đề xuất khác. Không thể tạo thêm hợp đồng.`,
          );
        }

        const year = new Date().getFullYear();
        const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
        const contractNumber = `CTR-${year}-${rand}`;

        const created = await tx.contract.create({
          data: {
            contractNumber,
            proposalId: id,
            tenantId: proposal.tenantId,
            unitId: proposal.unitId,
            status: ContractStatus.DRAFT,
            startDate: proposal.startDate,
            endDate: proposal.endDate!,
            term: proposal.term,
            rent: proposal.monthlyRent,
            cam: proposal.monthlyCAM,
            deposit: proposal.depositAmount,
            rentFree: proposal.rentFree,
            escalationPercent: proposal.escalationPercent,
            // Multi-currency (docs/program/MULTI_CURRENCY_ARCHITECTURE.md): this is the actual
            // Proposal->Contract conversion path wired to the UI's "Convert to Contract" action
            // (ContractsService.create() is a separate direct-create path with its own currency
            // resolution) -- without this, the Contract row silently fell back to the schema's
            // VND default regardless of the Proposal's real currency, reproducing exactly the
            // silent-currency-loss bug the original audit found and thought it had closed.
            currencyCode: proposal.rentCurrency,
            // GAP #41 — carry-over 3 khoản cọc từ Proposal
            depositLease: (proposal as any).depositLease ?? undefined,
            depositFitout: (proposal as any).depositFitout ?? 0,
            fitoutFee: (proposal as any).fitoutFee ?? 0,
            // GAP #91, #93 — carry-over phí tiện ích & ngoài giờ
            utilityFee: (proposal as any).utilityFee ?? 0,
            afterHoursFee: (proposal as any).afterHoursFee ?? 0,
            operatingHours: (proposal as any).operatingHours ?? undefined,
          },
        });

        await this.unitStatus.transition(proposal.unitId, UnitStatus.CONTRACTED, {
          userId: options?.userId,
          reason: `Contract ${contractNumber} created from proposal ${proposal.proposalNumber}`,
          tenantId: proposal.tenantId,
          leaseStartDate: proposal.startDate,
          leaseEndDate: proposal.endDate ?? undefined,
        }, tx);

        // Mặt bằng đã có hợp đồng chính thức — mọi booking khác còn xếp hàng (queue) cho unit này
        // không còn ý nghĩa, huỷ để tránh tồn đọng booking "ma" trỏ vào unit đã ký hợp đồng.
        await tx.unitBooking.updateMany({
          where: {
            unitId: proposal.unitId,
            isActive: true,
            status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
          },
          data: { status: BookingStatus.CANCELLED },
        });

        if (options?.markConverted !== false) {
          await tx.proposal.update({
            where: { id },
            data: { status: ProposalStatus.CONVERTED },
          });
        }

        if (proposal.leadId) {
          await tx.lead.update({
            where: { id: proposal.leadId },
            data: { status: 'WON' as any },
          });
        }

        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      // Concurrent request won the race: our insert hit the unique constraint
      // on Contract.proposalId. Resolve to the contract that now exists
      // instead of surfacing a raw database error — same idempotent outcome
      // as the pre-check above, just for the case where two requests both
      // passed it before either committed.
      if (error?.code === 'P2002') {
        const winner = await this.prisma.contract.findFirst({ where: { proposalId: id } });
        if (winner) return winner;
      }
      throw error;
    }

    // Best-effort, not part of the atomic core: a CRM customer profile is a
    // downstream convenience derived from the lead, not something the
    // Contract/Unit/Proposal state machine's correctness depends on. It's
    // already idempotent on its own (createFromLead returns the existing
    // customer if one is already linked), so a transient failure here is
    // logged and swallowed rather than rolling back a successful contract.
    if (proposal.leadId) {
      const creatorId = proposal.createdById ?? options?.userId ?? 'system';
      try {
        await this.customersService.createFromLead(proposal.leadId, creatorId);
      } catch (error: any) {
        this.logger.warn(`createFromLead failed after contract ${contract.id} was created: ${error.message}`);
      }
    }

    return contract;
  }

  async convertToContract(id: string, userId?: string, tenantData?: any) {
    let proposal = await this.findOne(id);
    if (proposal.status !== ProposalStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED proposals can be converted');
    }
    let invitation: { email: string; token: string } | null = null;
    if (!proposal.tenantId) {
      const lead = proposal.lead;
      const companyName = tenantData?.companyName?.trim() || lead?.company?.trim();
      const brandName = tenantData?.brandName?.trim() || lead?.brandName?.trim();
      const contactName = tenantData?.contactName?.trim() || lead?.contactName?.trim();
      const contactEmail = tenantData?.contactEmail?.trim().toLowerCase() || lead?.email?.trim().toLowerCase();
      if (!companyName || !brandName || !contactName || !contactEmail) throw new BadRequestException('Vui lòng nhập đầy đủ tên pháp nhân, thương hiệu, người liên hệ và email để tạo khách thuê');
      const existingUser = await this.prisma.user.findUnique({ where: { email: contactEmail } });
      if (existingUser && existingUser.role !== 'TENANT') throw new BadRequestException('Email này đang thuộc tài khoản nhân viên và không thể dùng cho portal khách thuê');
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const inviteExpiresAt = new Date(Date.now() + 72 * 3600000);
      const tenant = await this.prisma.$transaction(async tx => {
        const created = await tx.tenant.create({ data: { companyName, brandName, taxCode: tenantData?.taxCode || undefined, contactName, contactEmail, contactPhone: tenantData?.contactPhone || lead?.phone || undefined, address: tenantData?.address || undefined, category: tenantData?.category || lead?.category || undefined, isPortalUser: true } });
        await tx.proposal.update({ where: { id }, data: { tenantId: created.id } });
        if (proposal.leadId) await tx.lead.update({ where: { id: proposal.leadId }, data: { tenantId: created.id } });
        if (existingUser) await tx.user.update({ where: { id: existingUser.id }, data: { tenantId: created.id, inviteTokenHash: tokenHash, inviteExpiresAt, mustChangePassword: true } });
        else await tx.user.create({ data: { email: contactEmail, fullName: contactName, phone: tenantData?.contactPhone || lead?.phone || undefined, role: 'TENANT', tenantId: created.id, password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10), inviteTokenHash: tokenHash, inviteExpiresAt, mustChangePassword: true } });
        return created;
      });
      invitation = { email: contactEmail, token: rawToken };
      proposal = await this.findOne(id);
    }
    const contract = await this.createContractFromProposal(id, { userId, markConverted: true });
    if (invitation) {
      const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:8080'}/activate?token=${encodeURIComponent(invitation.token)}`;
      try { await this.emailService.sendMail({ to: invitation.email, subject: '[THISO] Kích hoạt tài khoản Tenant Portal', html: `<div style="font-family:Arial;max-width:600px;margin:auto"><h2>Chào mừng đến THISO Tenant Portal</h2><p>Hợp đồng của Quý khách đã được khởi tạo. Vui lòng bấm nút dưới đây để đặt mật khẩu và kích hoạt tài khoản.</p><p><a href="${portalUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:6px">Kích hoạt tài khoản</a></p><p>Liên kết có hiệu lực trong 72 giờ.</p></div>` }); }
      catch (error) { this.logger.warn(`Tenant portal invitation failed for ${invitation.email}: ${error.message}`); }
    }
    return { ...contract, portalInvitationSent: Boolean(invitation), portalEmail: invitation?.email };
  }

  async reject(id: string, rejectionReason: string, userId: string) {
    const proposal = await this.findOne(id);
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(proposal.status)) {
      throw new BadRequestException('Only SUBMITTED or UNDER_REVIEW proposals can be rejected');
    }

    await this.snapshotProposal(proposal as unknown as Record<string, unknown>, userId, 'REJECTED');

    const updated = await this.prisma.proposal.update({
      where: { id },
      data: { status: ProposalStatus.REJECTED, notes: rejectionReason ? `[Từ chối] ${rejectionReason}${proposal.notes ? '\n' + proposal.notes : ''}` : proposal.notes },
    });

    // Revert lead back to NEGOTIATION if it was advanced
    if (proposal.leadId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: proposal.leadId }, select: { status: true } });
      if (lead?.status === 'PROPOSAL') {
        await this.prisma.lead.update({ where: { id: proposal.leadId }, data: { status: 'NEGOTIATION' as any } });
      }
    }

    // Mặt bằng không nên kẹt mãi ở BOOKING/NEGOTIATING sau khi proposal bị từ chối — trả về VACANT
    // nếu không còn booking nào khác đang giữ chỗ cho unit này (nếu còn, giữ nguyên trạng thái để
    // booking đó tiếp tục quy trình của nó).
    const unit = await this.prisma.unit.findUnique({ where: { id: proposal.unitId }, select: { status: true } });
    if (unit && (unit.status === UnitStatus.BOOKING || unit.status === UnitStatus.NEGOTIATING)) {
      const otherActiveBooking = await this.prisma.unitBooking.findFirst({
        where: {
          unitId: proposal.unitId,
          isActive: true,
          status: { in: ['ACTIVE', 'PENDING'] },
        },
      });
      if (!otherActiveBooking) {
        await this.unitStatus.transition(proposal.unitId, UnitStatus.VACANT, {
          userId,
          reason: `Proposal ${proposal.proposalNumber} bị từ chối — không còn booking nào giữ mặt bằng`,
        });
      }
    }

    return updated;
  }

  async saveEditorContent(id: string, editorContent: any) {
    const proposal = await this.findOne(id);
    if (proposal.status !== ProposalStatus.DRAFT) throw new BadRequestException('Only DRAFT proposals can be edited');
    const updated = await this.prisma.proposal.update({
      where: { id },
      data: { editorContent },
      select: { id: true, proposalNumber: true, editorContent: true },
    });
    await this.snapshotProposal({ ...proposal, editorContent } as unknown as Record<string, unknown>, undefined, 'EDITOR_UPDATED');
    return updated;
  }

  /** Update supplementary doc-generation fields (fees, hours, deposit amounts).
   *  These fields feed the Tờ Trình document and are editable regardless of proposal status. */
  async updateDocFields(
    id: string,
    dto: {
      utilityFee?: number;
      operatingHours?: string;
      afterHoursFee?: number;
      paymentTermDays?: number;
      depositLease?: number | null;
      depositFitout?: number;
      fitoutFee?: number;
    },
  ) {
    const proposal = await this.findOne(id);
    if (proposal.status !== ProposalStatus.DRAFT) throw new BadRequestException('Only DRAFT proposals can be edited');
    const updated = await this.prisma.proposal.update({
      where: { id },
      data: {
        utilityFee:      dto.utilityFee,
        operatingHours:  dto.operatingHours,
        afterHoursFee:   dto.afterHoursFee,
        paymentTermDays: dto.paymentTermDays,
        depositLease:    dto.depositLease,
        depositFitout:   dto.depositFitout,
        fitoutFee:       dto.fitoutFee,
      },
      select: {
        id: true, proposalNumber: true,
        utilityFee: true, operatingHours: true, afterHoursFee: true,
        paymentTermDays: true, depositLease: true, depositFitout: true, fitoutFee: true,
      },
    });
    await this.snapshotProposal({ ...proposal, ...dto } as unknown as Record<string, unknown>, undefined, 'DOCUMENT_FIELDS_UPDATED');
    return updated;
  }

  async listVersions(proposalId: string) {
    await this.findOne(proposalId);
    return this.prisma.proposalVersion.findMany({
      where: { proposalId },
      orderBy: { version: 'asc' },
      select: {
        id: true,
        version: true,
        changeReason: true,
        createdById: true,
        createdAt: true,
      },
    });
  }

  async getVersion(proposalId: string, version: number) {
    const row = await this.prisma.proposalVersion.findUnique({
      where: { proposalId_version: { proposalId, version } },
    });
    if (!row) throw new NotFoundException('Proposal version not found');
    return row;
  }

  async compareVersions(proposalId: string, fromVersion: number, toVersion: number) {
    const [fromRow, toRow] = await Promise.all([
      this.getVersion(proposalId, fromVersion),
      this.getVersion(proposalId, toVersion),
    ]);

    const diffs = compareProposalSnapshots(
      fromRow.snapshot as unknown as ProposalSnapshot,
      toRow.snapshot as unknown as ProposalSnapshot,
    );

    return {
      proposalId,
      fromVersion,
      toVersion,
      diffs,
      diffCount: diffs.length,
    };
  }

  async remove(id: string) {
    const proposal = await this.findOne(id);
    if (!['DRAFT', 'REJECTED'].includes(proposal.status)) {
      throw new BadRequestException('Chỉ có thể xóa đề xuất ở trạng thái DRAFT hoặc REJECTED');
    }
    await this.prisma.proposal.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { message: 'Đề xuất đã được xóa' };
  }
}
