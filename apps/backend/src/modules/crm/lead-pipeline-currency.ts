import { CurrencyCode } from '@prisma/client';

/**
 * RPT-CUR-005 / CUR-002 (Lead subset) — CRM pipeline value, per currency.
 *
 * `totalPipelineValue` and `valueByStatus` used to add every Lead's
 * `estimatedValue ?? expectedRent * expectedArea` into one scalar with no unit
 * of account, because `Lead` carried no currency at all. `Lead.currencyCode`
 * now exists, so those figures are GROUPED instead of summed.
 *
 * Two rules this module never breaks:
 *   1. No total spans currencies. There is no FX engine.
 *   2. A NULL `currencyCode` is a legacy row whose unit was never captured. It
 *      becomes an explicit UNKNOWN bucket and is NEVER read as VND.
 */

export const UNKNOWN_LEAD_CURRENCY = 'UNKNOWN' as const;

export type LeadCurrencyKey = CurrencyCode | typeof UNKNOWN_LEAD_CURRENCY;

export interface PipelineCurrencyBucket {
  currencyCode: LeadCurrencyKey;
  amount: number;
  leadCount: number;
}

export interface LeadMonetary {
  estimatedValue?: number | null;
  expectedRent?: number | null;
  expectedArea?: number | null;
  currencyCode?: CurrencyCode | null;
}

const BUCKET_ORDER: LeadCurrencyKey[] = ['VND', 'USD', 'MMK', UNKNOWN_LEAD_CURRENCY];

function rank(key: LeadCurrencyKey): number {
  const i = BUCKET_ORDER.indexOf(key);
  return i === -1 ? 98 : i;
}

/**
 * The existing valuation rule, unchanged: an explicit `estimatedValue` wins,
 * otherwise `expectedRent * expectedArea`. This wave changes the currency
 * handling only — moving the number would silently shift a KPI the business
 * already reads.
 */
export function leadValue(lead: LeadMonetary): number {
  return lead.estimatedValue ?? ((lead.expectedRent ?? 0) * (lead.expectedArea ?? 0));
}

/** NOT `?? 'VND'`. A missing currency is unknown, not Vietnamese dong. */
export function leadCurrencyKey(lead: LeadMonetary): LeadCurrencyKey {
  return lead.currencyCode ?? UNKNOWN_LEAD_CURRENCY;
}

export function groupPipelineValueByCurrency(leads: LeadMonetary[]): PipelineCurrencyBucket[] {
  const byCurrency = new Map<LeadCurrencyKey, { amount: number; leadCount: number }>();

  for (const lead of leads) {
    const key = leadCurrencyKey(lead);
    const acc = byCurrency.get(key) ?? { amount: 0, leadCount: 0 };
    acc.amount += leadValue(lead);
    acc.leadCount += 1;
    byCurrency.set(key, acc);
  }

  return [...byCurrency.entries()]
    .map(([currencyCode, v]) => ({ currencyCode, amount: v.amount, leadCount: v.leadCount }))
    .sort((a, b) => rank(a.currencyCode) - rank(b.currencyCode));
}

/**
 * RPT-CUR-005 — the deal pipeline shows either the Lead's own estimate or, when
 * the Lead has none, the linked Proposal's contract value. The currency must
 * follow whichever amount was actually chosen; it previously emitted a
 * hardcoded 'VND' whenever the Lead supplied the number, asserting a unit the
 * model could not prove.
 *
 * Returns `null` when the chosen amount has no provable currency. A caller must
 * render that as unknown — never substitute VND.
 */
export function resolveDealCurrency(
  lead: { estimatedValue?: number | null; currencyCode?: CurrencyCode | null },
  proposal?: { rentCurrency: CurrencyCode } | null,
): CurrencyCode | null {
  if (lead.estimatedValue != null) return lead.currencyCode ?? null;
  return proposal ? proposal.rentCurrency : null;
}

/**
 * Per-status, per-currency. Returned as a map of status to buckets so the shape
 * mirrors the legacy `valueByStatus` a consumer already knows, without ever
 * producing a cross-currency number inside it.
 */
export function groupValueByStatusAndCurrency<T extends LeadMonetary & { status: string }>(
  leads: T[],
): Record<string, PipelineCurrencyBucket[]> {
  const byStatus = new Map<string, T[]>();
  for (const lead of leads) {
    const list = byStatus.get(lead.status) ?? [];
    list.push(lead);
    byStatus.set(lead.status, list);
  }

  const out: Record<string, PipelineCurrencyBucket[]> = {};
  for (const [status, list] of byStatus) {
    out[status] = groupPipelineValueByCurrency(list);
  }
  return out;
}
