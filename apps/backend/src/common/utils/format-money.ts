import { CurrencyCode } from '@prisma/client';
import { CURRENCIES } from '../constants/currency.constants';

/**
 * Central money formatter (docs/program/MULTI_CURRENCY_ARCHITECTURE.md).
 * Locale controls digit grouping/decimal style only -- it never determines
 * currency. Defaults to 'vi-VN' since that's this codebase's existing
 * convention (formatVND on the frontend, .toLocaleString('vi-VN') calls
 * throughout backend services).
 */
export function formatMoney(amount: number, currencyCode: CurrencyCode, locale = 'vi-VN'): string {
  const meta = CURRENCIES[currencyCode];
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: meta.decimalPlaces,
    maximumFractionDigits: meta.decimalPlaces,
  }).format(amount);
}
