/**
 * REMEDIATION WAVE 2 — RPT-CUR-001.
 *
 * The AI assistant used to hand the model `SUM(grossSales)` across VND, USD and
 * MMK rows and label it "VNĐ", with growth derived from two such mixed sums.
 * These tests pin the four properties that must hold instead: amounts grouped
 * by currency, growth computed within a currency, NULL currency never read as
 * VND, and the context carrying an explicit no-FX instruction.
 */
import { Test } from '@nestjs/testing';
import {
  groupTurnoverByCurrency,
  turnoverGrowthByCurrency,
  buildTurnoverContext,
  UNKNOWN_CURRENCY,
  NO_FX_INSTRUCTION,
  AR_VND_SCOPE_DISCLOSURE,
  type TurnoverGroupRow,
} from './ai-financial-context';
import { AiService } from './ai.service';
import { PrismaService } from '../../prisma/prisma.service';

const row = (
  currencyCode: 'VND' | 'USD' | 'MMK' | null,
  grossSales: number,
  netSales: number,
  count = 1,
): TurnoverGroupRow => ({
  currencyCode,
  _sum: { grossSales, netSales },
  _count: count,
});

describe('groupTurnoverByCurrency (RPT-CUR-001)', () => {
  // T1
  it('T1: VND-only turnover produces exactly one VND bucket with correct gross/net', () => {
    const buckets = groupTurnoverByCurrency([row('VND', 2_287_113_472, 2_100_000_000, 12)]);
    expect(buckets).toEqual([
      { currency: 'VND', grossSales: 2_287_113_472, netSales: 2_100_000_000, reportingTenants: 12 },
    ]);
  });

  // T2
  it('T2: USD-only turnover produces exactly one USD bucket', () => {
    const buckets = groupTurnoverByCurrency([row('USD', 5_488.01, 5_000, 1)]);
    expect(buckets).toEqual([
      { currency: 'USD', grossSales: 5_488.01, netSales: 5_000, reportingTenants: 1 },
    ]);
  });

  // T3
  it('T3: MMK-only turnover produces exactly one MMK bucket', () => {
    const buckets = groupTurnoverByCurrency([row('MMK', 24_995_784.55, 24_000_000, 1)]);
    expect(buckets).toEqual([
      { currency: 'MMK', grossSales: 24_995_784.55, netSales: 24_000_000, reportingTenants: 1 },
    ]);
  });

  // T4
  it('T4: mixed VND/USD/MMK produces three independent buckets, in a stable order', () => {
    const buckets = groupTurnoverByCurrency([
      row('MMK', 24_995_784.55, 24_000_000, 1),
      row('VND', 2_287_113_472, 2_100_000_000, 12),
      row('USD', 5_488.01, 5_000, 1),
    ]);

    expect(buckets.map((b) => b.currency)).toEqual(['VND', 'USD', 'MMK']);
    expect(buckets.find((b) => b.currency === 'VND')!.grossSales).toBe(2_287_113_472);
    expect(buckets.find((b) => b.currency === 'USD')!.grossSales).toBe(5_488.01);
    expect(buckets.find((b) => b.currency === 'MMK')!.grossSales).toBe(24_995_784.55);
  });

  // T5 — REGRESSION PROOF. The pre-fix implementation's single number is exactly
  // what the new contract must never produce.
  it('T5: the old cross-currency SUM is not produced by, and matches no, bucket', () => {
    const rows = [
      row('VND', 2_287_113_472, 2_100_000_000, 12),
      row('USD', 5_488.01, 5_000, 1),
      row('MMK', 24_995_784.55, 24_000_000, 1),
    ];

    // What buildContext used to hand the model, verbatim in shape.
    const oldSum = rows.reduce((s, r) => s + (r._sum.grossSales ?? 0), 0);
    expect(oldSum).toBeCloseTo(2_312_114_744.56, 2);

    const buckets = groupTurnoverByCurrency(rows);
    expect(buckets.some((b) => b.grossSales === oldSum)).toBe(false);
    expect(buckets).toHaveLength(3);
  });

  // T10
  it('T10: a NULL currencyCode becomes UNKNOWN and never falls back to VND', () => {
    const buckets = groupTurnoverByCurrency([row(null, 123_000, 120_000, 2)]);

    expect(buckets).toHaveLength(1);
    expect(buckets[0].currency).toBe(UNKNOWN_CURRENCY);
    expect(buckets[0].currency).not.toBe('VND');
  });

  it('T10b: a NULL row is never merged into a real VND bucket', () => {
    const buckets = groupTurnoverByCurrency([row('VND', 1_000, 900, 1), row(null, 500, 400, 1)]);

    expect(buckets.map((b) => b.currency)).toEqual(['VND', UNKNOWN_CURRENCY]);
    expect(buckets.find((b) => b.currency === 'VND')!.grossSales).toBe(1_000);
    expect(buckets.find((b) => b.currency === UNKNOWN_CURRENCY)!.grossSales).toBe(500);
  });
});

describe('turnoverGrowthByCurrency (RPT-CUR-001)', () => {
  // T7
  it('T7: growth is computed within each currency, never across two', () => {
    const curr = groupTurnoverByCurrency([row('VND', 1_100, 1_000), row('USD', 50, 45)]);
    const prev = groupTurnoverByCurrency([row('VND', 1_000, 900), row('USD', 100, 90)]);

    const growth = turnoverGrowthByCurrency(curr, prev);
    expect(growth.find((g) => g.currency === 'VND')!.growth).toEqual({ kind: 'PERCENT', percent: 10 });
    expect(growth.find((g) => g.currency === 'USD')!.growth).toEqual({ kind: 'PERCENT', percent: -50 });

    // The old mixed calculation would have been (1150 - 1100) / 1100 = +4.5%,
    // a figure that describes neither currency.
    const mixedPercent = +((((1_100 + 50) - (1_000 + 100)) / (1_000 + 100)) * 100).toFixed(1);
    expect(growth.some((g) => g.growth.kind === 'PERCENT' && g.growth.percent === mixedPercent)).toBe(false);
  });

  // T8
  it('T8: a currency present only in the current period gets NEW_CURRENCY, not a percentage', () => {
    const curr = groupTurnoverByCurrency([row('VND', 1_000, 900), row('USD', 50, 45)]);
    const prev = groupTurnoverByCurrency([row('VND', 800, 700)]);

    const growth = turnoverGrowthByCurrency(curr, prev);
    expect(growth.find((g) => g.currency === 'USD')!.growth).toEqual({ kind: 'NEW_CURRENCY' });
    expect(growth.find((g) => g.currency === 'VND')!.growth.kind).toBe('PERCENT');
  });

  // T9
  it('T9: a currency present only in the previous period gets NO_CURRENT_VALUE', () => {
    const curr = groupTurnoverByCurrency([row('VND', 1_000, 900)]);
    const prev = groupTurnoverByCurrency([row('VND', 800, 700), row('MMK', 5_000, 4_500)]);

    const growth = turnoverGrowthByCurrency(curr, prev);
    expect(growth.find((g) => g.currency === 'MMK')!.growth).toEqual({ kind: 'NO_CURRENT_VALUE' });
  });

  // Two UNKNOWN-currency sums from different periods are not guaranteed to be
  // the same unit, so comparing them would be the very error being fixed.
  it('T9c: the UNKNOWN bucket never produces a growth percentage', () => {
    const curr = groupTurnoverByCurrency([row(null, 200, 180)]);
    const prev = groupTurnoverByCurrency([row(null, 100, 90)]);

    const growth = turnoverGrowthByCurrency(curr, prev);
    expect(growth[0].growth).toEqual({ kind: 'CURRENCY_UNKNOWN_NOT_COMPARABLE' });
    expect(growth.some((g) => g.growth.kind === 'PERCENT')).toBe(false);
  });

  it('T9b: a zero prior total gets NO_PRIOR_VALUE rather than a division by zero', () => {
    const curr = groupTurnoverByCurrency([row('VND', 1_000, 900)]);
    const prev = groupTurnoverByCurrency([row('VND', 0, 0)]);

    const growth = turnoverGrowthByCurrency(curr, prev);
    expect(growth[0].growth).toEqual({ kind: 'NO_PRIOR_VALUE' });
  });
});

describe('buildTurnoverContext prose (RPT-CUR-001)', () => {
  const CURR = [
    row('VND', 2_287_113_472, 2_100_000_000, 12),
    row('USD', 5_488.01, 5_000, 1),
    row('MMK', 24_995_784.55, 24_000_000, 1),
  ];
  const PREV = [row('VND', 2_000_000_000, 1_900_000_000, 12)];

  // T6
  it('T6: no line labels a mixed-currency aggregate as VNĐ', () => {
    const text = buildTurnoverContext('2026-09', '2026-08', CURR, PREV);

    // The legacy hardcoded label is gone entirely.
    expect(text).not.toContain('VNĐ');

    // Each currency is on its own line with its own ISO code.
    expect(text).toMatch(/- VND: gross .*VND/);
    expect(text).toMatch(/- USD: gross .*USD/);
    expect(text).toMatch(/- MMK: gross .*MMK/);

    // And the old combined number appears nowhere in the prose.
    const oldSum = CURR.reduce((s, r) => s + (r._sum.grossSales ?? 0), 0);
    expect(text).not.toContain(oldSum.toLocaleString('vi-VN'));
  });

  it('states explicitly that no FX conversion is applied and there is no combined total', () => {
    const text = buildTurnoverContext('2026-09', '2026-08', CURR, PREV);
    expect(text).toContain('KHÔNG quy đổi tỷ giá');
    expect(text).toContain('không có số tổng gộp');
  });

  it('renders NEW_CURRENCY / NO_CURRENT_VALUE semantically, never as a number', () => {
    const text = buildTurnoverContext('2026-09', '2026-08', CURR, PREV);
    expect(text).toContain('NEW_CURRENCY');

    const dropped = buildTurnoverContext('2026-09', '2026-08', [row('VND', 10, 9)], [
      row('VND', 8, 7),
      row('MMK', 500, 450),
    ]);
    expect(dropped).toContain('NO_CURRENT_VALUE');
    expect(dropped).toContain('MMK');
  });

  it('T10c: an UNKNOWN-currency bucket is labelled as unknown and warned about', () => {
    const text = buildTurnoverContext('2026-09', '2026-08', [row(null, 123_000, 120_000, 2)], []);

    expect(text).toContain('KHÔNG XÁC ĐỊNH');
    expect(text).toContain('CẢNH BÁO');
    expect(text).toContain('KHÔNG phải VND');
    // The unknown amount must not be given a currency code of any kind.
    expect(text).not.toMatch(/123\.000 VND/);
  });

  it('handles an empty period without inventing a zero total', () => {
    const text = buildTurnoverContext('2026-09', '2026-08', [], []);
    expect(text).toContain('Chưa có dữ liệu doanh thu');
    expect(text).not.toContain('0 VND');
  });
});

describe('buildContext integration (RPT-CUR-001)', () => {
  let service: AiService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      salesTurnover: {
        groupBy: jest.fn(async ({ where }: any) =>
          where.period === '2026-09'
            ? [
                { currencyCode: 'VND', _sum: { grossSales: 2_287_113_472, netSales: 2_100_000_000 }, _count: 12 },
                { currencyCode: 'USD', _sum: { grossSales: 5_488.01, netSales: 5_000 }, _count: 1 },
                { currencyCode: null, _sum: { grossSales: 123_000, netSales: 120_000 }, _count: 2 },
              ]
            : [{ currencyCode: 'VND', _sum: { grossSales: 2_000_000_000, netSales: 1_900_000_000 }, _count: 12 }],
        ),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          { totalAmount: 448_855_000, tenant: { brandName: 'Highlands Coffee' } },
        ]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 448_855_000 }, _count: 2 }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AiService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AiService);
  });

  const build = (message: string) =>
    (service as any).buildContext(message, { userId: 'u1', role: 'ADMIN', authorizedMallIds: null });

  // T11
  it('T11: the generated context carries an explicit no-FX instruction', async () => {
    const context: string = await build('doanh thu tháng này thế nào?');

    expect(context).toContain(NO_FX_INSTRUCTION);
    expect(context).toContain('KHÔNG được cộng');
    expect(context).toContain('KHÔNG có công cụ quy đổi tỷ giá');
  });

  it('T11b: the no-FX instruction is omitted when no money is in the context', async () => {
    const context: string = await build('có bao nhiêu ticket đang mở?');
    expect(context).not.toContain(NO_FX_INSTRUCTION);
  });

  // T12
  it('T12: the VND-scoped AR block declares its scope in the context', async () => {
    const context: string = await build('công nợ quá hạn hiện tại?');

    expect(context).toContain(AR_VND_SCOPE_DISCLOSURE);
    expect(context).toContain('CHỈ bao gồm hóa đơn có đơn vị');
    // The AR queries themselves are still deliberately VND-filtered.
    const where = prisma.invoice.aggregate.mock.calls[0][0].where;
    expect(where.currencyCode).toBe('VND');
  });

  it('queries turnover with groupBy on currencyCode, not a flat aggregate', async () => {
    await build('doanh thu');

    expect(prisma.salesTurnover.groupBy).toHaveBeenCalledTimes(2);
    expect(prisma.salesTurnover.groupBy.mock.calls[0][0].by).toEqual(['currencyCode']);
  });

  it('never emits the cross-currency total into the prompt', async () => {
    const context: string = await build('doanh thu tháng này');

    const oldSum = 2_287_113_472 + 5_488.01 + 123_000;
    expect(context).not.toContain(oldSum.toLocaleString('vi-VN'));
    expect(context).toContain('KHÔNG XÁC ĐỊNH');
  });
});
