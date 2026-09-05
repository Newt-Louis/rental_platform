import { formatMoneyWithCode, type CurrencyCode } from '@/lib/currency';

export const UNIT_STATUSES = [
  'VACANT',
  'OFFERING',
  'BOOKING',
  'NEGOTIATING',
  'CONTRACTED',
  'UNDER_FITOUT',
  'OCCUPIED',
  'LIQUIDATED',
  'MERGED',
] as const;

type Translate = (key: string, options?: { defaultValue?: string }) => string;

export function humanizeWorkflowValue(value?: string | null): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getUnitStatusLabel(t: Translate, status?: string | null): string {
  if (!status) return '—';
  return t(`status.${status}`, { defaultValue: t('common:unknownValue', { defaultValue: 'Unknown' }) });
}

export function formatVndAmount(value?: number | null): string {
  return formatMoneyWithCode(value, 'VND');
}

export function formatVndRate(value?: number | null): string {
  const amount = formatVndAmount(value);
  return amount === '—' ? amount : `${amount}/m²`;
}

// Unit.baseRentPerSqm/askingRentPerSqm etc. carry their own currencyCode (a Unit
// can be quoted in USD/MMK, not just VND -- see docs/program/MULTI_CURRENCY_ARCHITECTURE.md).
// formatVndRate() above always labels the value VND regardless, so editing a
// unit's rent to e.g. USD still displayed "... VND" everywhere outside the edit
// form. Use this for any single unit's own rate instead.
export function formatRatePerSqm(value?: number | null, currencyCode: CurrencyCode = 'VND'): string {
  const amount = formatMoneyWithCode(value, currencyCode);
  return amount === '—' ? amount : `${amount}/m²`;
}
