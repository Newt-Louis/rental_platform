import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, CurrencyCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { policyRuleMatches, type PolicyRuleLike } from './approval-policy.util';
import { DEFAULT_CURRENCY_CODE } from '../../common/constants/currency.constants';
import {
  PRICING_DECISION_PRESENTATION,
  type PricingBasis,
  type PricingDecision,
  type PricingDecisionStatus,
  type PricingDecisionStep,
} from './pricing-decision.types';

/**
 * CR-BOOK-PRICE-APPROVAL-001 / CR-...-ALWAYS-WARN-004 — Pricing Policy Evaluation.
 *
 * Two responsibilities, deliberately separated:
 *
 *   1. Establish the FACTS: which reference applies, what the deviation is.
 *      Nothing here knows what a Manager or a CEO is.
 *   2. Ask the Mall's configured ApprovalPolicyRule who signs.
 *
 * That split is the point. The thresholds and approvers used to be written into
 * the pricing service (`<=5% -> MANAGER`, `<=10% -> DIRECTOR`, else `CEO`) and
 * the resulting level was then discarded, so the system both hard-coded an
 * authority chain and failed to route anything to it. Approval authority is now
 * configuration: changing who signs is a data change, not a deploy.
 *
 * Every path returns a PricingDecision with a user-readable message. A price
 * that needs no approval says so out loud, because "no warning" used to be
 * indistinguishable from "nobody checked".
 */

/** Only these conditions describe a PRICE decision. */
const PRICE_CONDITION_TYPES = ['PRICE_DEVIATION_PCT', 'PRICE_BELOW_MIN'] as const;

export interface EvaluateParams {
  mallId: string;
  categoryId?: string | null;
  floorId?: string | null;
  zoneId?: string | null;
  proposedRentPerSqm: number;
  currencyCode?: CurrencyCode | null;
  unitBaseRentPerSqm?: number | null;
  unitCurrencyCode?: CurrencyCode | null;
  /** Include approver names in the decision. Omit for unprivileged callers. */
  includeApproverNames?: boolean;
}

function money(value: number, currency: CurrencyCode): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(value))} ${currency}`;
}

function pct(value: number): string {
  return `${value.toFixed(2).replace('.', ',')}%`;
}

@Injectable()
export class PriceApprovalPolicyService {
  private readonly logger = new Logger(PriceApprovalPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Public entry point
  // ───────────────────────────────────────────────────────────────────────────

  async evaluate(params: EvaluateParams): Promise<PricingDecision> {
    const bookingCurrency = params.currencyCode ?? DEFAULT_CURRENCY_CODE;

    const band = params.categoryId
      ? await this.categoriesService.validateProposedPrice({
          mallId: params.mallId,
          categoryId: params.categoryId,
          floorId: params.floorId ?? undefined,
          zoneId: params.zoneId ?? undefined,
          proposedRentPerSqm: params.proposedRentPerSqm,
          currencyCode: bookingCurrency,
        })
      : null;

    // ── A category band applies ──────────────────────────────────────────────
    if (band?.categoryPricing) {
      const reference = {
        minRentPerSqm: band.minRentPerSqm,
        maxRentPerSqm: band.maxRentPerSqm,
        currency: bookingCurrency,
      };

      if (!band.requiresApproval) {
        return this.decide({
          status: 'NOT_REQUIRED',
          basis: 'CATEGORY_BAND',
          params,
          reference,
          deviationPercent: 0,
          steps: [],
          policyConfigured: true,
          categoryPricingId: band.categoryPricing.id,
          message:
            `Kiểm tra giá thuê hoàn tất. Giá đề xuất ${money(params.proposedRentPerSqm, bookingCurrency)}/m² ` +
            `nằm trong khung giá của ngành hàng (${money(band.minRentPerSqm, bookingCurrency)} – ` +
            `${money(band.maxRentPerSqm, bookingCurrency)}/m²). Booking này không yêu cầu phê duyệt giá.`,
        });
      }

      const deviation = band.deviationPercent;
      const belowFloor = params.proposedRentPerSqm < band.minRentPerSqm;
      const factMessage =
        `Giá đề xuất ${money(params.proposedRentPerSqm, bookingCurrency)}/m² ` +
        (belowFloor
          ? `thấp hơn giá sàn của ngành hàng ${money(band.minRentPerSqm, bookingCurrency)}/m²`
          : `cao hơn giá trần của ngành hàng ${money(band.maxRentPerSqm, bookingCurrency)}/m²`) +
        `, lệch ${pct(deviation)}.`;

      return this.routeThroughPolicy({
        params,
        basis: 'CATEGORY_BAND',
        reference,
        deviationPercent: deviation,
        factMessage,
        categoryPricingId: band.categoryPricing.id,
      });
    }

    // ── No band in this currency. Is one configured in another? ──────────────
    if (params.categoryId) {
      const otherCurrency = await this.findBandInAnotherCurrency(params, bookingCurrency);
      if (otherCurrency) {
        return this.decide({
          status: 'CURRENCY_MISMATCH',
          basis: 'NONE',
          params,
          reference: { currency: bookingCurrency, referenceCurrency: otherCurrency },
          deviationPercent: null,
          steps: [],
          policyConfigured: false,
          message:
            `Không thể đối chiếu giá. Đơn vị tiền tệ của Booking (${bookingCurrency}) không khớp với ` +
            `khung giá đã khai báo cho ngành hàng (${otherCurrency}). Hệ thống không thực hiện quy đổi ` +
            'tự động vì chưa có quy tắc tỷ giá được phê duyệt.',
        });
      }
    }

    // ── Fall back to the unit's own asking rent ──────────────────────────────
    const base = params.unitBaseRentPerSqm;
    if (base != null && base > 0) {
      const unitCurrency = params.unitCurrencyCode ?? DEFAULT_CURRENCY_CODE;
      if (unitCurrency !== bookingCurrency) {
        return this.decide({
          status: 'CURRENCY_MISMATCH',
          basis: 'NONE',
          params,
          reference: {
            unitBaseRentPerSqm: base,
            currency: bookingCurrency,
            referenceCurrency: unitCurrency,
          },
          deviationPercent: null,
          steps: [],
          policyConfigured: false,
          message:
            `Không thể đối chiếu giá. Đơn vị tiền tệ của Booking (${bookingCurrency}) không khớp với ` +
            `giá thuê cơ bản của mặt bằng (${unitCurrency}). Hệ thống không thực hiện quy đổi tự động ` +
            'vì chưa có quy tắc tỷ giá được phê duyệt.',
        });
      }

      const reference = { unitBaseRentPerSqm: base, currency: bookingCurrency };
      const preamble =
        'Ngành hàng chưa khai báo khung giá. Hệ thống đang đối chiếu với giá thuê cơ bản của mặt bằng ' +
        `(${money(base, bookingCurrency)}/m²). `;

      if (params.proposedRentPerSqm >= base) {
        return this.decide({
          status: 'NOT_REQUIRED',
          basis: 'UNIT_BASE_RENT',
          params,
          reference,
          deviationPercent: 0,
          steps: [],
          policyConfigured: true,
          message:
            preamble +
            `Giá đề xuất ${money(params.proposedRentPerSqm, bookingCurrency)}/m² không thấp hơn mức tham chiếu. ` +
            'Booking này không yêu cầu phê duyệt giá.',
        });
      }

      const deviation = ((base - params.proposedRentPerSqm) / base) * 100;
      return this.routeThroughPolicy({
        params,
        basis: 'UNIT_BASE_RENT',
        reference,
        deviationPercent: deviation,
        factMessage:
          preamble +
          `Giá đề xuất ${money(params.proposedRentPerSqm, bookingCurrency)}/m² thấp hơn mức tham chiếu, ` +
          `lệch ${pct(deviation)}.`,
      });
    }

    // ── Nothing to compare against ───────────────────────────────────────────
    return this.decide({
      status: 'PRICING_REFERENCE_MISSING',
      basis: 'NONE',
      params,
      reference: { currency: bookingCurrency },
      // Deliberately null. The old code reported 100% here, a number that
      // described nothing and escalated every price to one person.
      deviationPercent: null,
      steps: [],
      policyConfigured: false,
      message:
        'Chưa có giá tham chiếu. Ngành hàng chưa được cấu hình khung giá và mặt bằng chưa có giá thuê ' +
        'cơ bản. Hệ thống chưa đủ dữ liệu để đánh giá mức giá đề xuất.',
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Policy routing
  // ───────────────────────────────────────────────────────────────────────────

  private async routeThroughPolicy(input: {
    params: EvaluateParams;
    basis: PricingBasis;
    reference: PricingDecision['reference'];
    deviationPercent: number;
    factMessage: string;
    categoryPricingId?: string | null;
  }): Promise<PricingDecision> {
    const resolution = await this.resolveSteps(
      input.params.mallId,
      input.deviationPercent,
      input.params.includeApproverNames ?? false,
    );

    if (resolution.ambiguous) {
      return this.decide({
        status: 'POLICY_AMBIGUOUS',
        basis: input.basis,
        params: input.params,
        reference: input.reference,
        deviationPercent: input.deviationPercent,
        steps: [],
        policyConfigured: true,
        categoryPricingId: input.categoryPricingId,
        message:
          input.factMessage +
          ' Cấu hình quy trình duyệt chưa hợp lệ: có nhiều quy tắc phê duyệt cùng một vị trí bước ' +
          `(${resolution.ambiguousDetail}) nên hệ thống không thể xác định một kết quả an toàn. ` +
          'Vui lòng kiểm tra cấu hình quy trình phê duyệt.',
      });
    }

    if (resolution.steps.length === 0) {
      this.logger.warn(
        `Deviation ${input.deviationPercent.toFixed(2)}% on mall ${input.params.mallId} matched no ` +
          'active PRICE_* ApprovalPolicyRule. The booking is held with no approver.',
      );
      return this.decide({
        status: 'POLICY_NOT_CONFIGURED',
        basis: input.basis,
        params: input.params,
        reference: input.reference,
        deviationPercent: input.deviationPercent,
        steps: [],
        policyConfigured: false,
        categoryPricingId: input.categoryPricingId,
        message:
          input.factMessage +
          ' Hệ thống chưa tìm thấy quy trình phê duyệt phù hợp với Booking này. Booking có thể được lưu, ' +
          'nhưng chưa thể hoàn tất phê duyệt để tiếp tục sang Proposal cho đến khi quy trình được cấu hình.',
      });
    }

    return this.decide({
      status: 'ROUTED',
      basis: input.basis,
      params: input.params,
      reference: input.reference,
      deviationPercent: input.deviationPercent,
      steps: resolution.steps,
      policyConfigured: true,
      categoryPricingId: input.categoryPricingId,
      message:
        input.factMessage +
        ' Theo quy trình phê duyệt hiện được cấu hình, Booking này cần được phê duyệt trước khi có thể ' +
        'tiếp tục sang Proposal.',
    });
  }

  /**
   * Turn the Mall's active price rules into an ordered approver chain.
   *
   * Only PRICE_* conditions are read. The shared matcher treats `isRequired` as
   * "always matches", so passing the whole rule set would drag the proposal
   * workflow's mandatory Finance and Legal sign-offs into every rate decision.
   *
   * Two matching rules at DIFFERENT stepOrders are a sequential chain — that is
   * what stepOrder means, and both must sign. Two at the SAME stepOrder naming
   * different people express no order at all, so the resulting chain would
   * depend on the query plan; that is reported as ambiguous rather than
   * resolved arbitrarily.
   */
  async resolveSteps(
    mallId: string,
    deviationPercent: number,
    includeApproverNames = false,
  ): Promise<{ steps: PricingDecisionStep[]; ambiguous: boolean; ambiguousDetail: string }> {
    const rules = await this.prisma.approvalPolicyRule.findMany({
      where: {
        mallId,
        isActive: true,
        conditionType: { in: [...PRICE_CONDITION_TYPES] },
      },
      orderBy: [{ stepOrder: 'asc' }, { code: 'asc' }],
      ...(includeApproverNames
        ? { include: { approver: { select: { id: true, fullName: true } } } }
        : {}),
    });

    const ctx = {
      discountPct: 0,
      rentFreeMonths: 0,
      industryTag: null,
      hasArDebt: false,
      priceDeviationPct: deviationPercent,
    };

    const matched = rules.filter((rule) => policyRuleMatches(rule as PolicyRuleLike, ctx));

    // Same position, different signer: undetermined order.
    const byOrder = new Map<number, Set<string>>();
    for (const rule of matched) {
      const bucket = byOrder.get(rule.stepOrder) ?? new Set<string>();
      bucket.add(rule.approverId);
      byOrder.set(rule.stepOrder, bucket);
    }
    const clash = [...byOrder.entries()].find(([, approvers]) => approvers.size > 1);
    if (clash) {
      const codes = matched.filter((rule) => rule.stepOrder === clash[0]).map((rule) => rule.code);
      return { steps: [], ambiguous: true, ambiguousDetail: `bước ${clash[0]}: ${codes.join(', ')}` };
    }

    const unique = new Map<string, PricingDecisionStep>();
    for (const rule of matched) {
      const key = `${rule.stepOrder}-${rule.stepName}-${rule.approverRole}-${rule.approverId}`;
      if (unique.has(key)) continue;
      unique.set(key, {
        stepOrder: rule.stepOrder,
        stepName: rule.stepName,
        approverRole: rule.approverRole,
        approverId: rule.approverId,
        approverName: (rule as any).approver?.fullName ?? null,
        policyRuleCode: rule.code,
        policyName: rule.name,
      });
    }

    const steps = [...unique.values()]
      .sort((a, b) => a.stepOrder - b.stepOrder || a.policyRuleCode.localeCompare(b.policyRuleCode))
      .map((step, index) => ({ ...step, stepOrder: index + 1 }));

    return { steps, ambiguous: false, ambiguousDetail: '' };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Assembly
  // ───────────────────────────────────────────────────────────────────────────

  private decide(input: {
    status: PricingDecisionStatus;
    basis: PricingBasis;
    params: EvaluateParams;
    reference: PricingDecision['reference'];
    deviationPercent: number | null;
    steps: PricingDecisionStep[];
    policyConfigured: boolean;
    message: string;
    categoryPricingId?: string | null;
  }): PricingDecision {
    const presentation = PRICING_DECISION_PRESENTATION[input.status];
    const decision: PricingDecision = {
      status: input.status,
      severity: presentation.severity,
      requiresAcknowledgement: presentation.requiresAcknowledgement,
      blocking: presentation.blocking,
      basis: input.basis,
      proposedRentPerSqm: input.params.proposedRentPerSqm,
      reference: input.reference,
      deviationPercent: input.deviationPercent,
      approval: {
        required: input.status === 'ROUTED' || input.status === 'POLICY_NOT_CONFIGURED',
        policyConfigured: input.policyConfigured,
        steps: input.steps,
      },
      categoryPricingId: input.categoryPricingId ?? null,
      warningCode: `PRICE_${input.status}`,
      message: input.message,
      evaluatedAt: new Date().toISOString(),
      fingerprint: '',
    };
    decision.fingerprint = this.fingerprint(decision);
    return decision;
  }

  /**
   * Digest of everything that would change the outcome, so the server can tell
   * whether the decision the user acknowledged is still the one that applies.
   *
   * `evaluatedAt` is excluded on purpose: re-evaluating identical inputs a
   * second later must produce the same fingerprint, or every submit would look
   * like a change.
   */
  fingerprint(decision: PricingDecision): string {
    const material = JSON.stringify({
      status: decision.status,
      basis: decision.basis,
      proposed: decision.proposedRentPerSqm,
      reference: decision.reference,
      // Rounded: float noise below a ten-thousandth of a percent is not a
      // change the user needs to re-read a warning for.
      deviation:
        decision.deviationPercent == null ? null : Number(decision.deviationPercent.toFixed(4)),
      categoryPricingId: decision.categoryPricingId ?? null,
      steps: decision.approval.steps.map((s) => `${s.stepOrder}:${s.policyRuleCode}:${s.approverId}`),
    });
    return createHash('sha256').update(material).digest('hex').slice(0, 32);
  }

  /**
   * Evidence for the decision, persisted on the booking. A historical booking
   * must stay explainable after the policy or the band is edited, so the ids
   * and the numbers are stored — not just the sentence shown to the user.
   */
  snapshotOf(decision: PricingDecision): Prisma.InputJsonValue {
    return {
      status: decision.status,
      basis: decision.basis,
      proposedRentPerSqm: decision.proposedRentPerSqm,
      currency: decision.reference.currency,
      referenceCurrency: decision.reference.referenceCurrency ?? null,
      minRentPerSqm: decision.reference.minRentPerSqm ?? null,
      maxRentPerSqm: decision.reference.maxRentPerSqm ?? null,
      unitBaseRentPerSqm: decision.reference.unitBaseRentPerSqm ?? null,
      deviationPercent: decision.deviationPercent,
      categoryPricingId: decision.categoryPricingId ?? null,
      policyRuleCodes: decision.approval.steps.map((s) => s.policyRuleCode),
      policyApproverIds: decision.approval.steps.map((s) => s.approverId),
      policyConfigured: decision.approval.policyConfigured,
      approvalRequired: decision.approval.required,
      fingerprint: decision.fingerprint,
      evaluatedAt: decision.evaluatedAt,
      message: decision.message,
    };
  }

  /** Does the category have a band configured in some OTHER currency? */
  private async findBandInAnotherCurrency(
    params: EvaluateParams,
    bookingCurrency: CurrencyCode,
  ): Promise<CurrencyCode | null> {
    const now = new Date();
    const other = await this.prisma.categoryMallPricing.findFirst({
      where: {
        mallId: params.mallId,
        categoryId: params.categoryId as string,
        isActive: true,
        currencyCode: { not: bookingCurrency },
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      select: { currencyCode: true },
    });
    return other?.currencyCode ?? null;
  }
}
