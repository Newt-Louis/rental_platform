import { CurrencyCode, Role } from '@prisma/client';

/**
 * CR-BOOKING-PRICE-APPROVAL-ALWAYS-WARN-004 — the pricing decision contract.
 *
 * Every price evaluation returns one of these, always, with a message the user
 * can read. There is no code path that decides something about a price and says
 * nothing: silence was how "no policy configured" used to look identical to
 * "no approval needed".
 */

export type PricingDecisionStatus =
  /** Evaluated against a reference; the price is inside it. */
  | 'NOT_REQUIRED'
  /** Evaluated, needs approval, and the Mall's configuration named the signers. */
  | 'ROUTED'
  /** Needs approval, but no configured rule matches. Held, never inferred. */
  | 'POLICY_NOT_CONFIGURED'
  /** Configuration cannot yield one deterministic chain. Unsafe: blocks. */
  | 'POLICY_AMBIGUOUS'
  /** Neither a category band nor a usable unit base rent exists. */
  | 'PRICING_REFERENCE_MISSING'
  /** A reference exists but is quoted in another currency. No FX is applied. */
  | 'CURRENCY_MISMATCH';

/** What the proposed price was actually measured against. */
export type PricingBasis = 'CATEGORY_BAND' | 'UNIT_BASE_RENT' | 'NONE';

export type PricingDecisionSeverity = 'INFO' | 'WARNING' | 'ERROR';

export interface PricingDecisionStep {
  stepOrder: number;
  stepName: string;
  approverRole: Role;
  approverId: string;
  /** Present when the caller is allowed to see who signs. */
  approverName?: string | null;
  policyRuleCode: string;
  policyName: string;
}

export interface PricingDecisionReference {
  minRentPerSqm?: number | null;
  maxRentPerSqm?: number | null;
  unitBaseRentPerSqm?: number | null;
  currency: CurrencyCode;
  /** Currency the reference itself is quoted in, when it differs. */
  referenceCurrency?: CurrencyCode | null;
}

export interface PricingDecision {
  status: PricingDecisionStatus;
  severity: PricingDecisionSeverity;
  /** The UI must make the user confirm before submitting. */
  requiresAcknowledgement: boolean;
  /** No acknowledgement can clear this; the write is refused. */
  blocking: boolean;

  basis: PricingBasis;
  proposedRentPerSqm: number;
  reference: PricingDecisionReference;
  /** Null when no reference could be resolved — never a fabricated 100%. */
  deviationPercent: number | null;

  approval: {
    required: boolean;
    policyConfigured: boolean;
    steps: PricingDecisionStep[];
  };

  /** The CategoryMallPricing row the band came from, for the audit trail. */
  categoryPricingId?: string | null;

  warningCode: string;
  message: string;
  evaluatedAt: string;

  /**
   * Stable digest of everything that would change the outcome. The client
   * echoes it back on submit so the server can tell whether the decision the
   * user actually saw still holds (TOCTOU).
   */
  fingerprint: string;
}

/**
 * Severity and acknowledgement are a property of the status, not of the screen,
 * so every surface presents the same decision the same way.
 */
export const PRICING_DECISION_PRESENTATION: Record<
  PricingDecisionStatus,
  { severity: PricingDecisionSeverity; requiresAcknowledgement: boolean; blocking: boolean }
> = {
  NOT_REQUIRED: { severity: 'INFO', requiresAcknowledgement: false, blocking: false },
  // Needing approval is a normal business outcome, not an error: the booking is
  // created, it simply enters the configured workflow.
  ROUTED: { severity: 'WARNING', requiresAcknowledgement: true, blocking: false },
  POLICY_NOT_CONFIGURED: { severity: 'WARNING', requiresAcknowledgement: true, blocking: false },
  PRICING_REFERENCE_MISSING: { severity: 'WARNING', requiresAcknowledgement: true, blocking: false },
  CURRENCY_MISMATCH: { severity: 'WARNING', requiresAcknowledgement: true, blocking: false },
  // The only unsafe one: two configured rules compete for the same position and
  // no acknowledgement can make that deterministic.
  POLICY_AMBIGUOUS: { severity: 'ERROR', requiresAcknowledgement: false, blocking: true },
};
