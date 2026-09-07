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

/**
 * RPT-CUR-007 — the currency is a REQUIRED argument.
 *
 * These formatters used to default it to 'VND' and, separately, to fall back to
 * CURRENCIES.VND for an unrecognised code. Either one turns "we do not know what
 * this money is" into a confident wrong label, which is how an API's currency
 * loss becomes a user-visible lie.
 *
 * Every call site in the codebase already passes a currency (verified: no
 * single-argument call exists), so removing the default is structural rather
 * than behavioural -- it makes the invariant impossible to violate by omission
 * instead of merely conventional.
 *
 * An unrecognised code is rendered by `formatUnknownCurrency` below: the amount
 * is still shown, labelled with the raw code, and never dressed as dong.
 */
export function formatMoney(amount: number | null | undefined, currencyCode: CurrencyCode, locale = 'vi-VN'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const meta = CURRENCIES[currencyCode];
  if (!meta) return formatUnknownCurrency(amount, currencyCode, locale);
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
/**
 * Renders an amount whose currency code is not one this build knows about.
 * Shows the figure and the raw code rather than silently choosing a currency --
 * an unknown unit stays visibly unknown (RPT-CUR-007).
 */
function formatUnknownCurrency(amount: number, currencyCode: string, locale: string): string {
  return `${new Intl.NumberFormat(locale).format(amount)} ${currencyCode ?? '(?)'}`;
}

export function formatMoneyAmount(amount: number | null | undefined, currencyCode: CurrencyCode, locale = 'vi-VN'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const meta = CURRENCIES[currencyCode];
  if (!meta) return new Intl.NumberFormat(locale).format(amount);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: meta.decimalPlaces,
    maximumFractionDigits: meta.decimalPlaces,
  }).format(amount);
}

// Exact financial presentation for surfaces where the currency must be
// explicit but a currency symbol would add ambiguity (executive KPIs and
// chart tooltips). This intentionally keeps the unscaled amount and appends
// the canonical ISO code.
export function formatMoneyWithCode(amount: number | null | undefined, currencyCode: CurrencyCode, locale = 'vi-VN'): string {
  const formatted = formatMoneyAmount(amount, currencyCode, locale);
  return formatted === '—' ? formatted : `${formatted} ${currencyCode}`;
}

// CR-109 Wave 2 (Dashboard/KPI compact exception): compact notation is allowed
// only for aggregate KPI tiles/charts, and only when the currency code is
// explicitly and unambiguously attached to the compact number itself -- never
// a bare "125tr"/"125M"/"$25K". Every call site MUST also expose the full
// value (e.g. via a `title` tooltip using formatMoney()) so precision is
// never lost, only visually deferred. Do not use this for any transactional
// table or per-record financial figure -- those use formatMoney()/
// formatMoneyAmount() and must never abbreviate.
export function formatMoneyCompact(amount: number | null | undefined, currencyCode: CurrencyCode, locale = 'vi-VN'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  return `${compact} ${currencyCode}`;
}
