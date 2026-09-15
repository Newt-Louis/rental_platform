import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { buildApprovalStepsFromRules, PolicyContext } from '../approvals/approval-policy.util';
import { ApprovalsService } from '../approvals/approvals.service';
import { loadRoutingIssues, RoutingIssue } from '../approvals/approval-routing.validator';

type Client = PrismaService | Prisma.TransactionClient;

export interface RoutedStep {
  stepOrder: number;
  stepName: string;
  approverRole: Role;
  approverId: string | null;
}

export interface ProposalPolicyEvaluation {
  mallId: string;
  policyContext: PolicyContext;
  pricingRuleId: string | null;
  pricingSnapshot: Prisma.InputJsonValue | undefined;
}

export interface ProposalRoutePreview {
  evaluatedAt: string;
  policyConfigured: boolean;
  steps: Array<RoutedStep & { approverName: string | null }>;
  issues: RoutingIssue[];
}

type ProposalForPolicy = {
  tenantId: string | null;
  discount: number | null;
  rentFree: number | null;
  rentPerSqm: number;
  rentCurrency: any;
  unit?: {
    mallId: string;
    categoryId?: string | null;
    floorId?: string | null;
    zoneId?: string | null;
    category?: string | null;
  } | null;
  tenant?: { category?: string | null } | null;
};

/**
 * The one place a Proposal's approval route is worked out: the policy facts
 * (discount, rent-free, overdue AR, deviation from the category price band),
 * and the Mall's active rules with the person each rule names. Submit uses it
 * to create the workflow; the draft Tờ trình uses it to show the route it would
 * get today.
 */
@Injectable()
export class ProposalApprovalRouteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async evaluatePolicy(proposal: ProposalForPolicy): Promise<ProposalPolicyEvaluation> {
    const mallId = proposal.unit?.mallId;
    if (!mallId) {
      throw new BadRequestException('Không xác định được mall của đề xuất để áp quy tắc duyệt');
    }

    const hasArDebt = proposal.tenantId
      ? (await this.prisma.invoice.count({
          where: { tenantId: proposal.tenantId, status: 'OVERDUE', isActive: true },
        })) > 0
      : false;

    // Deviation from the category price band at this moment, so PRICE_DEVIATION_PCT
    // rules (Director/CEO price review) can match. A band is only matched in the
    // Proposal's own currency.
    let priceDeviationPct = 0;
    let pricingRuleId: string | null = null;
    let pricingSnapshot: Prisma.InputJsonValue | undefined;
    if (proposal.unit?.categoryId) {
      const validation = await this.categoriesService.validateProposedPrice({
        mallId,
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

    return {
      mallId,
      policyContext: {
        discountPct: proposal.discount ?? 0,
        rentFreeMonths: proposal.rentFree ?? 0,
        industryTag: proposal.unit?.category ?? proposal.tenant?.category ?? null,
        hasArDebt,
        priceDeviationPct,
      },
      pricingRuleId,
      pricingSnapshot,
    };
  }

  /**
   * Active rules → ordered steps. Read through the caller's client so a submit
   * builds the route from the same snapshot it commits with.
   */
  async buildSteps(client: Client, mallId: string, policyContext: PolicyContext) {
    const rules = await client.approvalPolicyRule.findMany({
      where: { isActive: true, mallId },
      orderBy: [{ stepOrder: 'asc' }, { createdAt: 'asc' }],
      include: { approver: { select: { fullName: true } } },
    });
    if (!rules.length) return { policyConfigured: false, steps: [] as RoutedStep[], names: new Map<string, string>() };
    const names = new Map(rules.map((r) => [r.approverId, r.approver?.fullName ?? null]));
    const steps = buildApprovalStepsFromRules(rules.map(({ approver, ...rule }) => rule), policyContext) as RoutedStep[];
    return { policyConfigured: true, steps, names };
  }

  /** The route this DRAFT would get if submitted now. Nothing is written. */
  async preview(proposalId: string): Promise<ProposalRoutePreview> {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        createdById: true, tenantId: true, discount: true, rentFree: true, rentPerSqm: true, rentCurrency: true,
        unit: { select: { mallId: true, categoryId: true, floorId: true, zoneId: true, category: true } },
        tenant: { select: { category: true } },
      },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');

    const evaluation = await this.evaluatePolicy(proposal as ProposalForPolicy);
    const built = await this.buildSteps(this.prisma, evaluation.mallId, evaluation.policyContext);
    const issues = !built.policyConfigured
      ? [{ stepOrder: null, stepName: null, reason: 'NO_ACTIVE_POLICY' } as RoutingIssue]
      : await loadRoutingIssues(this.prisma as unknown as Prisma.TransactionClient, built.steps, {
          creatorId: proposal.createdById,
          mallId: evaluation.mallId,
          eligibleRoles: ApprovalsService.ELIGIBLE_APPROVER_ROLES,
        });
    return {
      evaluatedAt: new Date().toISOString(),
      policyConfigured: built.policyConfigured,
      steps: built.steps.map((step) => ({ ...step, approverName: step.approverId ? built.names.get(step.approverId) ?? null : null })),
      issues,
    };
  }
}
