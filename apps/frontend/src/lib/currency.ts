// Multi-currency foundation (docs/program/MULTI_CURRENCY_ARCHITECTURE.md).
// Mirrors apps/backend/src/common/constants/currency.constants.ts -- keep both
// in sync when adding a currency. Locale controls digit grouping/decimal
// style only; it never determines currency (a vi-VN UI showing a USD
// contract formats as "$1,234.00 USD", not "1.234 ₫").
export type CurrencyCode = 'VND' | 'USD' | 'MMK';

export interface CurrencyMeta {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  VND: { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalPlaces: 0, isActive: true },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, isActive: true },
  MMK: { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K', decimalPlaces: 2, isActive: true },
};

export const CURRENCY_CODES: CurrencyCode[] = Object.values(CURRENCIES)
  .filter((c) => c.isActive)
  .map((c) => c.code);

export function formatMoney(amount: number | null | undefined, currencyCode: CurrencyCode = 'VND', locale = 'vi-VN'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const meta = CURRENCIES[currencyCode] ?? CURRENCIES.VND;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: meta.code,
    minimumFractionDigits: meta.decimalPlaces,
    maximumFractionDigits: meta.decimalPlaces,
  }).format(amount);
}

// CR-109 Wave 1 (Rule 1/3): numeric-only presentation for financial tables that
// carry a dedicated Currency column -- embedding a symbol/code in the Amount
// cell there would duplicate what the Currency column already states. Uses the
// same authoritative CURRENCIES.decimalPlaces config as formatMoney(), just
// without the `style: 'currency'` decoration. Never introduce a second,
// independent Intl.NumberFormat call in a component -- extend this instead.
export function formatMoneyAmount(amount: number | null | undefined, currencyCode: CurrencyCode = 'VND', locale = 'vi-VN'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const meta = CURRENCIES[currencyCode] ?? CURRENCIES.VND;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: meta.decimalPlaces,
    maximumFractionDigits: meta.decimalPlaces,
  }).format(amount);
}
