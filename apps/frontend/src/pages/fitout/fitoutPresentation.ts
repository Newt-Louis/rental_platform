import { CURRENCIES, type CurrencyCode } from '@/lib/currency';

export type FitoutProjectPresentation = {
  status?: string | null;
  expectedOpenDate?: string | null;
  tenant?: { brandName?: string | null } | null;
  unit?: { code?: string | null; floor?: { name?: string | null } | null } | null;
  operationManager?: { fullName?: string | null } | null;
};

export type FitoutAttentionFilter = 'ACTIVE' | 'UNASSIGNED' | 'OPENING_SOON' | 'COMPLETED' | '';

export function humanizeFitoutCode(value?: string | null) {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getFitoutPresentationLabel(
  translate: (key: string, options?: Record<string, unknown>) => string,
  keyPrefix: string,
  value?: string | null,
) {
  if (!value) return '—';
  const key = `${keyPrefix}.${value}`;
  const translated = translate(key, { defaultValue: '' });
  const unknown = translate('common:unknownValue', { defaultValue: 'Unknown' });
  return translated && translated !== key ? translated : unknown || 'Unknown';
}

export function filterFitoutProjects<T extends FitoutProjectPresentation>(
  projects: T[],
  search: string,
  status: string,
  attention: FitoutAttentionFilter = '',
  now = new Date(),
) {
  const query = search.trim().toLocaleLowerCase();
  return projects.filter((project) => {
    if (status && project.status !== status) return false;
    if (attention === 'ACTIVE' && ['OPENED', 'COMPLETED'].includes(project.status ?? '')) return false;
    if (attention === 'UNASSIGNED' && project.operationManager) return false;
    if (attention === 'COMPLETED' && !['OPENED', 'COMPLETED'].includes(project.status ?? '')) return false;
    if (attention === 'OPENING_SOON') {
      if (!project.expectedOpenDate) return false;
      const remaining = new Date(project.expectedOpenDate).getTime() - now.getTime();
      if (remaining < 0 || remaining > 14 * 86_400_000) return false;
    }
    if (!query) return true;
    return [
      project.tenant?.brandName,
      project.unit?.code,
      project.unit?.floor?.name,
      project.operationManager?.fullName,
    ].some((value) => value?.toLocaleLowerCase().includes(query));
  });
}

type DecimalInput = string | number | null | undefined;

function decimalToScaledInteger(value: DecimalInput, scale = 2): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  const raw = typeof value === 'number' ? value.toFixed(scale) : String(value).trim();
  const match = raw.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return 0n;
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = (match[3] ?? '').padEnd(scale, '0').slice(0, scale);
  return sign * (whole * (10n ** BigInt(scale)) + BigInt(fraction || '0'));
}

function scaledIntegerToDecimal(value: bigint, scale = 2) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(scale);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(scale, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function formatDecimalMoneyWithCode(
  amount: DecimalInput,
  currencyCode: CurrencyCode = 'VND',
  locale = 'vi-VN',
) {
  const decimalPlaces = CURRENCIES[currencyCode]?.decimalPlaces ?? 0;
  let minor = decimalToScaledInteger(amount, 2);
  if (decimalPlaces === 0) {
    const negative = minor < 0n;
    const absolute = negative ? -minor : minor;
    minor = (absolute + 50n) / 100n;
    if (negative) minor = -minor;
  }
  const divisor = 10n ** BigInt(decimalPlaces);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = absolute / divisor;
  const fraction = decimalPlaces ? (absolute % divisor).toString().padStart(decimalPlaces, '0') : '';
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole);
  const decimalSeparator = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
  return `${negative ? '-' : ''}${grouped}${fraction ? `${decimalSeparator}${fraction}` : ''} ${currencyCode}`;
}

export function formatDecimalAmountWithoutCurrency(amount: DecimalInput, locale = 'vi-VN') {
  const minor = decimalToScaledInteger(amount, 2);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole);
  const decimalSeparator = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
  return `${negative ? '-' : ''}${grouped}${decimalSeparator}${fraction}`;
}

export function groupChangeOrderAmountsByCurrency(orders: Array<{
  currency?: string | null;
  status?: string | null;
  costType?: string | null;
  estimatedCost?: DecimalInput;
  approvedCost?: DecimalInput;
}>) {
  const minorGroups = orders.reduce<Record<string, { estimated: bigint; approved: bigint }>>((groups, order) => {
    const currency = order.currency?.trim() || 'UNSPECIFIED';
    const group = groups[currency] ?? { estimated: 0n, approved: 0n };
    const sign = order.costType === 'DEDUCTION' ? -1n : 1n;
    group.estimated += sign * decimalToScaledInteger(order.estimatedCost);
    if (order.status === 'APPROVED' && order.approvedCost != null) {
      group.approved += sign * decimalToScaledInteger(order.approvedCost);
    }
    groups[currency] = group;
    return groups;
  }, {});
  return Object.fromEntries(Object.entries(minorGroups).map(([currency, values]) => [currency, {
    estimated: scaledIntegerToDecimal(values.estimated),
    approved: scaledIntegerToDecimal(values.approved),
  }])) as Record<string, { estimated: string; approved: string }>;
}
