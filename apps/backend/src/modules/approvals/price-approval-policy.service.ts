import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role, CurrencyCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { policyRuleMatches, type PolicyRuleLike } from './approval-policy.util';
import { DEFAULT_CURRENCY_CODE } from '../../common/constants/currency.constants';

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
  /**
   * What the price was actually measured against.
   *
   * CATEGORY_BAND  the Mall's CategoryMallPricing floor/ceiling (authoritative)
   * UNIT_BASE_RENT the unit's own asking rent, used only because the category
   *                has no band at all
   * NONE           nothing to compare against; escalated rather than passed
   */
  basis: 'CATEGORY_BAND' | 'UNIT_BASE_RENT' | 'NONE';
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
    /**
     * The unit's own asking rent and the currency it is quoted in. Used only as
     * a fallback when the category has no band -- see evaluateAgainstBaseRent.
     */
    unitBaseRentPerSqm?: number | null;
    unitCurrencyCode?: CurrencyCode | null;
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
        basis: 'NONE',
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

    // No band for this category anywhere up its lineage. Rather than escalating
    // every price to the CEO on a meaningless 100% deviation, fall back to the
    // unit's own asking rent -- the only other number the Mall has actually
    // declared for this space.
    if (!validation.categoryPricing) {
      const fallback = this.evaluateAgainstBaseRent(params);
      if (fallback) return await this.finalise(params.mallId, fallback);
    }

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
        basis: 'CATEGORY_BAND',
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
      basis: 'CATEGORY_BAND',
      message: validation.message,
    };
  }

  /**
   * Fallback comparison for a category with no CategoryMallPricing.
   *
   * `Unit.baseRentPerSqm` is treated exactly as a floor would be: at or above it
   * is fine, below it needs sign-off in proportion to how far below. There is no
   * ceiling, because quoting ABOVE the asking rent is not a concession and needs
   * nobody's permission.
   *
   * Deliberately NOT used when a band exists. The two figures already disagree
   * in live data -- 10 of 30 units carry a base rent below their own category
   * floor -- so letting both constrain the same price would block a third of the
   * portfolio on a data inconsistency rather than a commercial decision.
   *
   * Returns null when the fallback cannot be applied, leaving the caller on the
   * existing fail-closed escalation:
   *   - no base rent recorded (0 or null): nothing to compare against
   *   - unit and booking quoted in different currencies: there is no FX engine,
   *     and converting a threshold would invent a number nobody approved
   */
  private evaluateAgainstBaseRent(params: {
    proposedRentPerSqm: number;
    currencyCode?: CurrencyCode;
    unitBaseRentPerSqm?: number | null;
    unitCurrencyCode?: CurrencyCode | null;
  }): { deviationPercent: number; requiresApproval: boolean; snapshot: Prisma.InputJsonValue; message: string } | null {
    const base = params.unitBaseRentPerSqm;
    if (base == null || !(base > 0)) return null;

    const bookingCurrency = params.currencyCode ?? DEFAULT_CURRENCY_CODE;
    const unitCurrency = params.unitCurrencyCode ?? DEFAULT_CURRENCY_CODE;
    if (bookingCurrency !== unitCurrency) {
      this.logger.warn(
        `Base-rent fallback skipped: booking is quoted in ${bookingCurrency} but the unit's ` +
          `base rent is in ${unitCurrency}. No conversion is applied.`,
      );
      return null;
    }

    const below = params.proposedRentPerSqm < base;
    const deviationPercent = below ? ((base - params.proposedRentPerSqm) / base) * 100 : 0;

    return {
      deviationPercent,
      requiresApproval: below,
      snapshot: {
        evaluatedAt: new Date().toISOString(),
        proposedRentPerSqm: params.proposedRentPerSqm,
        basis: 'UNIT_BASE_RENT',
        unitBaseRentPerSqm: base,
        currencyCode: bookingCurrency,
        deviationPercent,
        note: 'Ngành hàng chưa khai báo khung giá — đối chiếu với giá thuê cơ bản của mặt bằng.',
      },
      message: below
        ? `Giá đề xuất thấp hơn giá thuê cơ bản của mặt bằng ${deviationPercent.toFixed(1)}%. ` +
          'Ngành hàng chưa khai báo khung giá nên hệ thống đối chiếu với giá cơ bản.'
        : 'Giá đề xuất không thấp hơn giá thuê cơ bản của mặt bằng.',
    };
  }

  /** Route a base-rent verdict through the same policy ladder as a band verdict. */
  private async finalise(
    mallId: string,
    fallback: { deviationPercent: number; requiresApproval: boolean; snapshot: Prisma.InputJsonValue; message: string },
  ): Promise<PriceApprovalEvaluation> {
    if (!fallback.requiresApproval) {
      return {
        evaluated: true,
        requiresApproval: false,
        deviationPercent: 0,
        approvalLevel: 'NONE',
        pricingRuleId: null,
        pricingSnapshot: fallback.snapshot,
        steps: [],
        unrouted: false,
        basis: 'UNIT_BASE_RENT',
        message: fallback.message,
      };
    }

    const steps = await this.resolveSteps(mallId, fallback.deviationPercent);
    if (steps.length === 0) {
      this.logger.warn(
        `Base-rent deviation ${fallback.deviationPercent.toFixed(1)}% on mall ${mallId} matched no ` +
          'active PRICE_* ApprovalPolicyRule. The booking is held as PENDING with no approver.',
      );
    }

    return {
      evaluated: true,
      requiresApproval: true,
      deviationPercent: fallback.deviationPercent,
      // The ladder decides the real routing; this label just mirrors it.
      approvalLevel: fallback.deviationPercent > 10 ? 'CEO' : fallback.deviationPercent > 5 ? 'DIRECTOR' : 'MANAGER',
      pricingRuleId: null,
      pricingSnapshot: fallback.snapshot,
      steps,
      unrouted: steps.length === 0,
      basis: 'UNIT_BASE_RENT',
      message: fallback.message,
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
