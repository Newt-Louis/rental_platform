import { CurrencyCode } from '@prisma/client';

// Multi-currency foundation (docs/program/MULTI_CURRENCY_ARCHITECTURE.md).
// This is the one place currency metadata that CurrencyCode (a DB enum) can't
// carry lives. Adding a new currency: one enum value in schema.prisma + one
// migration + one entry here + the matching entry in
// apps/frontend/src/lib/currency.ts. No lifecycle model/service changes.
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

export const DEFAULT_CURRENCY_CODE: CurrencyCode = 'VND';

export const SUPPORTED_CURRENCY_CODES: CurrencyCode[] = Object.values(CURRENCIES)
  .filter((c) => c.isActive)
  .map((c) => c.code);
