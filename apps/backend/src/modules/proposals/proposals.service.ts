import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { ContractStatus, ProposalStatus, UnitStatus, WorkflowStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { buildApprovalStepsFromRules } from '../approvals/approval-policy.util';
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
  ) {
    const latest = await this.prisma.proposalVersion.findFirst({
      where: { proposalId: proposal.id as string },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.proposalVersion.create({
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

  async findAll(query: { status?: ProposalStatus; unitId?: string; tenantId?: string; page?: number; limit?: number }) {
    const { ...filters } = query;
    const page = Math.max(1, +query.page || 1);
    const limit = Math.max(1, +query.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = { isActive: true, deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.unitId) where.unitId = filters.unitId;
    if (filters.tenantId) where.tenantId = filters.tenantId;

    const [data, total] = await Promise.all([
      this.prisma.proposal.findMany({
        where,
        skip,
        take: +limit,
        include: {
          unit: { select: { id: true, code: true, name: true, floor: { select: { name: true } } } },
          tenant: { select: { id: true, brandName: true, companyName: true } },
          lead: { select: { id: true, brandName: true, contactName: true } },
          approvalWorkflow: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.proposal.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
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

  async update(id: string, dto: Partial<CreateProposalDto>) {
    const proposal = await this.findOne(id);
    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT proposals can be edited');
    }

    const updateData: any = { ...dto };
    if (dto.startDate || dto.area || dto.rentPerSqm || dto.term || dto.discount) {
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
    await this.snapshotProposal(updated as unknown as Record<string, unknown>, undefined, 'UPDATED');
    return updated;
  }

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

    const steps = buildApprovalStepsFromRules(rules, {
      discountPct: proposal.discount ?? 0,
      rentFreeDays: proposal.rentFree ?? 0,
      industryTag: proposal.unit?.category ?? proposal.tenant?.category ?? null,
      hasArDebt,
    });

    if (!steps.length) {
      throw new BadRequestException(
        'No approval step matched current proposal. Please review approval policy rules.',
      );
    }

    await this.snapshotProposal(proposal as unknown as Record<string, unknown>, undefined, 'SUBMITTED');

    const workflow = await this.prisma.approvalWorkflow.create({
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

    await this.prisma.proposal.update({
      where: { id },
      data: { status: ProposalStatus.SUBMITTED },
    });

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

  async createContractFromProposal(
    id: string,
    options?: { userId?: string; markConverted?: boolean },
  ) {
    const proposal = await this.findOne(id);
    if (
      proposal.status !== ProposalStatus.APPROVED &&
      proposal.status !== ProposalStatus.SUBMITTED
    ) {
      throw new BadRequestException('Proposal must be approved before creating contract');
    }
    if (!proposal.tenantId) {
      throw new BadRequestException('Proposal must have a tenant before converting to contract');
    }

    const existing = await this.prisma.contract.findFirst({ where: { proposalId: id } });
    if (existing) return existing;

    const year = new Date().getFullYear();
    const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
    const contractNumber = `CTR-${year}-${rand}`;

    const contract = await this.prisma.contract.create({
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
      },
    });

    await this.unitStatus.transition(proposal.unitId, UnitStatus.CONTRACTED, {
      userId: options?.userId,
      reason: `Contract ${contractNumber} created from proposal ${proposal.proposalNumber}`,
      tenantId: proposal.tenantId,
      leaseStartDate: proposal.startDate,
      leaseEndDate: proposal.endDate ?? undefined,
    });

    if (options?.markConverted !== false) {
      await this.prisma.proposal.update({
        where: { id },
        data: { status: ProposalStatus.CONVERTED },
      });
    }

    if (proposal.leadId) {
      await this.prisma.lead.update({
        where: { id: proposal.leadId },
        data: { status: 'WON' as any },
      });
      const creatorId = proposal.createdById ?? options?.userId ?? 'system';
      await this.customersService.createFromLead(proposal.leadId, creatorId);
    }

    return contract;
  }

  async convertToContract(id: string, userId?: string) {
    const proposal = await this.findOne(id);
    if (proposal.status !== ProposalStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED proposals can be converted');
    }
    return this.createContractFromProposal(id, { userId, markConverted: true });
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

    return updated;
  }

  async saveEditorContent(id: string, editorContent: any) {
    await this.findOne(id);
    return this.prisma.proposal.update({
      where: { id },
      data: { editorContent },
      select: { id: true, proposalNumber: true, editorContent: true },
    });
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
}
