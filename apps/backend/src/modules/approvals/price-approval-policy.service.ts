import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role, CurrencyCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { policyRuleMatches, type PolicyRuleLike } from './approval-policy.util';

/**
 * CR-BOOK-PRICE-APPROVAL-001 — "Pricing Policy Evaluation".
 *
 * One place that answers, for a proposed rent: how far outside the band is it,
 * does it need approval, which pricing rule decided that, and WHO has to sign
 * it off.
 *
 * Before this, the deviation was computed and the approval LEVEL
 * (MANAGER/DIRECTOR/CEO) was computed alongside it — and then thrown away.
 * `UnitBooking` only ever stored a flat PENDING flag, so nothing routed the
 * decision to anyone, the endpoint carried no role restriction at all, and the
 * CEO the rules kept naming was not even a member of the bookings module.
 *
 * The approver chain comes from `ApprovalPolicyRule`, the same per-mall,
 * admin-editable table the proposal workflow already uses, filtered to the
 * price conditions. Nothing about the thresholds is hard-coded here.
 */

/** Only these conditions describe a PRICE decision. */
const PRICE_CONDITION_TYPES = ['PRICE_DEVIATION_PCT', 'PRICE_BELOW_MIN'] as const;

export interface ResolvedPriceApprovalStep {
  stepOrder: number;
  stepName: string;
  approverRole: Role;
  approverId: string;
  policyRuleCode: string;
}

export interface PriceApprovalEvaluation {
  /**
   * False when no band could be resolved at all — the unit carries no category,
   * so there is nothing to compare against. The caller must NOT treat this as
   * "price is fine": it is "price was never checked".
   */
  evaluated: boolean;
  requiresApproval: boolean;
  deviationPercent: number;
  /** Advisory label from the pricing service; the real routing is `steps`. */
  approvalLevel: 'NONE' | 'MANAGER' | 'DIRECTOR' | 'CEO';
  pricingRuleId: string | null;
  pricingSnapshot?: Prisma.InputJsonValue;
  steps: ResolvedPriceApprovalStep[];
  /**
   * Approval is required but the Mall has no active price policy rule that
   * matches. The booking is still held — it is never let through — but nobody
   * is addressable, so only an ADMIN can clear it. Surfaced so the queue can
   * say why instead of showing an empty approver column.
   */
  unrouted: boolean;
  message: string;
}

@Injectable()
export class PriceApprovalPolicyService {
  private readonly logger = new Logger(PriceApprovalPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async evaluate(params: {
    mallId: string;
    categoryId: string | null | undefined;
    floorId?: string | null;
    zoneId?: string | null;
    proposedRentPerSqm: number;
    currencyCode?: CurrencyCode;
  }): Promise<PriceApprovalEvaluation> {
    if (!params.categoryId) {
      // Historically this was an early `&& unit.categoryId` guard that skipped
      // the whole check in silence, so any unit missing a category accepted any
      // price at all. It still cannot be priced against a band, but the caller
      // now receives an explicit "not evaluated" instead of a pass.
      return {
        evaluated: false,
        requiresApproval: false,
        deviationPercent: 0,
        approvalLevel: 'NONE',
        pricingRuleId: null,
        steps: [],
        unrouted: false,
        message:
          'Mặt bằng chưa gán ngành hàng nên không có khung giá để đối chiếu. Giá chưa được kiểm tra.',
      };
    }

    const validation = await this.categoriesService.validateProposedPrice({
      mallId: params.mallId,
      categoryId: params.categoryId,
      floorId: params.floorId ?? undefined,
      zoneId: params.zoneId ?? undefined,
      proposedRentPerSqm: params.proposedRentPerSqm,
      currencyCode: params.currencyCode,
    });

    const pricingSnapshot: Prisma.InputJsonValue = {
      evaluatedAt: new Date().toISOString(),
      proposedRentPerSqm: params.proposedRentPerSqm,
      minRentPerSqm: validation.minRentPerSqm,
      maxRentPerSqm: validation.maxRentPerSqm,
      suggestedRent: validation.categoryPricing?.suggestedRent ?? null,
      camPerSqm: validation.categoryPricing?.camPerSqm ?? null,
      sources: validation.categoryPricing?.sources ?? null,
      deviationPercent: validation.deviationPercent,
      approvalLevel: validation.approvalLevel,
    };

    if (!validation.requiresApproval) {
      return {
        evaluated: true,
        requiresApproval: false,
        deviationPercent: validation.deviationPercent,
        approvalLevel: 'NONE',
        pricingRuleId: validation.categoryPricing?.id ?? null,
        pricingSnapshot,
        steps: [],
        unrouted: false,
        message: validation.message,
      };
    }

    const steps = await this.resolveSteps(params.mallId, validation.deviationPercent);

    if (steps.length === 0) {
      this.logger.warn(
        `Price deviation ${validation.deviationPercent.toFixed(1)}% on mall ${params.mallId} ` +
          'matched no active PRICE_* ApprovalPolicyRule. The booking is held as PENDING with no approver.',
      );
    }

    return {
      evaluated: true,
      requiresApproval: true,
      deviationPercent: validation.deviationPercent,
      approvalLevel: validation.approvalLevel,
      pricingRuleId: validation.categoryPricing?.id ?? null,
      pricingSnapshot,
      steps,
      unrouted: steps.length === 0,
      message: validation.message,
    };
  }

  /**
   * Load the Mall's active price policy rules and turn the matching ones into
   * an ordered, de-duplicated approver chain.
   *
   * Only PRICE_* conditions are considered. The generic matcher treats
   * `isRequired` as "always matches", so feeding it the full rule set would drag
   * the proposal workflow's mandatory Finance and Legal sign-offs into every
   * booking price decision — those steps review a deal, not a rate.
   */
  async resolveSteps(mallId: string, deviationPercent: number): Promise<ResolvedPriceApprovalStep[]> {
    const rules = await this.prisma.approvalPolicyRule.findMany({
      where: {
        mallId,
        isActive: true,
        conditionType: { in: [...PRICE_CONDITION_TYPES] },
      },
      // `code` is the deterministic tie-break. It is unique per Mall
      // (@@unique([mallId, code])), so two rules sharing a stepOrder still have
      // one defined order that does not depend on the query plan.
      orderBy: [{ stepOrder: 'asc' }, { code: 'asc' }],
    });

    const ctx = {
      discountPct: 0,
      rentFreeMonths: 0,
      industryTag: null,
      hasArDebt: false,
      priceDeviationPct: deviationPercent,
    };

    const matched = rules.filter((rule) => policyRuleMatches(rule as PolicyRuleLike, ctx));

    // Two rules naming the same person for the same step are one step; two rules
    // naming different people are two real sign-offs and must both stand.
    const unique = new Map<string, ResolvedPriceApprovalStep>();
    for (const rule of matched) {
      const key = `${rule.stepOrder}-${rule.stepName}-${rule.approverRole}-${rule.approverId}`;
      if (unique.has(key)) continue;
      unique.set(key, {
        stepOrder: rule.stepOrder,
        stepName: rule.stepName,
        approverRole: rule.approverRole,
        approverId: rule.approverId,
        policyRuleCode: rule.code,
      });
    }

    // Sorting on stepOrder alone is stable, which means ties silently inherit
    // the order Postgres happened to return -- i.e. the chain could differ
    // between two runs over identical data. Tie-break on the rule code so the
    // resolved chain is a property of the policy, not of the query plan.
    return [...unique.values()]
      .sort((a, b) => a.stepOrder - b.stepOrder || a.policyRuleCode.localeCompare(b.policyRuleCode))
      .map((step, index) => ({ ...step, stepOrder: index + 1 }));
  }
}
