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

/**
 * Amount + explicit ISO code ("1.200.000 VND", "25,00 USD") -- mirrors the
 * frontend's formatMoneyWithCode(). Use this for emails, notification bodies
 * and any generated text that used to hardcode a "VNĐ" suffix: those read as
 * the wrong currency the moment the underlying Proposal/Invoice/Contract is
 * USD or MMK.
 */
export function formatMoneyWithCode(amount: number, currencyCode: CurrencyCode, locale = 'vi-VN'): string {
  const meta = CURRENCIES[currencyCode] ?? CURRENCIES.VND;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: meta.decimalPlaces,
    maximumFractionDigits: meta.decimalPlaces,
  }).format(amount);
  return `${formatted} ${currencyCode}`;
}
