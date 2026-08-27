import { formatMoneyAmount, type CurrencyCode } from '@/lib/currency';

const BILLION = 1_000_000_000;

export function formatVndBillionsAxis(value: number) {
  return (value / BILLION).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

export function formatExactReportingMoney(value: number, currency: CurrencyCode) {
  return `${formatMoneyAmount(value, currency)} ${currency}`;
}

export function formatExactReportingAmount(value: number, currency: CurrencyCode) {
  return formatMoneyAmount(value, currency);
}
