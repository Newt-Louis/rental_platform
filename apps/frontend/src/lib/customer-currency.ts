// CUR-002-CUSTOMER — presentation of Customer budget figures.
//
// `budgetMin` / `budgetMax` were rendered as `"${min}–${max} tr/m²"`. "tr" is
// triệu đồng — a VND unit word — printed over values the model could not prove
// were VND. `Customer.currencyCode` now exists, so the unit comes from the data.
//
// A NULL currency is a legacy row. It is shown as unknown, never as VND.
import { formatMoney, type CurrencyCode } from '@/lib/currency';

export const UNKNOWN_CUSTOMER_CURRENCY = 'UNKNOWN' as const;
export type CustomerCurrencyKey = CurrencyCode | typeof UNKNOWN_CUSTOMER_CURRENCY;

export interface CustomerBudget {
  budgetMin?: number | null;
  budgetMax?: number | null;
  currencyCode?: CurrencyCode | null;
}

export interface CustomerCurrencyBucket {
  currencyCode: CustomerCurrencyKey;
  budgetMin: number;
  budgetMax: number;
  customerCount: number;
}

const BUCKET_ORDER: CustomerCurrencyKey[] = ['VND', 'USD', 'MMK', UNKNOWN_CUSTOMER_CURRENCY];

const rank = (key: CustomerCurrencyKey) => {
  const i = BUCKET_ORDER.indexOf(key);
  return i === -1 ? 98 : i;
};

/** NOT `?? 'VND'`. */
export function customerCurrencyKey(customer: CustomerBudget): CustomerCurrencyKey {
  return customer.currencyCode ?? UNKNOWN_CUSTOMER_CURRENCY;
}

/**
 * The budget is a range for one quantity, so both ends share one currency and
 * the code is printed once at the end rather than on each figure.
 */
export function formatBudgetRange(
  budgetMin: number | null | undefined,
  budgetMax: number | null | undefined,
  currencyCode: CurrencyCode | null | undefined,
): string {
  if (budgetMin == null && budgetMax == null) return '—';

  const lo = budgetMin != null ? budgetMin.toLocaleString('vi-VN') : '?';
  const hi = budgetMax != null ? budgetMax.toLocaleString('vi-VN') : '?';

  if (!currencyCode) return `${lo}–${hi}/m² (chưa rõ ĐVT)`;
  return `${lo}–${hi} ${currencyCode}/m²`;
}

/** Single budget figure with its own currency, for compact surfaces. */
export function formatBudgetValue(
  amount: number | null | undefined,
  currencyCode: CurrencyCode | null | undefined,
): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  if (!currencyCode) return `${amount.toLocaleString('vi-VN')} (chưa rõ ĐVT)`;
  return formatMoney(amount, currencyCode);
}

/**
 * MON-CUR-CUST-04 — if a Customer budget aggregate is ever built, it is grouped
 * by currency. No aggregate exists in the product today; this makes the safe
 * shape available so the next one cannot be written as a bare sum.
 */
export function groupCustomerBudgetByCurrency(customers: CustomerBudget[]): CustomerCurrencyBucket[] {
  const map = new Map<CustomerCurrencyKey, { budgetMin: number; budgetMax: number; customerCount: number }>();
  for (const c of customers) {
    const key = customerCurrencyKey(c);
    const acc = map.get(key) ?? { budgetMin: 0, budgetMax: 0, customerCount: 0 };
    acc.budgetMin += c.budgetMin ?? 0;
    acc.budgetMax += c.budgetMax ?? 0;
    acc.customerCount += 1;
    map.set(key, acc);
  }
  return [...map.entries()]
    .map(([currencyCode, v]) => ({ currencyCode, ...v }))
    .sort((a, b) => rank(a.currencyCode) - rank(b.currencyCode));
}
