import { CalendarDays, Timer, CalendarRange, Hourglass, CheckCircle2, Ban } from 'lucide-react';
import type { ElementType } from 'react';

export const UNIT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ACTIVE:    { label: 'Đang giữ',          color: 'bg-amber-100 text-amber-700 border-amber-200' },
  PENDING:   { label: 'Chờ duyệt',         color: 'bg-blue-100 text-blue-700 border-blue-200' },
  EXPIRED:   { label: 'Hết hạn',           color: 'bg-gray-100 text-gray-500 border-gray-200' },
  CANCELLED: { label: 'Đã hủy',            color: 'bg-red-100 text-red-600 border-red-200' },
  CONVERTED: { label: 'Đã lập đề xuất',    color: 'bg-green-100 text-green-700 border-green-200' },
};

export const SLOT_STATUS_CONFIG: Record<string, { label: string; color: string; icon: ElementType }> = {
  PENDING:   { label: 'Chờ xác nhận', color: 'bg-blue-100 text-blue-700 border-blue-200',     icon: Hourglass },
  CONFIRMED: { label: 'Đã xác nhận',  color: 'bg-violet-100 text-violet-700 border-violet-200', icon: CheckCircle2 },
  CANCELLED: { label: 'Đã hủy',       color: 'bg-red-100 text-red-600 border-red-200',          icon: Ban },
  COMPLETED: { label: 'Hoàn thành',   color: 'bg-green-100 text-green-700 border-green-200',    icon: CheckCircle2 },
};

export const SLOT_TYPE_CONFIG: Record<string, { label: string; icon: ElementType; color: string }> = {
  DAILY:   { label: 'Theo ngày',  icon: CalendarDays,  color: 'bg-sky-100 text-sky-700' },
  HOURLY:  { label: 'Theo giờ',   icon: Timer,         color: 'bg-orange-100 text-orange-700' },
  MONTHLY: { label: 'Theo tháng', icon: CalendarRange, color: 'bg-teal-100 text-teal-700' },
};

export const ACTIVITY_LABELS: Record<string, string> = {
  CREATED:          'Tạo booking',
  ACTIVATED:        'Kích hoạt',
  PRIORITY_CHANGED: 'Đổi ưu tiên',
  EXTENDED:         'Gia hạn',
  NOTE_ADDED:       'Ghi chú',
  CONVERTED:        'Chuyển đề xuất',
  CANCELLED:        'Hủy booking',
  EXPIRED:          'Hết hạn tự động',
};

export function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtMoney(n?: number | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}

export function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDatetime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function toDatetimeLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function daysLeft(expiresAt?: string) {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}
