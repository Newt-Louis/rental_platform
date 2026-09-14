// RPT-CUR-002 — rendering an average rent per m² that may span currencies.
//
// The backend emits `avgRentPerSqm` only when exactly one KNOWN currency
// contributes; otherwise it is null and `avgRentPerSqmByCurrency` is
// authoritative. This renders that contract without ever inventing a unit.
//
// It replaces `formatVndRate`, which appended "VND/m²" to whatever number it was
// given -- so a mixed-currency average was displayed as dong.
import { formatMoney, type CurrencyCode } from '@/lib/currency';

export const UNKNOWN_RENT_CURRENCY = 'UNKNOWN' as const;
export type RentCurrencyKey = CurrencyCode | typeof UNKNOWN_RENT_CURRENCY;

export interface AvgRentCurrencyBucket {
  currencyCode: RentCurrencyKey;
  avgRentPerSqm: number;
  occupiedUnits: number;
}

export interface AvgRentContract {
  avgRentPerSqmByCurrency?: AvgRentCurrencyBucket[] | null;
  avgRentPerSqm?: number | null;
  avgRentPerSqmCurrency?: CurrencyCode | null;
  avgRentPerSqmCurrencyMixed?: boolean;
  avgRentPerSqmCurrencyUnknown?: boolean;
}

/** One bucket as "912.500 ₫/m²", or an explicit unknown. */
export function formatRateBucket(bucket: AvgRentCurrencyBucket): string {
  if (bucket.currencyCode === UNKNOWN_RENT_CURRENCY) {
    return `${Math.round(bucket.avgRentPerSqm).toLocaleString('vi-VN')}/m² (chưa rõ ĐVT)`;
  }
  return `${formatMoney(bucket.avgRentPerSqm, bucket.currencyCode)}/m²`;
}

/**
 * The full metric. A single known currency renders as one labelled figure; more
 * than one renders as separate figures; an unknown renders as unknown. There is
 * no branch that produces a bare number.
 */
export function formatAvgRent(contract: AvgRentContract | null | undefined): string {
  const buckets = contract?.avgRentPerSqmByCurrency ?? [];
  if (buckets.length === 0) return '—';
  return buckets.map(formatRateBucket).join('  ·  ');
}
