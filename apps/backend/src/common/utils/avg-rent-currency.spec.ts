/**
 * WAVE 9 CLOSURE — RPT-CUR-002.
 *
 * The first pass added per-currency buckets but kept emitting the cross-currency
 * scalar as a KPI. On real data that scalar read **613,172** while the actual
 * averages were VND 912,500, USD 30 and MMK 29,000 — a number matching none of
 * them and belonging to no currency. Putting a correct figure beside a wrong one
 * does not remove the wrong one.
 *
 * The scalar now exists only when exactly ONE KNOWN currency contributes.
 */
import { avgRentByCurrency, UNKNOWN_RENT_CURRENCY } from './avg-rent-currency';

const unit = (currencyCode: any, baseRentPerSqm: number) => ({ currencyCode, baseRentPerSqm });

describe('avgRentByCurrency — single-currency cases (T1-T3)', () => {
  it.each([
    ['VND', 912_500],
    ['USD', 30],
    ['MMK', 29_000],
  ])('T1-T3: %s-only yields a scalar that names its currency', (ccy, avg) => {
    const c = avgRentByCurrency([unit(ccy, avg), unit(ccy, avg)]);

    expect(c.avgRentPerSqm).toBe(avg);
    expect(c.avgRentPerSqmCurrency).toBe(ccy);
    expect(c.avgRentPerSqmCurrencyMixed).toBe(false);
    expect(c.avgRentPerSqmCurrencyUnknown).toBe(false);
    expect(c.avgRentPerSqmByCurrency).toEqual([
      { currencyCode: ccy, avgRentPerSqm: avg, occupiedUnits: 2 },
    ]);
  });

  it('averages within the currency, not across the group', () => {
    const c = avgRentByCurrency([unit('VND', 800_000), unit('VND', 1_000_000)]);
    expect(c.avgRentPerSqm).toBe(900_000);
  });
});

describe('avgRentByCurrency — mixed cases (T4, T5, T9)', () => {
  it('T4: VND + USD emits no scalar', () => {
    const c = avgRentByCurrency([unit('VND', 912_500), unit('USD', 30)]);

    expect(c.avgRentPerSqm).toBeNull();
    expect(c.avgRentPerSqmCurrency).toBeNull();
    expect(c.avgRentPerSqmCurrencyMixed).toBe(true);
    expect(c.avgRentPerSqmByCurrency).toHaveLength(2);
  });

  // T5 + T9 — the exact figures from the runtime report that exposed the gap.
  it('T5/T9: VND 912,500 + USD 30 + MMK 29,000 never emits 613,172', () => {
    const c = avgRentByCurrency([
      unit('VND', 900_000), unit('VND', 900_000), unit('VND', 950_000), unit('VND', 900_000),
      unit('USD', 30),
      unit('MMK', 29_000),
    ]);

    // The pre-fix scalar, reconstructed.
    const old = Math.round((900_000 + 900_000 + 950_000 + 900_000 + 30 + 29_000) / 6);
    expect(old).toBe(613_172);

    expect(c.avgRentPerSqm).not.toBe(613_172);
    expect(c.avgRentPerSqm).toBeNull();
    expect(c.avgRentPerSqmCurrency).toBeNull();
    expect(c.avgRentPerSqmCurrencyMixed).toBe(true);

    expect(c.avgRentPerSqmByCurrency).toEqual([
      { currencyCode: 'VND', avgRentPerSqm: 912_500, occupiedUnits: 4 },
      { currencyCode: 'USD', avgRentPerSqm: 30, occupiedUnits: 1 },
      { currencyCode: 'MMK', avgRentPerSqm: 29_000, occupiedUnits: 1 },
    ]);
    // No bucket is the mixed number either.
    expect(c.avgRentPerSqmByCurrency.some((b) => b.avgRentPerSqm === 613_172)).toBe(false);
  });
});

describe('avgRentByCurrency — unknown currency (T6, T7, T10)', () => {
  // Unit.currencyCode is NOT NULL in the schema, so UNKNOWN is unreachable from
  // the database today. The rule is proven at the function level rather than
  // manufactured in the DB, because this contract is also fed from selects and
  // DTOs where the field can be absent.
  it('T6: UNKNOWN-only emits no scalar and is never called VND', () => {
    const c = avgRentByCurrency([unit(null, 500_000), unit(undefined, 700_000)]);

    expect(c.avgRentPerSqm).toBeNull();
    expect(c.avgRentPerSqmCurrency).toBeNull();
    expect(c.avgRentPerSqmCurrencyUnknown).toBe(true);
    // One bucket, so not "mixed" -- but still not a labellable figure.
    expect(c.avgRentPerSqmCurrencyMixed).toBe(false);
    expect(c.avgRentPerSqmByCurrency).toEqual([
      { currencyCode: UNKNOWN_RENT_CURRENCY, avgRentPerSqm: 600_000, occupiedUnits: 2 },
    ]);
  });

  it('T7: known + UNKNOWN emits no scalar, and the unknown is not folded in', () => {
    const c = avgRentByCurrency([unit('VND', 900_000), unit(null, 500_000)]);

    expect(c.avgRentPerSqm).toBeNull();
    expect(c.avgRentPerSqmCurrencyUnknown).toBe(true);
    expect(c.avgRentPerSqmCurrencyMixed).toBe(true);

    const vnd = c.avgRentPerSqmByCurrency.find((b) => b.currencyCode === 'VND');
    expect(vnd).toEqual({ currencyCode: 'VND', avgRentPerSqm: 900_000, occupiedUnits: 1 });
    // The 500,000 stayed out of the VND bucket entirely.
    expect(vnd!.occupiedUnits).toBe(1);
  });

  it('T10: an unknown currency is never silently resolved to VND', () => {
    const c = avgRentByCurrency([unit(null, 500_000)]);
    expect(c.avgRentPerSqmCurrency).not.toBe('VND');
    expect(c.avgRentPerSqmByCurrency[0].currencyCode).not.toBe('VND');
  });

  it('an empty group is an empty contract, not a fabricated zero', () => {
    const c = avgRentByCurrency([]);
    expect(c.avgRentPerSqmByCurrency).toEqual([]);
    expect(c.avgRentPerSqm).toBeNull();
    expect(c.avgRentPerSqmCurrencyMixed).toBe(false);
  });

  it('buckets are ordered stably with UNKNOWN last', () => {
    const c = avgRentByCurrency([unit(null, 1), unit('MMK', 1), unit('USD', 1), unit('VND', 1)]);
    expect(c.avgRentPerSqmByCurrency.map((b) => b.currencyCode))
      .toEqual(['VND', 'USD', 'MMK', UNKNOWN_RENT_CURRENCY]);
  });

  it('the scalar is never chosen from the first, most common, or default currency', () => {
    // Four VND units and one USD unit: VND is both first and most common, and is
    // the platform default. There is still no scalar.
    const c = avgRentByCurrency([
      unit('VND', 1), unit('VND', 1), unit('VND', 1), unit('VND', 1), unit('USD', 1),
    ]);
    expect(c.avgRentPerSqm).toBeNull();
    expect(c.avgRentPerSqmCurrency).toBeNull();
  });
});
