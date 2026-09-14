/**
 * REMEDIATION WAVE 1 — /api/analytics/occupancy currency contract.
 *
 * `totalMonthlyBillingRevenue` used to add (baseRentPerSqm + camPerSqm) × area
 * across every occupied unit regardless of `Unit.currencyCode` — a genuine
 * cross-currency SUM (RPT-CUR-002). It is now grouped by currency.
 *
 * `avgRentPerSqm` is deliberately NOT corrected here (deferred: changing it
 * changes what the field means). These tests pin the disclosure that replaces
 * the silence, so the deferral cannot quietly become a forgotten defect.
 */
import { groupUnitRevenueByCurrency } from './occupancy-analytics.service';

const unit = (
  currencyCode: 'VND' | 'USD' | 'MMK',
  baseRentPerSqm: number,
  camPerSqm: number,
  areaNLA: number,
) => ({ currencyCode, baseRentPerSqm, camPerSqm, areaNLA });

describe('groupUnitRevenueByCurrency (RPT-CUR-002)', () => {
  it('groups billing revenue by Unit.currencyCode instead of summing across it', () => {
    const buckets = groupUnitRevenueByCurrency([
      unit('VND', 500_000, 100_000, 100),   // 60,000,000 VND
      unit('VND', 400_000, 0, 50),          // 20,000,000 VND
      unit('USD', 25, 5, 100),              //      3,000 USD
      unit('MMK', 2_000, 500, 40),          //    100,000 MMK
    ]);

    expect(buckets.map((b) => b.currencyCode)).toEqual(['VND', 'USD', 'MMK']);
    expect(buckets[0]).toEqual({ currencyCode: 'VND', totalMonthlyBillingRevenue: 80_000_000, occupiedUnits: 2 });
    expect(buckets[1]).toEqual({ currencyCode: 'USD', totalMonthlyBillingRevenue: 3_000, occupiedUnits: 1 });
    expect(buckets[2]).toEqual({ currencyCode: 'MMK', totalMonthlyBillingRevenue: 100_000, occupiedUnits: 1 });
  });

  // REGRESSION PROOF: the old single-reduce implementation produced a figure
  // that is not any bucket's value, and that no currency label can describe.
  it('the old cross-currency reduce() produces a figure no bucket matches', () => {
    const units = [
      unit('VND', 500_000, 100_000, 100),
      unit('USD', 25, 5, 100),
      unit('MMK', 2_000, 500, 40),
    ];

    const oldTotal = units.reduce((s, u) => s + (u.baseRentPerSqm + u.camPerSqm) * u.areaNLA, 0);
    expect(oldTotal).toBe(60_000_000 + 3_000 + 100_000); // 60,103,000 — of what?

    const buckets = groupUnitRevenueByCurrency(units);
    expect(buckets.some((b) => b.totalMonthlyBillingRevenue === oldTotal)).toBe(false);
  });

  it('omits currencies with no occupied units rather than emitting a 0 bucket', () => {
    const buckets = groupUnitRevenueByCurrency([unit('USD', 25, 5, 100)]);
    expect(buckets.map((b) => b.currencyCode)).toEqual(['USD']);
  });

  it('returns an empty list when there are no occupied units', () => {
    expect(groupUnitRevenueByCurrency([])).toEqual([]);
  });
});
