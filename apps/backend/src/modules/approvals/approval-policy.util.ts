import { Role } from '@prisma/client';

export type PolicyContext = {
  discountPct: number;
  /** SEM-001 — rent-free concession in whole MONTHS. Never days. */
  rentFreeMonths: number;
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

/**
 * SEM-001 deprecation shim. Persisted `ApprovalPolicyRule` rows created before
 * the rent-free unit was normalised carry `conditionType: 'RENT_FREE_DAYS'` with
 * a day-denominated threshold, but the value they were always compared against
 * (`Proposal.rentFree`) is months — that mismatch is exactly why the seeded
 * "> 60 days" rule could never fire.
 *
 * Rather than silently ignoring those rows (which would remove an approval step
 * without anyone noticing) we keep matching them, converting the stored day
 * threshold into the canonical month unit. 30 days = 1 month, so the seeded
 * "> 60 days" becomes "> 2 months" — the confirmed business rule.
 *
 * The conversion is deliberately not rounded: a legacy "> 45 days" rule becomes
 * "> 1.5 months" rather than being snapped to 1 or 2, so no legacy rule quietly
 * changes which deals it escalates.
 *
 * Legacy rows must be migrated to RENT_FREE_MONTHS; new rules of this type
 * cannot be created (see CreateApprovalPolicyRuleDto).
 */
const LEGACY_DAYS_PER_MONTH = 30;
const legacyRentFreeDaysRulesSeen = new Set<string>();

function legacyRentFreeDaysThresholdToMonths(rule: PolicyRuleLike): number {
  const key = `${rule.stepName}:${rule.operator}:${rule.threshold}`;
  if (!legacyRentFreeDaysRulesSeen.has(key)) {
    legacyRentFreeDaysRulesSeen.add(key);
    // eslint-disable-next-line no-console
    console.warn(
      `[DEPRECATED] ApprovalPolicyRule "${rule.stepName}" uses conditionType RENT_FREE_DAYS ` +
        `(threshold ${rule.threshold}). rentFree is denominated in MONTHS (SEM-001); the ` +
        `threshold is being read as ${(rule.threshold ?? 0) / LEGACY_DAYS_PER_MONTH} months. ` +
        `Migrate this rule to RENT_FREE_MONTHS.`,
    );
  }
  return (rule.threshold ?? 0) / LEGACY_DAYS_PER_MONTH;
}

function matchesRule(rule: PolicyRuleLike, ctx: PolicyContext): boolean {
  if (rule.isRequired) return true;

  switch (rule.conditionType) {
    case 'DISCOUNT_PCT':
      return compareNumber(ctx.discountPct, rule.operator, rule.threshold ?? 0);
    case 'RENT_FREE_MONTHS':
      return compareNumber(ctx.rentFreeMonths, rule.operator, rule.threshold ?? 0);
    case 'RENT_FREE_DAYS':
      return compareNumber(
        ctx.rentFreeMonths,
        rule.operator,
        legacyRentFreeDaysThresholdToMonths(rule),
      );
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

