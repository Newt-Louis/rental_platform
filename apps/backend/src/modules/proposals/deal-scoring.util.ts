export type DealScoreCriterionLike = {
  code: string;
  name: string;
  fieldSource: string;
  weight: number;
  minScore: number;
  maxScore: number;
};

export type DealScoreInput = {
  customerRating?: number | null;
  brandStrength?: number | null;
  financialCapacity?: number | null;
  industryFit?: number | null;
  discountPct: number;
  rentFreeDays: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreFromSource(source: string, input: DealScoreInput): number {
  switch (source) {
    case 'CUSTOMER_RATING':
      return clamp((input.customerRating ?? 3) / 5, 0, 1) * 100;
    case 'BRAND_STRENGTH':
      return clamp(input.brandStrength ?? 60, 0, 100);
    case 'FINANCIAL_CAPACITY':
      return clamp(input.financialCapacity ?? 50, 0, 100);
    case 'INDUSTRY_FIT':
      return clamp(input.industryFit ?? 70, 0, 100);
    case 'DISCOUNT_RISK':
      return clamp(100 - input.discountPct * 3 - input.rentFreeDays * 0.2, 0, 100);
    default:
      return 50;
  }
}

export function gradeFromScore(total: number): string {
  if (total >= 80) return 'A';
  if (total >= 65) return 'B';
  if (total >= 50) return 'C';
  return 'D';
}

export function calculateDealScore(
  criteria: DealScoreCriterionLike[],
  input: DealScoreInput,
) {
  const active = criteria.filter((c) => c.weight > 0);
  const totalWeight = active.reduce((s, c) => s + c.weight, 0) || 1;

  const breakdown = active.map((criterion) => {
    const raw = scoreFromSource(criterion.fieldSource, input);
    const normalized = clamp(raw, criterion.minScore, criterion.maxScore);
    const weighted = (normalized * criterion.weight) / totalWeight;
    return {
      code: criterion.code,
      name: criterion.name,
      fieldSource: criterion.fieldSource,
      rawScore: Math.round(raw * 10) / 10,
      weightedScore: Math.round(weighted * 10) / 10,
    };
  });

  const totalScore = Math.round(breakdown.reduce((s, b) => s + b.weightedScore, 0) * 10) / 10;

  return {
    totalScore,
    grade: gradeFromScore(totalScore),
    breakdown,
  };
}
