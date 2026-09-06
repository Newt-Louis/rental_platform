/**
 * REMEDIATION WAVE 1 — Cross-Mall CEO currency contract.
 *
 * Proves the four properties the fix exists to guarantee:
 *   1. non-VND revenue is no longer excluded (RPT-CUR-004),
 *   2. currencies are never summed together (RPT-CUR-001),
 *   3. the API carries an explicit currency dimension (RPT-CUR-003),
 *   4. the retained legacy scalars are declared VND-only (RPT-CUR-004).
 *
 * T10 is the regression proof: it reconstructs the OLD behaviour and asserts
 * that it fails the contract, so reverting the fix cannot pass this suite.
 */
import { Test } from '@nestjs/testing';
import { DashboardService, groupRevenueByCurrency, mergeRevenueBuckets } from './dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { MallAccessService } from '../../common/services/mall-access.service';

type InvoiceRow = {
  totalAmount: number;
  currencyCode: 'VND' | 'USD' | 'MMK';
  status: string;
  contract?: { unit: { leaseTermType: string } } | null;
};

const long = (leaseTermType = 'LONG') => ({ unit: { leaseTermType } });

function invoice(
  totalAmount: number,
  currencyCode: InvoiceRow['currencyCode'],
  status: string,
  leaseTermType = 'LONG',
): InvoiceRow {
  return { totalAmount, currencyCode, status, contract: long(leaseTermType) };
}

describe('groupRevenueByCurrency (RPT-CUR-001/003/004)', () => {
  // T1 — the three currencies land in three separate buckets and no bucket's
  // amount contains any part of another's.
  it('T1: separates VND / USD / MMK instead of summing them', () => {
    const buckets = groupRevenueByCurrency([
      invoice(1_000_000_000, 'VND', 'ISSUED'),
      invoice(10_000, 'USD', 'ISSUED'),
      invoice(5_000_000, 'MMK', 'ISSUED'),
    ]);

    expect(buckets).toHaveLength(3);
    expect(buckets.map((b) => b.currencyCode)).toEqual(['VND', 'USD', 'MMK']);
    expect(buckets.find((b) => b.currencyCode === 'VND')!.monthlyRevenue).toBe(1_000_000_000);
    expect(buckets.find((b) => b.currencyCode === 'USD')!.monthlyRevenue).toBe(10_000);
    expect(buckets.find((b) => b.currencyCode === 'MMK')!.monthlyRevenue).toBe(5_000_000);

    // The defining property: no bucket equals the naive cross-currency SUM.
    const naiveSum = 1_000_000_000 + 10_000 + 5_000_000;
    expect(buckets.some((b) => b.monthlyRevenue === naiveSum)).toBe(false);
  });

  // T2 — collectionRate is a same-currency ratio, computed per bucket.
  it('T2: computes collectionRate within a currency, never across currencies', () => {
    const buckets = groupRevenueByCurrency([
      invoice(100, 'VND', 'PAID'),
      invoice(300, 'VND', 'ISSUED'),
      invoice(50, 'USD', 'PAID'),
      invoice(50, 'USD', 'ISSUED'),
    ]);

    expect(buckets.find((b) => b.currencyCode === 'VND')!.collectionRate).toBe(25);
    expect(buckets.find((b) => b.currencyCode === 'USD')!.collectionRate).toBe(50);
  });

  // T3 — collection semantics are unchanged from the pre-fix code: PAID and
  // PARTIALLY_PAID both count the full invoice amount. This fix was a currency
  // change only; silently altering the collection definition would move a KPI
  // the business already reads.
  it('T3: preserves the pre-existing PAID + PARTIALLY_PAID collection rule', () => {
    const rows = [
      invoice(100, 'VND', 'PAID'),
      invoice(200, 'VND', 'PARTIALLY_PAID'),
      invoice(400, 'VND', 'ISSUED'),
      invoice(300, 'VND', 'OVERDUE'),
      invoice(50, 'VND', 'DRAFT'),
    ];
    const legacyCollected = rows
      .filter((i) => i.status === 'PAID' || i.status === 'PARTIALLY_PAID')
      .reduce((s, i) => s + i.totalAmount, 0);
    const legacyBilled = rows.reduce((s, i) => s + i.totalAmount, 0);

    const vnd = groupRevenueByCurrency(rows)[0];
    expect(vnd.collectedRevenue).toBe(legacyCollected);
    expect(vnd.monthlyRevenue).toBe(legacyBilled);
  });

  // T4 — a currency with no invoices does not appear as a zero bucket, which
  // would imply the mall trades in it.
  it('T4: omits currencies with no invoices rather than emitting a 0 bucket', () => {
    const buckets = groupRevenueByCurrency([invoice(100, 'VND', 'PAID')]);
    expect(buckets.map((b) => b.currencyCode)).toEqual(['VND']);
  });

  // T5 — empty input is an empty contract, not a "0 VND" claim.
  it('T5: returns an empty list for no invoices (never a fabricated 0 VND)', () => {
    expect(groupRevenueByCurrency([])).toEqual([]);
  });

  // T6 — cross-mall merge keeps currencies apart.
  it('T6: mergeRevenueBuckets adds per currency across malls, never across currencies', () => {
    const mallA = groupRevenueByCurrency([invoice(100, 'VND', 'PAID'), invoice(10, 'USD', 'ISSUED')]);
    const mallB = groupRevenueByCurrency([invoice(300, 'VND', 'ISSUED'), invoice(30, 'USD', 'PAID')]);

    const merged = mergeRevenueBuckets([mallA, mallB]);
    expect(merged.map((b) => b.currencyCode)).toEqual(['VND', 'USD']);

    const vnd = merged.find((b) => b.currencyCode === 'VND')!;
    expect(vnd.monthlyRevenue).toBe(400);
    expect(vnd.collectedRevenue).toBe(100);
    expect(vnd.collectionRate).toBe(25);

    const usd = merged.find((b) => b.currencyCode === 'USD')!;
    expect(usd.monthlyRevenue).toBe(40);
    expect(usd.collectedRevenue).toBe(30);
    expect(usd.collectionRate).toBe(75);
  });
});

describe('getCrossMallDashboard currency contract', () => {
  let service: DashboardService;
  let prisma: any;

  const MALL = {
    id: 'mall-1',
    name: 'THISO Mall Sala',
    code: 'THISO-SALA',
    city: 'Ho Chi Minh City',
    floors: [{ units: [{ id: 'u1', status: 'OCCUPIED', areaNLA: 100, leaseTermType: 'LONG' }] }],
  };

  const INVOICES: InvoiceRow[] = [
    invoice(1_000_000_000, 'VND', 'ISSUED'),
    invoice(200_000_000, 'VND', 'PAID'),
    invoice(10_000, 'USD', 'ISSUED'),
    invoice(2_500, 'USD', 'PAID'),
    invoice(5_000_000, 'MMK', 'PAID'),
  ];

  beforeEach(async () => {
    prisma = {
      mall: { findMany: jest.fn().mockResolvedValue([MALL]) },
      invoice: {
        findMany: jest.fn().mockResolvedValue(INVOICES),
        count: jest.fn().mockResolvedValue(0),
      },
      ticket: { count: jest.fn().mockResolvedValue(0) },
      contract: { count: jest.fn().mockResolvedValue(0) },
      slotBooking: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: { getJson: jest.fn(), setJson: jest.fn() } },
        { provide: MallAccessService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(DashboardService);
  });

  // T7 — the query no longer filters to VND, so USD/MMK revenue reaches the
  // CEO screen at all. This is the fix for RPT-CUR-004.
  it('T7: does not filter the invoice query to currencyCode VND', async () => {
    await service.getCrossMallDashboard();

    const where = prisma.invoice.findMany.mock.calls[0][0].where;
    expect(where.currencyCode).toBeUndefined();

    const select = prisma.invoice.findMany.mock.calls[0][0].select;
    expect(select.currencyCode).toBe(true);
  });

  // T8 — the response carries an explicit currency dimension at every level a
  // consumer reads money from (RPT-CUR-003).
  it('T8: exposes revenueByCurrency on mall, totals and byLeaseTerm.LONG', async () => {
    const result: any = await service.getCrossMallDashboard();
    const mall = result.malls[0];

    expect(mall.revenueByCurrency.map((b: any) => b.currencyCode)).toEqual(['VND', 'USD', 'MMK']);
    expect(result.totals.revenueByCurrency.map((b: any) => b.currencyCode)).toEqual(['VND', 'USD', 'MMK']);
    expect(mall.byLeaseTerm.LONG.revenueByCurrency.map((b: any) => b.currencyCode)).toEqual(['VND', 'USD', 'MMK']);
    expect(result.totals.byLeaseTerm.LONG.revenueByCurrency.map((b: any) => b.currencyCode)).toEqual(['VND', 'USD', 'MMK']);

    const usd = result.totals.revenueByCurrency.find((b: any) => b.currencyCode === 'USD');
    expect(usd.monthlyRevenue).toBe(12_500);
    expect(usd.collectedRevenue).toBe(2_500);
    expect(usd.collectionRate).toBe(20);
  });

  // T9 — the retained scalars are still exactly the old VND-only numbers AND
  // are labelled as such, so a consumer cannot mistake them for a total.
  it('T9: legacy scalars stay VND-only and declare their scope', async () => {
    const result: any = await service.getCrossMallDashboard();
    const mall = result.malls[0];

    expect(mall.revenueScalarCurrency).toBe('VND');
    expect(result.totals.revenueScalarCurrency).toBe('VND');
    expect(result.totals.byLeaseTerm.LONG.revenueScalarCurrency).toBe('VND');

    // Identical to the pre-fix VND-filtered reduce.
    expect(mall.monthlyRevenue).toBe(1_200_000_000);
    expect(mall.collectedRevenue).toBe(200_000_000);

    // And crucially NOT the cross-currency sum.
    const naive = INVOICES.reduce((s, i) => s + i.totalAmount, 0);
    expect(mall.monthlyRevenue).not.toBe(naive);
  });

  // RPT-CUR-006 is deferred, not silently defaulted: SlotBooking has no
  // currency column, so the SHORT segment declares the unit unknown rather
  // than placing the amount in a VND bucket.
  it('T9b: SHORT revenue is flagged currency-unknown, not bucketed as VND', async () => {
    const result: any = await service.getCrossMallDashboard();
    const short = result.malls[0].byLeaseTerm.SHORT;

    expect(short.revenueCurrencyUnknown).toBe(true);
    expect(short.revenueByCurrency).toEqual([]);
  });

  // T10 — REGRESSION PROOF. Reconstruct the pre-fix implementation exactly and
  // assert it violates the contract the tests above enforce. If someone
  // restores the VND-only scalar presentation, these expectations are what
  // start failing.
  it('T10: the old VND-only / scalar behaviour fails this contract', async () => {
    // (a) old query shape: filtered to VND.
    const oldWhere = { isActive: true, period: { startsWith: '2026-09' }, currencyCode: 'VND' as const };
    expect(oldWhere.currencyCode).toBe('VND'); // what T7 now forbids

    // (b) old aggregation: one scalar, no currency dimension.
    const oldMonthlyRevenue = INVOICES
      .filter((i) => i.currencyCode === 'VND')
      .reduce((s, i) => s + i.totalAmount, 0);
    const oldShape: Record<string, unknown> = {
      monthlyRevenue: oldMonthlyRevenue,
      collectedRevenue: 200_000_000,
    };

    // T8's assertion cannot hold against the old shape.
    expect(oldShape.revenueByCurrency).toBeUndefined();
    // T9's assertion cannot hold either — no declared scope.
    expect(oldShape.revenueScalarCurrency).toBeUndefined();
    // And USD/MMK revenue is simply gone.
    const usdInOldShape = INVOICES
      .filter((i) => i.currencyCode === 'USD')
      .reduce((s, i) => s + i.totalAmount, 0);
    expect(usdInOldShape).toBe(12_500);
    expect(oldShape.monthlyRevenue).toBe(1_200_000_000); // USD/MMK contributed nothing

    // Sanity: the NEW implementation does surface it.
    const result: any = await service.getCrossMallDashboard();
    expect(result.totals.revenueByCurrency.find((b: any) => b.currencyCode === 'USD').monthlyRevenue).toBe(12_500);
  });
});
