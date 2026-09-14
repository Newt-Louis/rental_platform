// RPT-CUR-005 / CUR-002 (Lead subset) — presentation of Lead monetary values.
//
// `Lead.expectedRent` and `Lead.estimatedValue` used to be rendered with a
// hardcoded 'VND' even though the model could not prove that. `Lead.currencyCode`
// now exists, so the currency always comes from the data.
//
// A NULL currency is a legacy row recorded before the field existed. It is shown
// as unknown — never as VND, and never silently dropped from a list.
import { formatMoney, formatMoneyCompact, type CurrencyCode } from '@/lib/currency';

export const UNKNOWN_LEAD_CURRENCY = 'UNKNOWN' as const;
export type LeadCurrencyKey = CurrencyCode | typeof UNKNOWN_LEAD_CURRENCY;

export interface LeadMonetary {
  estimatedValue?: number | null;
  expectedRent?: number | null;
  expectedArea?: number | null;
  currencyCode?: CurrencyCode | null;
}

export interface LeadCurrencyBucket {
  currencyCode: LeadCurrencyKey;
  amount: number;
  leadCount: number;
}

const BUCKET_ORDER: LeadCurrencyKey[] = ['VND', 'USD', 'MMK', UNKNOWN_LEAD_CURRENCY];

const rank = (key: LeadCurrencyKey) => {
  const i = BUCKET_ORDER.indexOf(key);
  return i === -1 ? 98 : i;
};

/** Mirrors the backend valuation rule exactly — keep the two in sync. */
export function leadValue(lead: LeadMonetary): number {
  return lead.estimatedValue ?? ((lead.expectedRent ?? 0) * (lead.expectedArea ?? 0));
}

/** NOT `?? 'VND'`. */
export function leadCurrencyKey(lead: LeadMonetary): LeadCurrencyKey {
  return lead.currencyCode ?? UNKNOWN_LEAD_CURRENCY;
}

export function groupLeadValueByCurrency(leads: LeadMonetary[]): LeadCurrencyBucket[] {
  const map = new Map<LeadCurrencyKey, { amount: number; leadCount: number }>();
  for (const lead of leads) {
    const key = leadCurrencyKey(lead);
    const acc = map.get(key) ?? { amount: 0, leadCount: 0 };
    acc.amount += leadValue(lead);
    acc.leadCount += 1;
    map.set(key, acc);
  }
  return [...map.entries()]
    .map(([currencyCode, v]) => ({ currencyCode, ...v }))
    .sort((a, b) => rank(a.currencyCode) - rank(b.currencyCode));
}

/**
 * Full-precision money for a Lead figure. When the currency is unknown the
 * amount is still shown — hiding it would lose information — but it is labelled
 * as having no unit of account rather than being given one.
 */
export function formatLeadMoney(
  amount: number | null | undefined,
  currencyCode: CurrencyCode | null | undefined,
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  if (!currencyCode) return `${amount.toLocaleString('vi-VN')} (chưa rõ ĐVT)`;
  return formatMoney(amount, currencyCode);
}

/** Compact variant for dense surfaces (kanban cards). Same unknown handling. */
export function formatLeadMoneyCompact(
  amount: number | null | undefined,
  currencyCode: CurrencyCode | null | undefined,
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  if (!currencyCode) {
    const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
    return `${compact} (chưa rõ ĐVT)`;
  }
  return formatMoneyCompact(amount, currencyCode);
}

export function formatLeadBucket(bucket: LeadCurrencyBucket): string {
  return bucket.currencyCode === UNKNOWN_LEAD_CURRENCY
    ? `${bucket.amount.toLocaleString('vi-VN')} (chưa rõ ĐVT)`
    : formatMoney(bucket.amount, bucket.currencyCode);
}
