import React from 'react';
import type { HandoverDerivedStatus, HandoverEvaluation, HandoverRiskSeverity, HandoverSummary } from '@/api/handover-readiness';

/**
 * Presentation only: maps the server-evaluated status to labels/colours. No
 * thresholds live here -- the backend evaluator (handover-readiness.policy.ts)
 * is the single authority for TRACKING / AT_RISK / OVERDUE.
 */
export const HANDOVER_STATUS_META: Record<HandoverDerivedStatus, { label: string; className: string }> = {
  TRACKING: { label: 'Đang theo dõi', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  AT_RISK: { label: 'Có rủi ro', className: 'bg-amber-50 text-amber-800 border-amber-300' },
  OVERDUE: { label: 'Quá hạn', className: 'bg-red-50 text-red-700 border-red-300' },
  CONFIRMED: { label: 'Đã xác nhận', className: 'bg-green-50 text-green-700 border-green-300' },
  CANCELLED: { label: 'Đã hủy', className: 'bg-gray-50 text-gray-500 border-gray-200' },
};

export const RISK_SEVERITY_META: Record<HandoverRiskSeverity, { label: string; className: string }> = {
  LOW: { label: 'Thấp', className: 'bg-gray-100 text-gray-600' },
  MEDIUM: { label: 'Trung bình', className: 'bg-amber-100 text-amber-800' },
  HIGH: { label: 'Cao', className: 'bg-red-100 text-red-700' },
};

export const RISK_FLAG_LABEL: Record<string, string> = {
  DEADLINE_WARNING: '≤30 ngày',
  DEADLINE_CRITICAL: '≤7 ngày',
  OVERDUE: 'Quá hạn',
  DATE_SLIPPAGE: 'Lùi ngày nhiều lần',
  HIGH_RISK_OPEN: 'Rủi ro mức cao',
  COMMITMENT_CONFLICT: 'Xung đột cam kết khách',
};

export const EVENT_LABEL: Record<string, string> = {
  TRACKING_STARTED: 'Bắt đầu theo dõi',
  TARGET_DATE_CHANGED: 'Đổi ngày dự kiến',
  RISK_ADDED: 'Ghi nhận rủi ro',
  RISK_RESOLVED: 'Xử lý rủi ro',
  FOLLOWER_ADDED: 'Thêm người theo dõi',
  FOLLOWER_REMOVED: 'Bỏ người theo dõi',
  EVIDENCE_ADDED: 'Tải ảnh xác nhận',
  EVIDENCE_REMOVED: 'Xóa ảnh chưa dùng',
  REMINDER_SENT: 'Gửi nhắc hạn',
  COMMITMENT_CONFLICT_DETECTED: 'Phát hiện xung đột cam kết',
  CONFIRMED: 'Xác nhận đủ điều kiện bàn giao',
  REOPENED: 'Mở lại',
  CANCELLED: 'Hủy theo dõi',
};

/** "Còn N ngày" / "Quá hạn N ngày" / "Đã xác nhận" -- from server-provided daysRemaining. */
export function handoverDaysLabel(e: HandoverEvaluation): string {
  if (e.status === 'CONFIRMED') return 'Đã xác nhận';
  if (e.status === 'CANCELLED') return 'Đã hủy';
  if (e.daysRemaining < 0) return `Quá hạn ${-e.daysRemaining} ngày`;
  if (e.daysRemaining === 0) return 'Đến hạn hôm nay';
  return `Còn ${e.daysRemaining} ngày`;
}

export function HandoverStatusBadge({ status, className = '' }: { status: HandoverDerivedStatus; className?: string }) {
  const meta = HANDOVER_STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className} ${className}`}>
      {meta.label}
    </span>
  );
}

/** Compact grid-card badge. Deliberately one line so the card is not overloaded. */
export function HandoverCardBadge({ summary }: { summary: HandoverSummary }) {
  const e = summary.evaluation;
  const meta = HANDOVER_STATUS_META[e.status];
  const risky = e.status === 'AT_RISK';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
      title={`Bàn giao MB từ Ban dự án · ${meta.label}`}
      data-testid="handover-card-badge"
    >
      MB: {handoverDaysLabel(e)}{risky ? ' · Rủi ro' : ''}
    </span>
  );
}

/** Filter buckets offered in the Spaces grid, all computed from server fields. */
export type HandoverFilter = '' | 'TRACKED' | 'DUE_30' | 'OVERDUE' | 'AT_RISK' | 'CONFIRMED';

export const HANDOVER_FILTER_OPTIONS: Array<{ value: Exclude<HandoverFilter, ''>; label: string }> = [
  { value: 'TRACKED', label: 'Đang theo dõi bàn giao' },
  { value: 'DUE_30', label: 'Bàn giao ≤30 ngày' },
  { value: 'OVERDUE', label: 'Bàn giao quá hạn' },
  { value: 'AT_RISK', label: 'Bàn giao có rủi ro' },
  { value: 'CONFIRMED', label: 'Đã xác nhận đủ điều kiện' },
];

export function matchesHandoverFilter(summary: HandoverSummary | undefined, filter: HandoverFilter): boolean {
  if (!filter) return true;
  if (!summary) return false;
  const e = summary.evaluation;
  const live = e.status !== 'CONFIRMED' && e.status !== 'CANCELLED';
  switch (filter) {
    case 'TRACKED': return live;
    case 'DUE_30': return live && e.deadlineLevel !== 'NONE' && e.deadlineLevel !== 'OVERDUE';
    case 'OVERDUE': return e.status === 'OVERDUE';
    case 'AT_RISK': return e.status === 'AT_RISK';
    case 'CONFIRMED': return e.status === 'CONFIRMED';
    default: return true;
  }
}
