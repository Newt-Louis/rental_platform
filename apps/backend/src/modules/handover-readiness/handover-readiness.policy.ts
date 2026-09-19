import { BadRequestException } from '@nestjs/common';
import { HandoverReadinessLifecycle } from '@prisma/client';

/**
 * CR-UNIT-HANDOVER-READINESS -- the ONE authoritative place for readiness
 * thresholds and derived status. The controller, scheduler, analytics and the
 * frontend all consume `evaluateReadiness()` output; none of them re-derive
 * AT_RISK / OVERDUE on their own.
 */

export const HANDOVER_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const HANDOVER_POLICY = {
  /** Deadline warning window (days remaining, inclusive). */
  warningDays: 30,
  /** Escalated / critical window (days remaining, inclusive). */
  criticalDays: 7,
  /** Reminder milestones, in days remaining. 0 = the target day itself. */
  reminderMilestones: [30, 14, 7, 3, 1, 0] as readonly number[],
  /** After the target date passes: at most one reminder per this many days. */
  overdueReminderIntervalDays: 7,
  /** Date slippage flag: at least this many TARGET_DATE_CHANGED events... */
  slippageMinChanges: 2,
  /** ...or the current target is MORE than this many days after the original. */
  slippageMaxDelayDays: 15,
  /** Confirmation evidence (P1 business rule). */
  minConfirmationImages: 3,
  maxEvidenceBytes: 15 * 1024 * 1024,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// ─── Business DATE helpers ────────────────────────────────────────────────────
// A business date is represented as a JS Date at 00:00 UTC of that calendar day
// (the value Prisma returns for a `@db.Date` column). Nothing in this module ever
// formats one through a local timezone, so 2026-12-01 cannot drift to 11-30.

/** Parse a strict `YYYY-MM-DD` calendar date. Rejects 2026-02-30, timestamps, etc. */
export function parseBusinessDate(value: unknown, field = 'date'): Date {
  if (typeof value !== 'string') throw new BadRequestException(`${field} phải có dạng YYYY-MM-DD`);
  const match = ISO_DATE.exec(value.trim());
  if (!match) throw new BadRequestException(`${field} phải có dạng YYYY-MM-DD`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new BadRequestException(`${field} không phải ngày hợp lệ`);
  }
  if (y < 2000 || y > 2100) throw new BadRequestException(`${field} nằm ngoài khoảng cho phép`);
  return date;
}

/** `YYYY-MM-DD` of a business date (UTC components -- never local time). */
export function formatBusinessDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/** Vietnam calendar "today" as a business date. */
export function businessToday(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HANDOVER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}

/** Whole calendar days from `from` to `to` (both business dates). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** ISO-8601 week key (e.g. `2026-W38`) of a business date -- the weekly digest identity. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

export type HandoverDerivedStatus = 'TRACKING' | 'AT_RISK' | 'OVERDUE' | 'CONFIRMED' | 'CANCELLED';
export type HandoverDeadlineLevel = 'NONE' | 'WARNING' | 'CRITICAL' | 'OVERDUE';
export type HandoverRiskFlag = 'DEADLINE_WARNING' | 'DEADLINE_CRITICAL' | 'OVERDUE' | 'DATE_SLIPPAGE' | 'HIGH_RISK_OPEN' | 'COMMITMENT_CONFLICT';

export type CommitmentSourceType = 'PROPOSAL' | 'FITOUT_PROJECT';

export interface CustomerCommitment {
  sourceType: CommitmentSourceType;
  sourceId: string;
  /** Human reference (proposal number / contract number). */
  sourceRef: string | null;
  /** Business date committed to the tenant. */
  commitmentDate: Date;
}

export interface CommitmentConflict {
  sourceType: CommitmentSourceType;
  sourceId: string;
  sourceRef: string | null;
  commitmentDate: string;
  projectTargetDate: string;
  /** How many days earlier the tenant was promised than the Project target. */
  differenceDays: number;
  message: string;
}

export interface ReadinessEvaluationInput {
  lifecycleStatus: HandoverReadinessLifecycle;
  targetReadyDate: Date;
  originalTargetDate: Date;
  dateChangeCount: number;
  openHighRiskCount: number;
  commitments: CustomerCommitment[];
}

export interface ReadinessEvaluation {
  status: HandoverDerivedStatus;
  daysRemaining: number;
  /** Days the current target sits after the original target (negative = pulled in). */
  delayDays: number;
  dateChangeCount: number;
  deadlineLevel: HandoverDeadlineLevel;
  slippage: boolean;
  openHighRiskCount: number;
  /** Earliest live tenant commitment that is earlier than the Project target. */
  conflict: CommitmentConflict | null;
  /** Earliest live tenant commitment regardless of conflict (for display). */
  earliestCommitment: { sourceType: CommitmentSourceType; sourceId: string; sourceRef: string | null; commitmentDate: string } | null;
  riskFlags: HandoverRiskFlag[];
}

export const COMMITMENT_CONFLICT_MESSAGE =
  'Ngày cam kết bàn giao cho khách sớm hơn ngày Ban dự án dự kiến bàn giao mặt bằng.';

/**
 * Deterministic, side-effect-free. `today` is always injected so the
 * scheduler, API and tests evaluate the same record identically.
 *
 * Semantics:
 * - CONFIRMED / CANCELLED are authoritative lifecycle states (persisted).
 * - OVERDUE: tracking and the target date is in the past.
 * - AT_RISK: tracking and any of: <= criticalDays left, date slippage,
 *   an OPEN HIGH risk, a customer-commitment conflict.
 * - TRACKING otherwise (the <= warningDays window is a WARNING deadline level,
 *   not by itself an at-risk status).
 */
export function evaluateReadiness(input: ReadinessEvaluationInput, today: Date): ReadinessEvaluation {
  const daysRemaining = daysBetween(today, input.targetReadyDate);
  const delayDays = daysBetween(input.originalTargetDate, input.targetReadyDate);
  const live = input.lifecycleStatus === HandoverReadinessLifecycle.TRACKING;

  const slippage = input.dateChangeCount >= HANDOVER_POLICY.slippageMinChanges
    || delayDays > HANDOVER_POLICY.slippageMaxDelayDays;

  const sorted = [...input.commitments].sort((a, b) => a.commitmentDate.getTime() - b.commitmentDate.getTime());
  const earliest = sorted[0] ?? null;
  const conflicting = sorted.find((c) => c.commitmentDate.getTime() < input.targetReadyDate.getTime()) ?? null;
  const conflict: CommitmentConflict | null = conflicting
    ? {
      sourceType: conflicting.sourceType,
      sourceId: conflicting.sourceId,
      sourceRef: conflicting.sourceRef,
      commitmentDate: formatBusinessDate(conflicting.commitmentDate)!,
      projectTargetDate: formatBusinessDate(input.targetReadyDate)!,
      differenceDays: daysBetween(conflicting.commitmentDate, input.targetReadyDate),
      message: COMMITMENT_CONFLICT_MESSAGE,
    }
    : null;

  let deadlineLevel: HandoverDeadlineLevel = 'NONE';
  if (live) {
    if (daysRemaining < 0) deadlineLevel = 'OVERDUE';
    else if (daysRemaining <= HANDOVER_POLICY.criticalDays) deadlineLevel = 'CRITICAL';
    else if (daysRemaining <= HANDOVER_POLICY.warningDays) deadlineLevel = 'WARNING';
  }

  const riskFlags: HandoverRiskFlag[] = [];
  if (deadlineLevel === 'WARNING') riskFlags.push('DEADLINE_WARNING');
  if (deadlineLevel === 'CRITICAL') riskFlags.push('DEADLINE_CRITICAL');
  if (deadlineLevel === 'OVERDUE') riskFlags.push('OVERDUE');
  if (live && slippage) riskFlags.push('DATE_SLIPPAGE');
  if (live && input.openHighRiskCount > 0) riskFlags.push('HIGH_RISK_OPEN');
  if (live && conflict) riskFlags.push('COMMITMENT_CONFLICT');

  let status: HandoverDerivedStatus;
  if (input.lifecycleStatus === HandoverReadinessLifecycle.CONFIRMED) status = 'CONFIRMED';
  else if (input.lifecycleStatus === HandoverReadinessLifecycle.CANCELLED) status = 'CANCELLED';
  else if (deadlineLevel === 'OVERDUE') status = 'OVERDUE';
  else if (deadlineLevel === 'CRITICAL' || slippage || input.openHighRiskCount > 0 || conflict) status = 'AT_RISK';
  else status = 'TRACKING';

  return {
    status,
    daysRemaining,
    delayDays,
    dateChangeCount: input.dateChangeCount,
    deadlineLevel,
    slippage,
    openHighRiskCount: input.openHighRiskCount,
    conflict,
    earliestCommitment: earliest
      ? {
        sourceType: earliest.sourceType,
        sourceId: earliest.sourceId,
        sourceRef: earliest.sourceRef,
        commitmentDate: formatBusinessDate(earliest.commitmentDate)!,
      }
      : null,
    riskFlags,
  };
}

// ─── Reminder schedule ───────────────────────────────────────────────────────

export interface ReminderSlot {
  /** Stable identity segment: `D-30` ... `D0`, or `OVERDUE-W<n>`. */
  key: string;
  milestone: number | null;
  overdueWeek: number | null;
}

/**
 * Which reminder (if any) is due for a TRACKING record today. At most one slot
 * is ever returned: the tightest milestone window we are currently inside. A
 * record picked up late (tracking started 20 days out, or the job missed days)
 * therefore gets exactly one catch-up reminder, never a burst. The caller makes
 * delivery idempotent by combining this key with the target date.
 */
export function dueReminderSlot(daysRemaining: number): ReminderSlot | null {
  if (daysRemaining < 0) {
    const daysOverdue = -daysRemaining;
    const week = Math.floor((daysOverdue - 1) / HANDOVER_POLICY.overdueReminderIntervalDays);
    return { key: `OVERDUE-W${week}`, milestone: null, overdueWeek: week };
  }
  const windows = [...HANDOVER_POLICY.reminderMilestones].sort((a, b) => a - b);
  const milestone = windows.find((m) => m >= daysRemaining);
  if (milestone === undefined) return null;
  return { key: milestone === 0 ? 'D0' : `D-${milestone}`, milestone, overdueWeek: null };
}
