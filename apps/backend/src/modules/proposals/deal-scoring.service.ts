import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { calculateDealScore } from './deal-scoring.util';
import { CurrencyCode } from '@prisma/client';

/**
 * CRM-SCORE-CUR-001 — financial-capacity scoring is currency-scale dependent.
 *
 * The reference scale (a budget of 1,000,000,000 = full marks) is denominated in
 * VND. Applying it to another currency is a cross-currency comparison: a 40,000
 * USD budget — a large one — scored 0.004 and dragged the deal grade down.
 *
 * This function fixes the ARITHMETIC defect only, by refusing to apply a VND
 * scale to a non-VND amount. It does NOT establish a foreign-currency scoring
 * policy, and no USD/MMK threshold is invented here.
 *
 * ⚠ WHAT THE NEUTRAL VALUE MEANS
 * `FINANCIAL_CAPACITY_NEUTRAL` (50) means **"financial capacity was not
 * evaluated for this currency"**. It does NOT mean "medium financial capacity,
 * proven". A USD or MMK customer therefore contributes nothing informative to
 * this criterion, and a deal grade that leans on it is weaker than it looks.
 * Defining a real per-currency scale is a BUSINESS DECISION, still pending —
 * see CRM-SCORE-CUR-001 in docs/audit/ISSUE_REGISTER.md. It is a scale question,
 * not an FX question: do not resolve it with an exchange rate.
 *
 * Exported for testing, and so the rule is visible rather than buried in a
 * ternary.
 */
export const FINANCIAL_CAPACITY_SCALE_CURRENCY: CurrencyCode = 'VND';
export const FINANCIAL_CAPACITY_FULL_MARK = 1_000_000_000;
/** "Not evaluated for this currency" — NOT "medium capacity proven". */
export const FINANCIAL_CAPACITY_NEUTRAL = 50;

export function scoreFinancialCapacity(
  budgetMax: number | null | undefined,
  currencyCode: CurrencyCode | null | undefined,
): number {
  if (!budgetMax) return FINANCIAL_CAPACITY_NEUTRAL;
  if (currencyCode !== FINANCIAL_CAPACITY_SCALE_CURRENCY) return FINANCIAL_CAPACITY_NEUTRAL;
  return Math.min(100, (budgetMax / FINANCIAL_CAPACITY_FULL_MARK) * 100);
}

@Injectable()
export class DealScoringService {
  constructor(private prisma: PrismaService) {}

  async listCriteria() {
    return this.prisma.dealScoreCriterion.findMany({ orderBy: { code: 'asc' } });
  }

  async upsertCriterion(data: {
    code: string;
    name: string;
    fieldSource: string;
    weight?: number;
    minScore?: number;
    maxScore?: number;
    isActive?: boolean;
  }) {
    return this.prisma.dealScoreCriterion.upsert({
      where: { code: data.code },
      create: {
        code: data.code,
        name: data.name,
        fieldSource: data.fieldSource,
        weight: data.weight ?? 1,
        minScore: data.minScore ?? 0,
        maxScore: data.maxScore ?? 100,
        isActive: data.isActive ?? true,
      },
      update: {
        name: data.name,
        fieldSource: data.fieldSource,
        weight: data.weight,
        minScore: data.minScore,
        maxScore: data.maxScore,
        isActive: data.isActive,
      },
    });
  }

  async scoreProposal(proposalId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { tenant: true, unit: true },
    });
    if (!proposal) throw new Error('Proposal not found');

    const customer = proposal.tenantId
      ? await this.prisma.customer.findFirst({ where: { tenantId: proposal.tenantId } })
      : null;

    const criteria = await this.prisma.dealScoreCriterion.findMany({
      where: { isActive: true },
    });

    const result = calculateDealScore(criteria, {
      customerRating: customer?.rating ?? 3,
      brandStrength: customer?.rating ? customer.rating * 20 : 60,
      // CRM-SCORE-CUR-001: the VND-scale divisor is applied only to a VND
      // budget. A non-VND or unknown currency yields "not evaluated" (50), which
      // is a mitigation, not a foreign-currency scoring policy -- see the note
      // on scoreFinancialCapacity.
      financialCapacity: scoreFinancialCapacity(customer?.budgetMax, customer?.currencyCode),
      industryFit: proposal.unit?.category === customer?.preferredCategory ? 90 : 65,
      discountPct: proposal.discount ?? 0,
      rentFreeMonths: proposal.rentFree ?? 0,
    });

    return this.prisma.proposalDealScore.upsert({
      where: { proposalId },
      create: {
        proposalId,
        totalScore: result.totalScore,
        grade: result.grade,
        breakdown: result.breakdown as object,
      },
      update: {
        totalScore: result.totalScore,
        grade: result.grade,
        breakdown: result.breakdown as object,
      },
    });
  }
}
