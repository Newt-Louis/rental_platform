/**
 * Canonical monthly-period boundaries.
 *
 * A `period` is the `YYYY-MM` string used by `BillingScheduleEntry.period`,
 * `Invoice.period` and `SalesTurnover.period`.
 *
 * Boundaries are UTC and DATE-GRAINED: `periodEnd` is the last calendar day of
 * the month at 00:00 UTC, not 23:59:59. That matches how `Contract.startDate`
 * and `Contract.endDate` are persisted (midnight UTC, date-only semantics), so
 * a contract ending on the last day of a month correctly counts as covering
 * that whole month. Using an end-of-day boundary here would wrongly exclude it.
 *
 * This implementation was previously `billing-addin.util.ts#periodBounds`; it
 * was lifted here so turnover resolution and billing cannot drift onto
 * different definitions of "the period". `billing-addin.util` re-exports it.
 */

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type PeriodBounds = { periodStart: Date; periodEnd: Date };

export function isValidPeriod(period: string): boolean {
  return PERIOD_PATTERN.test(period);
}

export function periodBounds(period: string): PeriodBounds {
  const [year, month] = period.split('-').map(Number);
  return {
    periodStart: new Date(Date.UTC(year, month - 1, 1)),
    // Day 0 of the following month = last day of this one.
    periodEnd: new Date(Date.UTC(year, month, 0)),
  };
}
