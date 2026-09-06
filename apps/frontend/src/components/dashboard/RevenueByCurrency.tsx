// RPT-CUR-001 / RPT-CUR-003 / RPT-CUR-004 — presentation of a monetary KPI that
// spans more than one currency.
//
// The platform has NO FX engine, so VND + USD + MMK cannot be reduced to a
// single number. This component therefore renders ONE LINE PER CURRENCY and
// never produces a combined total. It also never guesses a currency: the code
// is always taken from the bucket the API returned, so the `= 'VND'` default on
// the shared formatters (RPT-CUR-007) can never fire here.
//
// Do not "simplify" this back into a single figure. Doing so re-introduces
// either a cross-currency SUM (arithmetically meaningless) or a VND-only figure
// presented as a system-wide total (silently omits USD/MMK revenue).
import { formatMoney, formatMoneyCompact, formatMoneyWithCode, type CurrencyCode } from '@/lib/currency';

export interface RevenueCurrencyBucket {
  currencyCode: CurrencyCode;
  monthlyRevenue: number;
  collectedRevenue: number;
  collectionRate: number;
}

interface Props {
  buckets: RevenueCurrencyBucket[] | undefined;
  /**
   * The source amount exists but its unit of account is genuinely unknown
   * (RPT-CUR-006: SlotBooking carries no currency column). We say so rather
   * than labelling it VND.
   */
  currencyUnknown?: boolean;
  /** Amount to show alongside the unknown-currency disclosure, if any. */
  unknownAmount?: number;
  /** Compact tiles (KPI cards) vs. full precision (per-mall rows). */
  compact?: boolean;
  className?: string;
}

export function RevenueByCurrency({
  buckets,
  currencyUnknown,
  unknownAmount,
  compact = true,
  className,
}: Props) {
  if (currencyUnknown) {
    return (
      <div className={className} data-testid="revenue-currency-unknown">
        <p className="text-lg font-bold mt-1 text-gray-500">
          {unknownAmount != null ? unknownAmount.toLocaleString('vi-VN') : '—'}
        </p>
        <p className="text-xs text-amber-600">Chưa xác định đơn vị tiền tệ</p>
      </div>
    );
  }

  const list = buckets ?? [];
  if (list.length === 0) {
    return (
      <div className={className} data-testid="revenue-by-currency-empty">
        <p className="text-lg font-bold mt-1 text-gray-400">—</p>
        <p className="text-xs text-gray-400">Không có doanh thu trong kỳ</p>
      </div>
    );
  }

  return (
    <div className={className} data-testid="revenue-by-currency">
      <ul className="mt-1 space-y-0.5">
        {list.map((b) => (
          <li key={b.currencyCode} data-testid={`revenue-bucket-${b.currencyCode}`}>
            <span
              className={compact ? 'text-xl font-bold' : 'font-semibold'}
              title={formatMoney(b.monthlyRevenue, b.currencyCode)}
            >
              {compact
                ? formatMoneyCompact(b.monthlyRevenue, b.currencyCode)
                : formatMoneyWithCode(b.monthlyRevenue, b.currencyCode)}
            </span>
            <span className="text-xs text-gray-400 ml-2">
              Thu {formatMoneyCompact(b.collectedRevenue, b.currencyCode)} ({b.collectionRate}%)
            </span>
          </li>
        ))}
      </ul>
      {list.length > 1 && (
        <p className="text-[11px] text-gray-400 mt-1">Không quy đổi tỷ giá — mỗi đơn vị tiền tệ tách riêng</p>
      )}
    </div>
  );
}

export default RevenueByCurrency;
