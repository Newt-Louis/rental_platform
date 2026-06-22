import { Role } from '@prisma/client';

export type PolicyContext = {
  discountPct: number;
  rentFreeDays: number;
  industryTag?: string | null;
  hasArDebt: boolean;
  priceDeviationPct?: number;  // % below minimum price
};

export type PolicyRuleLike = {
  stepName: string;
  stepOrder: number;
  approverRole: Role;
  conditionType: string;
  operator?: string | null;
  threshold?: number | null;
  matchValue?: string | null;
  isRequired: boolean;
};

function compareNumber(left: number, operator: string | null | undefined, right: number): boolean {
  switch (operator) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '=':
    case '==':
      return left === right;
    default:
      return false;
  }
}

function matchesRule(rule: PolicyRuleLike, ctx: PolicyContext): boolean {
  if (rule.isRequired) return true;

  switch (rule.conditionType) {
    case 'DISCOUNT_PCT':
      return compareNumber(ctx.discountPct, rule.operator, rule.threshold ?? 0);
    case 'RENT_FREE_DAYS':
      return compareNumber(ctx.rentFreeDays, rule.operator, rule.threshold ?? 0);
    case 'INDUSTRY_TAG':
      return (ctx.industryTag ?? '').toLowerCase() === (rule.matchValue ?? '').toLowerCase();
    case 'HAS_AR_DEBT':
      return ctx.hasArDebt;
    case 'PRICE_BELOW_MIN':
      return (ctx.priceDeviationPct ?? 0) > 0;
    case 'PRICE_DEVIATION_PCT':
      if (rule.operator === 'BETWEEN' && rule.matchValue) {
        const maxThreshold = parseFloat(rule.matchValue);
        const minThreshold = rule.threshold ?? 0;
        const deviation = ctx.priceDeviationPct ?? 0;
        return deviation >= minThreshold && deviation <= maxThreshold;
      }
      return compareNumber(ctx.priceDeviationPct ?? 0, rule.operator, rule.threshold ?? 0);
    default:
      return false;
  }
}

export function buildApprovalStepsFromRules(rules: PolicyRuleLike[], ctx: PolicyContext) {
  const selected = rules.filter((rule) => matchesRule(rule, ctx));
  const unique = new Map<string, { stepName: string; stepOrder: number; approverRole: Role }>();

  for (const rule of selected) {
    const key = `${rule.stepOrder}-${rule.stepName}-${rule.approverRole}`;
    if (!unique.has(key)) {
      unique.set(key, {
        stepName: rule.stepName,
        stepOrder: rule.stepOrder,
        approverRole: rule.approverRole,
      });
    }
  }

  return [...unique.values()]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((step, idx) => ({
      ...step,
      stepOrder: idx + 1,
    }));
}

