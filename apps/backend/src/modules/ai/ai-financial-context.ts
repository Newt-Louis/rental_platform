import { CurrencyCode } from '@prisma/client';
import { formatMoneyWithCode } from '../../common/utils/format-money';

/**
 * RPT-CUR-001 — multi-currency financial context for the AI assistant.
 *
 * `buildContext()` used to hand the model a single `SUM(grossSales)` across
 * every `SalesTurnover` row and label it "VNĐ". On live data that added VND,
 * USD and MMK figures together and presented the result as one Vietnamese-dong
 * total. The growth percentage was then derived from two such mixed sums, so it
 * was meaningless in both the numerator and the denominator.
 *
 * There is no FX engine in this platform and none is introduced here. The rules
 * this module enforces:
 *
 *   1. Amounts are GROUPED by currency; no total spans currencies.
 *   2. Growth is computed within a currency, never across two.
 *   3. A NULL `currencyCode` is NEVER read as VND. It becomes its own explicit
 *      UNKNOWN bucket that the generated prose refuses to label.
 *   4. The context carries an instruction telling the model that the amounts are
 *      separate units of account, so it cannot reasonably add them itself.
 */

/** A `SalesTurnover` row whose `currencyCode` is NULL — CUR-001 left the column
 *  nullable on purpose so a pre-currency figure is never given a fabricated
 *  unit. That decision has to survive all the way into the prompt. */
export const UNKNOWN_CURRENCY = 'UNKNOWN' as const;

export type TurnoverBucketKey = CurrencyCode | typeof UNKNOWN_CURRENCY;

export interface TurnoverBucket {
  currency: TurnoverBucketKey;
  grossSales: number;
  netSales: number;
  reportingTenants: number;
}

/** Shape returned by `prisma.salesTurnover.groupBy({ by: ['currencyCode'] })`. */
export interface TurnoverGroupRow {
  currencyCode: CurrencyCode | null;
  _sum: { grossSales: number | null; netSales: number | null };
  _count: number;
}

const BUCKET_ORDER: TurnoverBucketKey[] = ['VND', 'USD', 'MMK', UNKNOWN_CURRENCY];

function rank(key: TurnoverBucketKey): number {
  const i = BUCKET_ORDER.indexOf(key);
  return i === -1 ? 98 : i;
}

export function groupTurnoverByCurrency(rows: TurnoverGroupRow[]): TurnoverBucket[] {
  return rows
    .map((r) => ({
      // NOT `?? 'VND'`. A missing currency is unknown, not Vietnamese dong.
      currency: (r.currencyCode ?? UNKNOWN_CURRENCY) as TurnoverBucketKey,
      grossSales: r._sum.grossSales ?? 0,
      netSales: r._sum.netSales ?? 0,
      reportingTenants: r._count,
    }))
    .sort((a, b) => rank(a.currency) - rank(b.currency));
}

/**
 * Growth is only meaningful between two amounts in the same unit of account.
 * When one side is absent there is no percentage to report and inventing one
 * (0%, 100%, "N/A" attached to a number) would be a fabricated figure, so the
 * state is returned semantically instead.
 */
export type GrowthState =
  | { kind: 'PERCENT'; percent: number }
  /** The currency reported this period but not the previous one. */
  | { kind: 'NEW_CURRENCY' }
  /** The currency reported in both periods, but the prior total was zero. */
  | { kind: 'NO_PRIOR_VALUE' }
  /** The currency reported last period but not this one. */
  | { kind: 'NO_CURRENT_VALUE' }
  /**
   * The UNKNOWN bucket. Two unknown-currency sums from different periods are
   * not guaranteed to be the same unit of account, so comparing them would
   * commit exactly the error this module exists to prevent. No percentage is
   * ever produced for it.
   */
  | { kind: 'CURRENCY_UNKNOWN_NOT_COMPARABLE' };

export interface CurrencyGrowth {
  currency: TurnoverBucketKey;
  growth: GrowthState;
}

export function turnoverGrowthByCurrency(
  current: TurnoverBucket[],
  previous: TurnoverBucket[],
): CurrencyGrowth[] {
  const prevByCurrency = new Map(previous.map((b) => [b.currency, b]));
  const currByCurrency = new Map(current.map((b) => [b.currency, b]));

  const keys = [...new Set([...currByCurrency.keys(), ...prevByCurrency.keys()])]
    .sort((a, b) => rank(a) - rank(b));

  return keys.map((currency) => {
    const curr = currByCurrency.get(currency);
    const prev = prevByCurrency.get(currency);

    // Checked before everything else: an UNKNOWN bucket has no unit of account,
    // so neither its presence nor its magnitude can be compared across periods.
    if (currency === UNKNOWN_CURRENCY) {
      return { currency, growth: { kind: 'CURRENCY_UNKNOWN_NOT_COMPARABLE' } as GrowthState };
    }
    if (!curr) return { currency, growth: { kind: 'NO_CURRENT_VALUE' } as GrowthState };
    if (!prev) return { currency, growth: { kind: 'NEW_CURRENCY' } as GrowthState };
    if (prev.grossSales <= 0) return { currency, growth: { kind: 'NO_PRIOR_VALUE' } as GrowthState };

    const percent = ((curr.grossSales - prev.grossSales) / prev.grossSales) * 100;
    return { currency, growth: { kind: 'PERCENT', percent: +percent.toFixed(1) } as GrowthState };
  });
}

/** Amounts are only ever rendered with their own currency attached. The UNKNOWN
 *  bucket gets no currency label at all — that is the point of it. */
export function formatBucketAmount(amount: number, currency: TurnoverBucketKey): string {
  if (currency === UNKNOWN_CURRENCY) {
    return `${amount.toLocaleString('vi-VN')} (đơn vị tiền tệ KHÔNG XÁC ĐỊNH)`;
  }
  return formatMoneyWithCode(amount, currency);
}

function describeGrowth(growth: GrowthState, prevPeriod: string): string {
  switch (growth.kind) {
    case 'PERCENT':
      return `tăng trưởng so với ${prevPeriod}: ${growth.percent > 0 ? '+' : ''}${growth.percent}%`;
    case 'NEW_CURRENCY':
      return `tăng trưởng: NEW_CURRENCY (không có số liệu ${prevPeriod} để so sánh)`;
    case 'NO_PRIOR_VALUE':
      return `tăng trưởng: NO_PRIOR_VALUE (doanh thu ${prevPeriod} bằng 0)`;
    case 'NO_CURRENT_VALUE':
      return `NO_CURRENT_VALUE (có báo cáo ${prevPeriod} nhưng không có kỳ này)`;
    case 'CURRENCY_UNKNOWN_NOT_COMPARABLE':
      return 'tăng trưởng: CURRENCY_UNKNOWN_NOT_COMPARABLE (không có đơn vị tiền tệ nên không so sánh được giữa hai kỳ)';
  }
}

/**
 * The instruction that stops the model doing the addition the code refuses to
 * do. Emitted whenever any monetary block is in the context, not only the
 * turnover one.
 */
export const NO_FX_INSTRUCTION =
  'LƯU Ý VỀ ĐƠN VỊ TIỀN TỆ: các số tiền ở những đơn vị tiền tệ khác nhau là các ' +
  'đơn vị tính riêng biệt. KHÔNG được cộng, trừ, so sánh hay quy đổi chúng với ' +
  'nhau khi chưa có tỷ giá được phê duyệt. Hệ thống KHÔNG có công cụ quy đổi tỷ ' +
  'giá, vì vậy không tồn tại một con số "tổng doanh thu" duy nhất — hãy trình bày ' +
  'từng đơn vị tiền tệ riêng. Số tiền có đơn vị KHÔNG XÁC ĐỊNH không được coi là VND.';

/** RPT-CUR-004 local mitigation: the AR block stays VND-filtered in this wave,
 *  so the context says so instead of letting the model read it as complete. */
export const AR_VND_SCOPE_DISCLOSURE =
  'PHẠM VI: các số liệu công nợ/hóa đơn dưới đây CHỈ bao gồm hóa đơn có đơn vị ' +
  'tiền tệ VND. Hóa đơn USD/MMK (nếu có) không được tính vào các con số này.';

export function buildTurnoverContext(
  period: string,
  prevPeriod: string,
  currentRows: TurnoverGroupRow[],
  previousRows: TurnoverGroupRow[],
): string {
  const current = groupTurnoverByCurrency(currentRows);
  const previous = groupTurnoverByCurrency(previousRows);
  const growth = turnoverGrowthByCurrency(current, previous);
  const growthByCurrency = new Map(growth.map((g) => [g.currency, g.growth]));

  const lines: string[] = [
    `Doanh thu tháng ${period} — tách theo đơn vị tiền tệ, KHÔNG quy đổi tỷ giá, không có số tổng gộp:`,
  ];

  if (current.length === 0) {
    lines.push('  - Chưa có dữ liệu doanh thu cho kỳ này.');
  }

  for (const b of current) {
    const g = growthByCurrency.get(b.currency);
    const label = b.currency === UNKNOWN_CURRENCY ? 'KHÔNG XÁC ĐỊNH' : b.currency;
    lines.push(
      `  - ${label}: gross ${formatBucketAmount(b.grossSales, b.currency)}` +
        ` | net ${formatBucketAmount(b.netSales, b.currency)}` +
        ` | ${b.reportingTenants} khách thuê báo cáo` +
        (g ? ` | ${describeGrowth(g, prevPeriod)}` : ''),
    );
  }

  // A currency that reported last period but not this one is a real signal
  // (a tenant stopped reporting), so it is stated rather than dropped. Keyed on
  // absence from `current` rather than on the growth state, so the UNKNOWN
  // bucket — which never carries NO_CURRENT_VALUE — cannot vanish silently.
  const currentCurrencies = new Set(current.map((b) => b.currency));
  const droppedCurrencies = growth.filter((g) => !currentCurrencies.has(g.currency));
  if (droppedCurrencies.length > 0) {
    lines.push(`Đơn vị tiền tệ chỉ xuất hiện ở kỳ trước (${prevPeriod}):`);
    for (const g of droppedCurrencies) {
      const label = g.currency === UNKNOWN_CURRENCY ? 'KHÔNG XÁC ĐỊNH' : g.currency;
      lines.push(`  - ${label}: ${describeGrowth(g.growth, prevPeriod)}`);
    }
  }

  const unknown = current.find((b) => b.currency === UNKNOWN_CURRENCY);
  if (unknown) {
    lines.push(
      `CẢNH BÁO: ${unknown.reportingTenants} dòng doanh thu được báo cáo trước khi ` +
        'đơn vị tiền tệ được ghi nhận (CUR-001). Các số này KHÔNG phải VND và không ' +
        'được gộp vào bất kỳ đơn vị tiền tệ nào.',
    );
  }

  return lines.join('\n');
}
