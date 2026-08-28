import { formatMoneyWithCode } from '@/lib/currency';

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
