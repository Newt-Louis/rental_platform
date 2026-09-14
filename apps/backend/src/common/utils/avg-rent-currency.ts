import { CurrencyCode } from '@prisma/client';

/**
 * RPT-CUR-002 — average rent per m², computed within a unit of account.
 *
 * Averaging `Unit.baseRentPerSqm` across VND, USD and MMK units produces a
 * number in no currency at all. Dividing by a unit count removes the currency no
 * more than dividing by m² does: on the reference dataset the old scalar read
 * **613,172**, which is neither the VND average (912,500), the USD one (30), nor
 * the MMK one (29,000). It was a KPI with no unit.
 *
 * Wave 9 added the per-currency buckets but kept emitting that scalar, which
 * only put a correct number next to a wrong one. This closure removes the unsafe
 * scalar semantics:
 *
 *   `avgRentPerSqm` is non-null **only** when exactly one KNOWN currency
 *   contributes, and it then carries `avgRentPerSqmCurrency`. Otherwise it is
 *   null and the reason is stated.
 *
 * The single currency is never *chosen* — not the first, not the most common,
 * not the mall default, and never VND. One contributing currency, or nothing.
 */

export const UNKNOWN_RENT_CURRENCY = 'UNKNOWN' as const;
export type RentCurrencyKey = CurrencyCode | typeof UNKNOWN_RENT_CURRENCY;

export interface AvgRentCurrencyBucket {
  currencyCode: RentCurrencyKey;
  avgRentPerSqm: number;
  occupiedUnits: number;
}

export interface AvgRentContract {
  /** Authoritative. One entry per contributing currency; never combined. */
  avgRentPerSqmByCurrency: AvgRentCurrencyBucket[];
  /** Non-null only when exactly one KNOWN currency contributes. */
  avgRentPerSqm: number | null;
  /** Names the currency of the scalar above, or null when there is no scalar. */
  avgRentPerSqmCurrency: CurrencyCode | null;
  /** More than one currency contributed, so no single figure can exist. */
  avgRentPerSqmCurrencyMixed: boolean;
  /** At least one contributing unit had no currency at all. */
  avgRentPerSqmCurrencyUnknown: boolean;
}

export interface RentBearingUnit {
  baseRentPerSqm?: number | null;
  currencyCode?: CurrencyCode | null;
}

const RENT_CURRENCY_ORDER: RentCurrencyKey[] = ['VND', 'USD', 'MMK', UNKNOWN_RENT_CURRENCY];

function rank(key: RentCurrencyKey): number {
  const i = RENT_CURRENCY_ORDER.indexOf(key);
  return i === -1 ? 98 : i;
}

/**
 * NOT `?? 'VND'`. A unit with no currency is UNKNOWN and gets its own bucket, so
 * it can never be folded into a known one.
 *
 * `Unit.currencyCode` is NOT NULL in the schema, so UNKNOWN is currently
 * unreachable from the database. The branch exists because this function is also
 * fed from selects and DTOs where the field can be absent, and because a
 * silently-defaulted unknown is exactly the failure this metric is being fixed
 * for. It is proven at the function level rather than manufactured in the DB.
 */
export function avgRentByCurrency(units: RentBearingUnit[]): AvgRentContract {
  const byCurrency = new Map<RentCurrencyKey, { rentSum: number; count: number }>();

  for (const unit of units) {
    const key: RentCurrencyKey = unit.currencyCode ?? UNKNOWN_RENT_CURRENCY;
    const acc = byCurrency.get(key) ?? { rentSum: 0, count: 0 };
    acc.rentSum += unit.baseRentPerSqm ?? 0;
    acc.count += 1;
    byCurrency.set(key, acc);
  }

  const buckets: AvgRentCurrencyBucket[] = [...byCurrency.entries()]
    .map(([currencyCode, v]) => ({
      currencyCode,
      avgRentPerSqm: v.count > 0 ? Math.round(v.rentSum / v.count) : 0,
      occupiedUnits: v.count,
    }))
    .sort((a, b) => rank(a.currencyCode) - rank(b.currencyCode));

  const unknown = buckets.some((b) => b.currencyCode === UNKNOWN_RENT_CURRENCY);
  const mixed = buckets.length > 1;
  // Exactly one bucket AND that bucket is a real currency. Anything else has no
  // single unit of account, so there is no scalar to emit.
  const single = buckets.length === 1 && !unknown ? buckets[0] : null;

  return {
    avgRentPerSqmByCurrency: buckets,
    avgRentPerSqm: single ? single.avgRentPerSqm : null,
    avgRentPerSqmCurrency: single ? (single.currencyCode as CurrencyCode) : null,
    avgRentPerSqmCurrencyMixed: mixed,
    avgRentPerSqmCurrencyUnknown: unknown,
  };
}
