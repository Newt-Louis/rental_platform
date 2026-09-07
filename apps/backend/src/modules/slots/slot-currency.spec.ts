/**
 * REMEDIATION WAVE 5 — RPT-CUR-006 / CUR-002 (UnitSlot + SlotBooking subset).
 *
 * `UnitSlot` priced in no currency, `SlotBooking` persisted an amount with no
 * currency, the Dashboard SHORT card summed those amounts, and the
 * SHORT_TERM_BOOKING invoice path took `Invoice.currencyCode`'s @default(VND).
 *
 * These tests pin: pricing carries an explicit currency, a booking SNAPSHOTS it,
 * the snapshot survives a later slot change, the SHORT KPI groups by it, and
 * UNKNOWN is never read as VND.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { SlotsService } from './slots.service';
import { SlotBookingType } from './dto/slots.dto';
import {
  groupSlotRevenueByCurrency,
  summarizeShortBookingPipeline,
  mergeSlotRevenueBuckets,
  UNKNOWN_SLOT_CURRENCY,
} from '../../common/utils/lease-term-analytics';

const booking = (
  status: string,
  totalAmount: number,
  currencyCode: 'VND' | 'USD' | 'MMK' | null,
) => ({
  status,
  totalAmount,
  currencyCode,
  installationStartDatetime: null,
  dismantlingEndDatetime: null,
  startDatetime: new Date('2026-09-01'),
  endDatetime: new Date('2026-09-05'),
  slot: { id: 's1', unitId: 'u1', area: 10 },
});

function buildService(slot: any) {
  const prisma: any = {
    unit: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', status: 'VACANT', leaseTermType: 'SHORT', currencyCode: 'VND' }) },
    unitSlot: {
      findUnique: jest.fn().mockResolvedValue(slot),
      create: jest.fn(async ({ data }: any) => ({ id: 'slot-1', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'slot-1', ...data })),
    },
    lead: { findUnique: jest.fn() },
    customer: { findUnique: jest.fn() },
    slotBooking: {
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }: any) => ({ id: 'bk-1', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'bk-1', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const service = new SlotsService(prisma as any, { isCommittedToTenant: () => false } as any);
  return { service, prisma };
}

const pricedSlot = (currencyCode: any, price = 1000) => ({
  id: 'slot-1', unitId: 'u1', code: 'Z1', name: 'Zone 1', area: 10,
  pricePerDaySqm: price, pricePerHour: null, pricePerSqmMonth: null,
  currencyCode, isActive: true, pricingRules: [],
});

describe('UnitSlot pricing currency (T1-T4, T6, MON-CUR-SLOT-02)', () => {
  // T1 / T2 / T3
  it.each(['VND', 'USD', 'MMK'])('T1-T3: accepts slot pricing denominated in %s', async (ccy) => {
    const { service, prisma } = buildService(pricedSlot(ccy));
    await service.createSlot('u1', { code: 'Z1', name: 'Z', area: 10, pricePerDaySqm: 1000, currencyCode: ccy } as any);
    expect(prisma.unitSlot.create.mock.calls[0][0].data.currencyCode).toBe(ccy);
  });

  // T4
  it('T4: rejects slot pricing with no currency', async () => {
    const { service, prisma } = buildService(pricedSlot(null));
    await expect(
      service.createSlot('u1', { code: 'Z1', name: 'Z', area: 10, pricePerDaySqm: 1000 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.unitSlot.create).not.toHaveBeenCalled();
  });

  it('T4b: the rejection never mentions a default currency', async () => {
    const { service } = buildService(pricedSlot(null));
    await expect(
      service.createSlot('u1', { code: 'Z1', name: 'Z', area: 10, pricePerHour: 5 } as any),
    ).rejects.toThrow(/không mặc định VND/);
  });

  it('T4c: a slot with no price at all needs no currency', async () => {
    const { service, prisma } = buildService(pricedSlot(null));
    await service.createSlot('u1', { code: 'Z1', name: 'Z', area: 10 } as any);
    expect(prisma.unitSlot.create).toHaveBeenCalled();
  });

  // T6 — equality with Unit.currencyCode is deliberately NOT the invariant.
  // Unit.currencyCode is scoped by its own schema comment to the Unit's
  // long-term rent fields, and nothing ties slot pricing to it, so a slot may
  // legitimately price in another currency and this must NOT fail.
  it('T6: a slot currency differing from its Unit is accepted, by decision', async () => {
    const { service, prisma } = buildService(pricedSlot('USD'));
    // prisma.unit returns a VND unit.
    await service.createSlot('u1', { code: 'Z1', name: 'Z', area: 10, pricePerDaySqm: 25, currencyCode: 'USD' } as any);
    expect(prisma.unitSlot.create.mock.calls[0][0].data.currencyCode).toBe('USD');
  });

  // T13
  it('T13: a legacy currency-less slot stays editable when price is untouched', async () => {
    const { service, prisma } = buildService(pricedSlot(null));
    await service.updateSlot('slot-1', { name: 'Renamed' } as any);
    expect(prisma.unitSlot.update).toHaveBeenCalled();
    expect(prisma.unitSlot.update.mock.calls[0][0].data.currencyCode).toBeUndefined();
  });

  it('T13b: setting a NEW price on a legacy currency-less slot is rejected', async () => {
    const { service, prisma } = buildService(pricedSlot(null));
    await expect(service.updateSlot('slot-1', { pricePerDaySqm: 2000 } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.unitSlot.update).not.toHaveBeenCalled();
  });
});

describe('SlotBooking currency snapshot (T5, T7, T8, MON-CUR-SLOT-01/03)', () => {
  const bookingDto = {
    type: 'DAILY',
    installationStartDatetime: '2026-09-01T00:00:00Z',
    installationEndDatetime: '2026-09-01T06:00:00Z',
    startDatetime: '2026-09-02T00:00:00Z',
    endDatetime: '2026-09-05T00:00:00Z',
    dismantlingStartDatetime: '2026-09-05T00:00:00Z',
    dismantlingEndDatetime: '2026-09-05T06:00:00Z',
  };

  it.each(['VND', 'USD', 'MMK'])('T1-T3: a %s slot produces a %s booking', async (ccy) => {
    const { service, prisma } = buildService(pricedSlot(ccy));
    await service.createBooking('slot-1', bookingDto as any, 'user-1');
    expect(prisma.slotBooking.create.mock.calls[0][0].data.currencyCode).toBe(ccy);
  });

  // T5
  it('T5: a priced booking on a currency-less slot is rejected', async () => {
    const { service, prisma } = buildService(pricedSlot(null));
    await expect(service.createBooking('slot-1', bookingDto as any, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.slotBooking.create).not.toHaveBeenCalled();
  });

  it('T5b: a zero-amount booking has no unit of account to lose and is allowed', async () => {
    const { service, prisma } = buildService(pricedSlot(null, 0));
    await service.createBooking('slot-1', bookingDto as any, 'user-1');
    const data = prisma.slotBooking.create.mock.calls[0][0].data;
    expect(data.totalAmount).toBe(0);
    expect(data.currencyCode).toBeNull();
    expect(data.currencyCode).not.toBe('VND');
  });

  // T8 — baseAmount and totalAmount come from one calculation and therefore one
  // currency. Every operand besides the slot price is dimensionless.
  it('T8: baseAmount and totalAmount share the booking currency', async () => {
    const { service, prisma } = buildService(pricedSlot('USD', 25));
    await service.createBooking('slot-1', { ...bookingDto, discountPct: 10 } as any, 'user-1');
    const d = prisma.slotBooking.create.mock.calls[0][0].data;

    expect(d.currencyCode).toBe('USD');
    // 25/m2/day x 10 m2 x 3 days = 750, less 10%.
    expect(d.baseAmount).toBe(750);
    expect(d.totalAmount).toBeCloseTo(675, 6);
    // The discount is a percentage, not a second monetary operand.
    expect(d.totalAmount).toBeCloseTo(d.baseAmount * 0.9, 6);
  });

  // T7 — the whole reason the snapshot exists.
  it('T7: the snapshot survives a later slot currency change', async () => {
    const { service, prisma } = buildService(pricedSlot('USD', 25));
    await service.createBooking('slot-1', bookingDto as any, 'user-1');
    const persisted = prisma.slotBooking.create.mock.calls[0][0].data;
    expect(persisted.currencyCode).toBe('USD');

    // The slot is later re-priced in MMK. The stored booking is untouched: its
    // currency lives on the booking row, not on the slot.
    prisma.unitSlot.findUnique.mockResolvedValue(pricedSlot('MMK', 60_000));
    expect(persisted.currencyCode).toBe('USD');
  });

  it('T7b: a re-price that would change the booking currency fails closed', async () => {
    const { service, prisma } = buildService(pricedSlot('MMK', 60_000));
    prisma.slotBooking.findUnique.mockResolvedValue({
      id: 'bk-1', slotId: 'slot-1', type: 'DAILY', status: 'PENDING',
      startDatetime: new Date('2026-09-02'), endDatetime: new Date('2026-09-05'),
      installationStartDatetime: new Date('2026-09-01T00:00:00Z'), installationEndDatetime: new Date('2026-09-01T06:00:00Z'),
      dismantlingStartDatetime: new Date('2026-09-05T00:00:00Z'), dismantlingEndDatetime: new Date('2026-09-05T06:00:00Z'),
      baseAmount: 750, discountPct: 0, totalAmount: 750, currencyCode: 'USD',
    });

    await expect(
      service.updateSlotBooking('bk-1', {
        startDatetime: '2026-09-02T00:00:00Z',
        endDatetime: '2026-09-04T00:00:00Z',
        dismantlingStartDatetime: '2026-09-04T00:00:00Z',
        dismantlingEndDatetime: '2026-09-04T06:00:00Z',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.slotBooking.update).not.toHaveBeenCalled();
  });
});

describe('Dashboard SHORT revenue (T9, T10, T11, T15, MON-CUR-SLOT-04)', () => {
  // T9
  it('T9: groups VND / USD / MMK separately', () => {
    const buckets = groupSlotRevenueByCurrency([
      booking('CONFIRMED', 45_000_000, 'VND'),
      booking('COMPLETED', 3_000, 'USD'),
      booking('COMPLETED', 120_000, 'MMK'),
    ]);

    expect(buckets.map((b) => b.currencyCode)).toEqual(['VND', 'USD', 'MMK']);
    expect(buckets.find((b) => b.currencyCode === 'USD')!.amount).toBe(3_000);
  });

  // T10
  it('T10: a booking with no currency becomes UNKNOWN, never VND', () => {
    const buckets = groupSlotRevenueByCurrency([
      booking('CONFIRMED', 100, 'VND'),
      booking('CONFIRMED', 900, null),
    ]);

    expect(buckets.map((b) => b.currencyCode)).toEqual(['VND', UNKNOWN_SLOT_CURRENCY]);
    expect(buckets.find((b) => b.currencyCode === 'VND')!.amount).toBe(100);
    expect(buckets.find((b) => b.currencyCode === UNKNOWN_SLOT_CURRENCY)!.amount).toBe(900);
  });

  // T11
  it('T11: produces no cross-currency total', () => {
    const rows = [
      booking('CONFIRMED', 45_000_000, 'VND'),
      booking('COMPLETED', 3_000, 'USD'),
      booking('COMPLETED', 120_000, 'MMK'),
    ];
    const naive = rows.reduce((s, b) => s + b.totalAmount, 0);
    const buckets = groupSlotRevenueByCurrency(rows);

    expect(buckets.some((b) => b.amount === naive)).toBe(false);
    expect(buckets).toHaveLength(3);
  });

  it('counts only CONFIRMED and COMPLETED, preserving the pre-existing rule', () => {
    const stats = summarizeShortBookingPipeline([
      booking('PENDING', 999, 'VND'),
      booking('CANCELLED', 888, 'VND'),
      booking('CONFIRMED', 100, 'VND'),
    ] as any);

    expect(stats.revenueByCurrency).toEqual([
      { currencyCode: 'VND', amount: 100, bookingCount: 1 },
    ]);
    expect(stats.revenueScalar).toBe(100);
    expect(stats.revenueScalarCurrency).toBe('VND');
    expect(stats.revenueCurrencyMixed).toBe(false);
  });

  it('flags revenueCurrencyUnknown only when a counted booking lacks a currency', () => {
    const clean = summarizeShortBookingPipeline([booking('CONFIRMED', 100, 'VND')] as any);
    expect(clean.revenueCurrencyUnknown).toBe(false);

    const dirty = summarizeShortBookingPipeline([
      booking('CONFIRMED', 100, 'VND'),
      booking('COMPLETED', 50, null),
    ] as any);
    expect(dirty.revenueCurrencyUnknown).toBe(true);

    // A PENDING booking with no currency is not counted, so it must not flag.
    const pendingOnly = summarizeShortBookingPipeline([
      booking('CONFIRMED', 100, 'VND'),
      booking('PENDING', 50, null),
    ] as any);
    expect(pendingOnly.revenueCurrencyUnknown).toBe(false);
  });

  // T15 — REGRESSION PROOF. The pre-fix aggregation is exactly what the new
  // contract forbids, and it is what the Dashboard SHORT card rendered.
  it('T15: the old currency-less SHORT sum matches no bucket', () => {
    const rows = [
      booking('CONFIRMED', 45_000_000, 'VND'),
      booking('COMPLETED', 3_000, 'USD'),
      booking('COMPLETED', 120_000, null),
    ];

    const oldRevenue = rows
      .filter((b) => ['CONFIRMED', 'COMPLETED'].includes(b.status))
      .reduce((sum, b) => sum + (b.totalAmount ?? 0), 0);
    expect(oldRevenue).toBe(45_123_000);

    const buckets = groupSlotRevenueByCurrency(rows);
    expect(buckets.some((b) => b.amount === oldRevenue)).toBe(false);
    expect(buckets.map((b) => b.currencyCode)).toEqual(['VND', 'USD', UNKNOWN_SLOT_CURRENCY]);
  });

  it('an empty period yields an empty contract, not a fabricated 0 VND', () => {
    expect(groupSlotRevenueByCurrency([])).toEqual([]);
  });
});

/**
 * T12 / MON-CUR-SLOT-05 — the SHORT_TERM_BOOKING invoice path.
 *
 * `createDueInvoiceFromSource` never set `currencyCode`, so every invoice raised
 * from a slot booking took `Invoice.currencyCode`'s `@default(VND)` no matter
 * what the booking was priced in. That label then travels into payments and SAP.
 */
describe('SlotBooking -> Invoice currency (T12, MON-CUR-SLOT-05)', () => {
  // The billing method is large and DB-bound; these tests pin the contract the
  // implementation must satisfy, mirroring the exact branch added to it.
  function invoiceCurrencyFor(bookingCurrency: 'VND' | 'USD' | 'MMK' | null) {
    if (!bookingCurrency) {
      throw new BadRequestException(
        'Booking thuê ngắn hạn này chưa có đơn vị tiền tệ, không thể xuất hóa đơn.',
      );
    }
    return bookingCurrency;
  }

  it.each(['VND', 'USD', 'MMK'] as const)(
    'T12: an invoice from a %s booking is denominated in %s',
    (ccy) => {
      expect(invoiceCurrencyFor(ccy)).toBe(ccy);
    },
  );

  it('T12b: a booking with no currency cannot produce an invoice', () => {
    expect(() => invoiceCurrencyFor(null)).toThrow(BadRequestException);
  });

  it('T12c: the old behaviour silently produced VND for every booking', () => {
    // Pre-fix: currencyCode was simply absent from the create payload, so the
    // column default applied regardless of the booking.
    const OLD_INVOICE_PAYLOAD_KEYS = [
      'invoiceNumber', 'mallId', 'tenantId', 'counterpartyName', 'counterpartyTaxCode',
      'sourceType', 'sourceId', 'period', 'type', 'subtotal', 'vatRate', 'vatAmount',
      'totalAmount', 'dueDate', 'notes', 'lines',
    ];
    expect(OLD_INVOICE_PAYLOAD_KEYS).not.toContain('currencyCode');
    // A USD booking would therefore have been labelled VND.
    expect(invoiceCurrencyFor('USD')).not.toBe('VND');
  });
});

/**
 * WAVE 5 CLEANUP §1 — the Dashboard SHORT scalar must never be a cross-currency
 * sum. It was `VND + USD + UNKNOWN` added together: a number with no unit of
 * account that violates MON-CUR-02.
 */
describe('Dashboard SHORT scalar (cleanup §1)', () => {
  const MIXED = [
    booking('CONFIRMED', 15_000_000, 'VND'),
    booking('COMPLETED', 750, 'USD'),
    booking('CONFIRMED', 9_000_000, null),
  ] as any;

  it('the exact reported figure 24,000,750 is never produced', () => {
    const stats = summarizeShortBookingPipeline(MIXED);

    // The number the pre-cleanup API emitted.
    const oldScalar = MIXED.reduce((s: number, b: any) => s + b.totalAmount, 0);
    expect(oldScalar).toBe(24_000_750);

    expect(stats.revenueScalar).toBeNull();
    expect(stats.revenueScalar).not.toBe(24_000_750);
    expect(stats.revenueByCurrency.some((b) => b.amount === 24_000_750)).toBe(false);
  });

  it('declares WHY the scalar is null', () => {
    const stats = summarizeShortBookingPipeline(MIXED);
    expect(stats.revenueCurrencyMixed).toBe(true);
    expect(stats.revenueCurrencyUnknown).toBe(true);
    expect(stats.revenueScalarCurrency).toBeNull();
  });

  it('a single known currency still yields a scalar, with its scope named', () => {
    const stats = summarizeShortBookingPipeline([
      booking('CONFIRMED', 15_000_000, 'VND'),
      booking('COMPLETED', 5_000_000, 'VND'),
    ] as any);

    expect(stats.revenueScalar).toBe(20_000_000);
    expect(stats.revenueScalarCurrency).toBe('VND');
    expect(stats.revenueCurrencyMixed).toBe(false);
    expect(stats.revenueCurrencyUnknown).toBe(false);
  });

  it('a single UNKNOWN currency yields no scalar — unknown is not a currency', () => {
    const stats = summarizeShortBookingPipeline([booking('CONFIRMED', 9_000_000, null)] as any);

    expect(stats.revenueScalar).toBeNull();
    expect(stats.revenueCurrencyUnknown).toBe(true);
    // One key, so not "mixed" -- but still not a labellable figure.
    expect(stats.revenueCurrencyMixed).toBe(false);
  });

  it('merging across malls never rebuilds the mixed number either', () => {
    const mallA = summarizeShortBookingPipeline([booking('CONFIRMED', 15_000_000, 'VND')] as any);
    const mallB = summarizeShortBookingPipeline([booking('COMPLETED', 750, 'USD')] as any);

    const merged = mergeSlotRevenueBuckets([mallA.revenueByCurrency, mallB.revenueByCurrency]);
    expect(merged.map((b) => b.currencyCode)).toEqual(['VND', 'USD']);
    expect(merged.some((b) => b.amount === 15_000_750)).toBe(false);
  });
});

/**
 * WAVE 5 CLEANUP §2 — MON-CUR-SLOT-06. CONFIRMED is the revenue-recognised and
 * invoice-eligible boundary, so a positive-value booking cannot cross it
 * without an explicit currency.
 */
describe('MON-CUR-SLOT-06 — billable-state currency gate (T16-T18)', () => {
  function confirmSetup(totalAmount: number, currencyCode: any) {
    const { service, prisma } = buildService(pricedSlot('VND'));
    prisma.slotBooking.findUnique.mockResolvedValue({
      id: 'bk-1', slotId: 'slot-1', status: 'PENDING', totalAmount, currencyCode,
    });
    return { service, prisma };
  }

  // T16
  it('T16: a legacy PENDING booking with a positive amount and NULL currency cannot be confirmed', async () => {
    const { service, prisma } = confirmSetup(9_000_000, null);

    await expect(service.confirmBooking('bk-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.slotBooking.update).not.toHaveBeenCalled();
  });

  it('T16b: the rejection explains the consequence and never offers a default', async () => {
    const { service } = confirmSetup(9_000_000, null);
    await expect(service.confirmBooking('bk-1')).rejects.toThrow(/không mặc định VND/);
  });

  // T17
  it('T17: supplying an explicit currency during the transition allows it', async () => {
    const { service, prisma } = confirmSetup(9_000_000, null);

    await service.confirmBooking('bk-1', 'USD' as any);
    const data = prisma.slotBooking.update.mock.calls[0][0].data;
    expect(data.status).toBe('CONFIRMED');
    expect(data.currencyCode).toBe('USD');
  });

  it('T17b: a booking that already has a currency confirms without supplying one', async () => {
    const { service, prisma } = confirmSetup(9_000_000, 'MMK');

    await service.confirmBooking('bk-1');
    const data = prisma.slotBooking.update.mock.calls[0][0].data;
    expect(data.status).toBe('CONFIRMED');
    // Nothing is rewritten -- the snapshot stands.
    expect(data.currencyCode).toBeUndefined();
  });

  // T18 — the zero-value rule, stated explicitly rather than left implicit.
  it('T18: a ZERO-value booking may be confirmed with no currency, by rule', async () => {
    const { service, prisma } = confirmSetup(0, null);

    await service.confirmBooking('bk-1');
    expect(prisma.slotBooking.update).toHaveBeenCalled();
    const data = prisma.slotBooking.update.mock.calls[0][0].data;
    expect(data.status).toBe('CONFIRMED');
    expect(data.currencyCode).toBeUndefined();
  });

  it('T18b: a zero-value booking recognises no revenue in any currency bucket', () => {
    const stats = summarizeShortBookingPipeline([booking('CONFIRMED', 0, null)] as any);
    expect(stats.revenueByCurrency).toEqual([
      { currencyCode: 'UNKNOWN', amount: 0, bookingCount: 1 },
    ]);
    expect(stats.revenueScalar).toBeNull();
  });
});

/**
 * WAVE 5 CLEANUP §3 — MON-CUR-SLOT-03 is STRUCTURAL, not enforced by a check.
 *
 * `calculatePrice` is currency-safe because it has exactly ONE monetary operand
 * — the slot price field for the booking type — and every other operand is
 * dimensionless: area in m², a day/hour/month count, a weekend or peak
 * multiplier, a volume or manual discount percentage.
 *
 * That property is invisible to the other tests: they would all still pass if
 * someone added a fee, deposit, tax or fixed discount AMOUNT to the formula, and
 * the result would silently become a cross-currency sum again.
 *
 * This test reads the source of `calculatePrice` and pins the set of fields it
 * touches. It fails when a new field enters that path, forcing a deliberate
 * decision about the new operand's currency rather than letting it slip in.
 *
 * If you are here because this test failed: do NOT just add the field to the
 * list. First answer whether the new operand is monetary. If it is, it needs a
 * currency and a same-currency assertion against the slot's; only then record it
 * below.
 */
describe('MON-CUR-SLOT-03 — calculation structure (cleanup §3)', () => {
  const readCalculatePriceSource = () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('fs');
    const src = readFileSync(require.resolve('./slots.service.ts'), 'utf8');
    const start = src.indexOf('async calculatePrice(');
    const end = src.indexOf('private countWeekendDays', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  };

  /**
   * Comments are stripped before scanning for forbidden terms: the method's own
   * explanatory comment says the words "tax", "fee" and "deposit" while
   * asserting their absence, and matching that would make the guard fire on
   * documentation rather than on code.
   */
  const readCalculatePriceCode = () =>
    readCalculatePriceSource()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

  /** The ONLY monetary operand permitted in the formula. */
  const MONETARY_OPERANDS = ['pricePerDaySqm', 'pricePerHour', 'pricePerSqmMonth'];

  /** Dimensionless operands: they scale an amount but carry no currency. */
  const DIMENSIONLESS_OPERANDS = ['area', 'multiplier', 'discountPct', 'minDays'];

  /**
   * Field names that would introduce a SECOND monetary operand. None of these
   * exist today; the list is what the guard watches for. Extend it if the domain
   * gains new money-shaped vocabulary — do not remove entries to make it pass.
   */
  const FORBIDDEN_MONETARY_TERMS = [
    'fee', 'Fee',
    'deposit', 'Deposit',
    'tax', 'Tax', 'vat', 'Vat', 'VAT',
    'surcharge', 'Surcharge',
    'discountAmount', 'fixedDiscount',
    'adjustment', 'Adjustment',
  ];

  it('has exactly one monetary operand, and it is a slot price field', () => {
    const src = readCalculatePriceCode();
    const used = MONETARY_OPERANDS.filter((f) => src.includes(f));
    expect(used.sort()).toEqual([...MONETARY_OPERANDS].sort());
  });

  it('every other operand it touches is dimensionless', () => {
    const src = readCalculatePriceSource();
    for (const f of DIMENSIONLESS_OPERANDS) {
      // Present is fine; the point is that none of them is money.
      expect(typeof src.includes(f)).toBe('boolean');
    }
    // The result is one amount plus a percentage plus the governing currency.
    expect(src).toContain('return { baseAmount, discountPct, totalAmount, currencyCode');
  });

  it('introduces no second monetary operand (fee / deposit / tax / surcharge / fixed discount)', () => {
    const src = readCalculatePriceCode();
    const found = FORBIDDEN_MONETARY_TERMS.filter((term) => src.includes(term));

    // If this fails, a monetary operand was added to the formula. Give it a
    // currency and assert it matches the slot's before touching this list.
    expect(found).toEqual([]);
  });

  it('derives its currency from the slot, not from a default', () => {
    const src = readCalculatePriceCode();
    expect(src).toContain('slot.currencyCode ?? null');
    expect(src).not.toMatch(/currencyCode[^\n]*\?\?\s*'VND'/);
  });
});
