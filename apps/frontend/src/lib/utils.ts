import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatMoney } from './currency';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Kept for backward compatibility with its existing caller -- delegates to
// the central multi-currency formatter (docs/program/MULTI_CURRENCY_ARCHITECTURE.md).
export function formatVND(amount: number): string {
  return formatMoney(amount, 'VND');
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '-';
  }
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

export function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const TIME_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

export function formatDateTimeVN(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return '—';
  try {
    let date: Date;

    if (dateVal instanceof Date) {
      date = dateVal;
    } else if (typeof dateVal === 'string') {
      if (/^\d{2}:\d{2}:\d{2}\s\d{2}\/\d{2}\/\d{4}$/.test(dateVal)) {
        return dateVal;
      }
      date = new Date(dateVal);
    } else {
      return '—';
    }

    if (isNaN(date.getTime())) return '—';
    return TIME_FORMATTER.format(date);
  } catch {
    return '—';
  }
}
