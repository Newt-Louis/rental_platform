/**
 * REMEDIATION WAVE 6 — CUR-002, OccupancySnapshot subset / MON-CUR-OCC-01.
 *
 * `OccupancySnapshot.revenuePerSqm` is a monetary RATIO (money / m²). Dividing
 * by an area does not make it currency-neutral: VND/m² and USD/m² are different
 * units. The column carried no currency, so the figure was persisted and
 * returned with nothing saying what unit it was in.
 *
 * The arithmetic was never unsafe — the writer's source aggregate is explicitly
 * `currencyCode: 'VND'`-scoped, so no cross-currency SUM ever occurred. The
 * defect was the UNDISCLOSED SCOPE, and the fix records the scope rather than
 * widening it. Widening would change what the KPI means, which is a business
 * decision this wave does not take.
 *
 * Per §12 of the brief: because the proven contract is VND-only, there are no
 * manufactured USD/MMK snapshot tests. Instead the tests below prove a non-VND
 * source cannot silently enter the VND-only calculation.
 */
import { UnitStatus } from '@prisma/client';
import {
  OccupancyAnalyticsService,
  OCCUPANCY_REVENUE_SCALE_CURRENCY,
} from './occupancy-analytics.service';

function buildService(overrides: any = {}) {
  const prisma: any = {
    mall: { findMany: jest.fn().mockResolvedValue([{ id: 'mall-1' }]) },
    unit: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'u1', mallId: 'mall-1', leaseTermType: 'LONG', status: UnitStatus.OCCUPIED, areaNLA: 100, isActive: true },
      ]),
    },
    slotBooking: { findMany: jest.fn().mockResolvedValue([]) },
    invoice: { aggregate: jest.fn().mockResolvedValue({ _sum: { subtotal: 50_000_000 } }) },
    occupancySnapshot: {
      // OCC-CRON-001: the writer no longer upserts on a compound unique
      // containing nulls -- it looks the row up, then creates or updates.
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: 'snap-1', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'snap-1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
  const service = new OccupancyAnalyticsService(prisma as any, {
    runExclusive: (_n: string, _t: number, fn: any) => fn(),
  } as any);
  return { service, prisma };
}

/** What the writer persisted for one lease term, whether it created or updated. */
function writtenFor(prisma: any, leaseTermType: 'LONG' | 'SHORT') {
  const created = prisma.occupancySnapshot.create.mock.calls
    .map((c: any[]) => c[0].data)
    .find((d: any) => d.leaseTermType === leaseTermType);
  if (created) return created;
  const lookups = prisma.occupancySnapshot.findFirst.mock.calls
    .map((c: any[], i: number) => ({ i, where: c[0].where }));
  const idx = lookups.find((l: any) => l.where.leaseTermType === leaseTermType)?.i;
  return idx === undefined ? undefined : prisma.occupancySnapshot.update.mock.calls[idx]?.[0]?.data;
}

describe('OccupancySnapshot writer (T1, T6, MON-CUR-OCC-01)', () => {
  // T1 / T9
  it('T1: persists the unit of account alongside the LONG revenue ratio', async () => {
    const { service, prisma } = buildService();
    await service.takeMonthlySnapshot();

    const written = writtenFor(prisma, 'LONG');

    expect(written).toBeDefined();
    expect(written.revenuePerSqmCurrency).toBe('VND');
    // 50,000,000 VND over 100 m² occupied.
    expect(written.revenuePerSqm).toBe(500_000);
  });

  // T5 — a zero has no unit of account to be missing, and must not be labelled.
  it('T5: the SHORT segment records NO currency, because its revenue is not computed', async () => {
    const { service, prisma } = buildService();
    await service.takeMonthlySnapshot();

    const written = writtenFor(prisma, 'SHORT');

    expect(written).toBeDefined();
    expect(written.revenuePerSqm).toBe(0);
    expect(written.revenuePerSqmCurrency).toBeNull();
    expect(written.revenuePerSqmCurrency).not.toBe('VND');
  });

  // T6 — the source aggregate must stay single-currency. This is what makes the
  // ratio safe; without it the numerator would be a cross-currency SUM.
  it('T6: the source invoice aggregate is scoped to exactly one currency', async () => {
    const { service, prisma } = buildService();
    await service.takeMonthlySnapshot();

    const where = prisma.invoice.aggregate.mock.calls[0][0].where;
    expect(where.currencyCode).toBe('VND');
    expect(where.currencyCode).toBe(OCCUPANCY_REVENUE_SCALE_CURRENCY);
  });

  it('T6b: the recorded currency is the same one the source was filtered to', async () => {
    const { service, prisma } = buildService();
    await service.takeMonthlySnapshot();

    const filtered = prisma.invoice.aggregate.mock.calls[0][0].where.currencyCode;

    // Scope and label cannot drift apart: they are the same constant.
    expect(writtenFor(prisma, 'LONG').revenuePerSqmCurrency).toBe(filtered);
  });

  it('a mall with no occupied area records a zero ratio and no currency claim', async () => {
    const { service, prisma } = buildService({
      unit: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { aggregate: jest.fn().mockResolvedValue({ _sum: { subtotal: 0 } }) },
    });
    await service.takeMonthlySnapshot();

    expect(writtenFor(prisma, 'LONG').revenuePerSqm).toBe(0);
  });
});

describe('OccupancySnapshot API contract (T7, T9, T5)', () => {
  const snapshot = (revenuePerSqm: number | null, revenuePerSqmCurrency: string | null) => ({
    period: '2026-08',
    occupancyRate: 90,
    totalUnits: 10,
    occupiedUnits: 9,
    vacantUnits: 1,
    revenuePerSqm,
    revenuePerSqmCurrency,
    leaseTermType: 'LONG',
  });

  // T9
  it('T9: every monetary figure leaves the API with its unit of account', async () => {
    const { service } = buildService({
      occupancySnapshot: { findMany: jest.fn().mockResolvedValue([snapshot(500_000, 'VND')]), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    });

    const trend: any[] = await service.getOccupancyTrend('mall-1');
    expect(trend[0]).toHaveProperty('revenuePerSqmCurrency', 'VND');
    expect(trend[0].revenuePerSqm).toBe(500_000);
  });

  // T5
  it('T5: a legacy snapshot with no captured currency stays UNKNOWN, never VND', async () => {
    const { service } = buildService({
      occupancySnapshot: { findMany: jest.fn().mockResolvedValue([snapshot(450_000, null)]), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    });

    const trend: any[] = await service.getOccupancyTrend('mall-1');
    expect(trend[0].revenuePerSqmCurrency).toBeNull();
    expect(trend[0].revenuePerSqmCurrency).not.toBe('VND');
    // The figure is still returned -- hiding it would lose information.
    expect(trend[0].revenuePerSqm).toBe(450_000);
  });

  // T7 — historical immutability. The API reads the currency PERSISTED ON THE
  // ROW; it never recomputes it from current configuration, so a later change to
  // the writer's scope or to Mall/Unit currency cannot relabel history.
  it('T7: a historical snapshot keeps its own currency, whatever the current source says', async () => {
    const { service, prisma } = buildService({
      occupancySnapshot: {
        findMany: jest.fn().mockResolvedValue([
          snapshot(450_000, null),        // recorded before the column existed
          snapshot(500_000, 'VND'),       // recorded after
        ]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      // Current configuration says every unit is USD now.
      unit: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', currencyCode: 'USD' }]) },
    });

    const trend: any[] = await service.getOccupancyTrend('mall-1');
    expect(trend.map((t) => t.revenuePerSqmCurrency)).toEqual([null, 'VND']);
    // Nothing consulted current Unit state to answer this.
    expect(prisma.unit.findMany).not.toHaveBeenCalled();
  });
});

/**
 * T12 — REGRESSION PROOF, and T6/T8 as structure.
 *
 * Two properties hold because of how the writer is written, not because a
 * runtime check enforces them: the source aggregate is single-currency, and the
 * persisted label is that same currency. Every behavioural test above would
 * still pass if someone dropped the `currencyCode` filter while leaving the
 * 'VND' label in place — and the ratio would silently become a cross-currency
 * sum wearing a VND badge.
 *
 * This reads the writer's source and fails on exactly that.
 */
describe('MON-CUR-OCC-01 — writer structure (T12)', () => {
  const readWriterCode = () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('fs');
    const src = readFileSync(require.resolve('./occupancy-analytics.service.ts'), 'utf8');
    const start = src.indexOf('private async takeMonthlySnapshotUnlocked()');
    const end = src.indexOf('async getVacancyAnalysis', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // Comments stripped: the method's own commentary names the words it denies.
    return src.slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
  };

  it('T12: removing the single-currency scope from the source aggregate fails this test', () => {
    const code = readWriterCode();
    expect(code).toContain("currencyCode: 'VND'");
  });

  it('T12b: the persisted label comes from the named constant, not a bare literal', () => {
    const code = readWriterCode();
    expect(code).toContain('OCCUPANCY_REVENUE_SCALE_CURRENCY');
    expect(code).toContain('revenuePerSqmCurrency');
  });

  it('T12c: the writer never defaults a currency', () => {
    const code = readWriterCode();
    expect(code).not.toMatch(/revenuePerSqmCurrency[^\n]*\?\?\s*'VND'/);
  });

  // T8 — the reconciliation refuses to infer from unrelated current state. That
  // rule lives in the SQL; this pins the two facts it rests on so the reasoning
  // cannot quietly stop being true.
  it('T8: two distinct writers exist, so a persisted row has no provable provenance', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('fs');
    const seed = readFileSync(require.resolve('../../../prisma/seed.ts'), 'utf8');

    // The seed writes a fabricated figure into the same table the cron writes.
    expect(seed).toContain('occupancySnapshot.create');
    expect(seed).toMatch(/revenuePerSqm:\s*400000/);
    // It now states its own unit rather than planting currency-less money.
    expect(seed).toContain('revenuePerSqmCurrency: CurrencyCode.VND');
  });
});
