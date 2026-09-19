import api from '@/lib/axios';

/**
 * CR-UNIT-HANDOVER-READINESS -- Project -> Leasing/Operation handover readiness.
 * Status, risk flags and permissions all come from the server; the UI never
 * derives AT_RISK / OVERDUE or who may confirm on its own.
 */

export type HandoverDerivedStatus = 'TRACKING' | 'AT_RISK' | 'OVERDUE' | 'CONFIRMED' | 'CANCELLED';
export type HandoverRiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type HandoverRiskFlag =
  | 'DEADLINE_WARNING' | 'DEADLINE_CRITICAL' | 'OVERDUE' | 'DATE_SLIPPAGE' | 'HIGH_RISK_OPEN' | 'COMMITMENT_CONFLICT';

export interface HandoverCommitmentConflict {
  sourceType: 'PROPOSAL' | 'FITOUT_PROJECT';
  sourceId: string;
  sourceRef: string | null;
  commitmentDate: string;
  projectTargetDate: string;
  differenceDays: number;
  message: string;
}

export interface HandoverEvaluation {
  status: HandoverDerivedStatus;
  daysRemaining: number;
  delayDays: number;
  dateChangeCount: number;
  deadlineLevel: 'NONE' | 'WARNING' | 'CRITICAL' | 'OVERDUE';
  slippage: boolean;
  openHighRiskCount: number;
  conflict: HandoverCommitmentConflict | null;
  earliestCommitment: { sourceType: string; sourceId: string; sourceRef: string | null; commitmentDate: string } | null;
  riskFlags: HandoverRiskFlag[];
}

export interface HandoverUserRef { id: string; fullName: string }

export interface HandoverSummary {
  id: string;
  mallId: string;
  mallName: string;
  unitId: string;
  unitCode: string;
  unitName: string | null;
  floorName: string | null;
  lifecycleStatus: 'TRACKING' | 'CONFIRMED' | 'CANCELLED';
  status: HandoverDerivedStatus;
  /** Business dates, always `YYYY-MM-DD` -- render with fmtBusinessDate, never `new Date()`. */
  targetReadyDate: string;
  originalTargetDate: string;
  projectOwner: HandoverUserRef | null;
  projectOwnerName: string | null;
  recordedBy: HandoverUserRef;
  confirmedAt: string | null;
  confirmedBy: HandoverUserRef | null;
  confirmNote: string | null;
  version: number;
  evaluation: HandoverEvaluation;
}

export interface HandoverCapabilities {
  view: boolean;
  manage: boolean;
  riskManage: boolean;
  confirm: boolean;
  reopen: boolean;
}

export interface HandoverRisk {
  id: string;
  title: string;
  description: string | null;
  severity: HandoverRiskSeverity;
  status: 'OPEN' | 'RESOLVED';
  owner: HandoverUserRef | null;
  dueDate: string | null;
  createdAt: string;
  createdBy: HandoverUserRef;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface HandoverEvidence {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  caption: string | null;
  uploadedBy: HandoverUserRef;
  createdAt: string;
  confirmationEventId: string | null;
  downloadPath: string;
}

export interface HandoverTimelineEvent {
  id: string;
  eventType: string;
  occurredAt: string;
  actor: HandoverUserRef | null;
  reason: string | null;
  oldDate: string | null;
  newDate: string | null;
  riskId: string | null;
  metadata: Record<string, any> | null;
}

export interface HandoverDetail extends HandoverSummary {
  note: string | null;
  commitments: Array<{ sourceType: string; sourceId: string; sourceRef: string | null; commitmentDate: string }>;
  risks: HandoverRisk[];
  followers: Array<{ id: string; userId: string; fullName: string; role: string }>;
  evidence: HandoverEvidence[];
  stagedEvidenceCount: number;
  minConfirmationImages: number;
  timeline: HandoverTimelineEvent[];
  capabilities: HandoverCapabilities;
  isFollowing: boolean;
  sod: { canSelfConfirm: boolean; reason: string | null };
}

export interface UnitHandoverState {
  unit: { id: string; code: string; name: string | null; mallId: string; isActive: boolean; status: string };
  capabilities: HandoverCapabilities;
  canStart: boolean;
  readiness: HandoverDetail | null;
  cancelledHistory: Array<{ id: string; cancelledAt: string; cancelReason: string; originalTargetDate: string; targetReadyDate: string }>;
}

export interface HandoverKpis {
  tracking: number;
  dueWithin30: number;
  dueWithin7: number;
  overdue: number;
  atRisk: number;
  conflicts: number;
  highRisks: number;
  confirmed: number;
}

export interface HandoverList {
  items: HandoverSummary[];
  kpis: HandoverKpis;
  asOf: string;
}

export interface HandoverCandidate { id: string; fullName: string; role: string }

export const handoverReadinessApi = {
  getForUnit: (unitId: string): Promise<UnitHandoverState> =>
    api.get(`/spaces/units/${unitId}/handover-readiness`).then((r) => r.data),
  candidates: (unitId: string): Promise<HandoverCandidate[]> =>
    api.get(`/spaces/units/${unitId}/handover-readiness/candidates`).then((r) => r.data),
  start: (unitId: string, data: { targetReadyDate: string; projectOwnerId?: string; projectOwnerName?: string; note?: string }): Promise<HandoverDetail> =>
    api.post(`/spaces/units/${unitId}/handover-readiness`, data).then((r) => r.data),
  list: (mallId?: string | null): Promise<HandoverList> =>
    api.get('/handover-readiness', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  changeTargetDate: (id: string, data: { targetReadyDate: string; reason: string; expectedVersion?: number }): Promise<HandoverDetail> =>
    api.patch(`/handover-readiness/${id}/target-date`, data).then((r) => r.data),
  addRisk: (id: string, data: { title: string; description?: string; severity: HandoverRiskSeverity; ownerId?: string; dueDate?: string }): Promise<HandoverDetail> =>
    api.post(`/handover-readiness/${id}/risks`, data).then((r) => r.data),
  resolveRisk: (id: string, riskId: string, resolutionNote: string): Promise<HandoverDetail> =>
    api.post(`/handover-readiness/${id}/risks/${riskId}/resolve`, { resolutionNote }).then((r) => r.data),
  follow: (id: string, userId?: string): Promise<HandoverDetail> =>
    api.post(`/handover-readiness/${id}/followers`, userId ? { userId } : {}).then((r) => r.data),
  unfollow: (id: string, userId: string): Promise<HandoverDetail> =>
    api.delete(`/handover-readiness/${id}/followers/${userId}`).then((r) => r.data),
  uploadEvidence: (id: string, file: File, caption?: string): Promise<HandoverDetail> => {
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('caption', caption);
    return api.post(`/handover-readiness/${id}/evidence`, form).then((r) => r.data);
  },
  removeEvidence: (id: string, evidenceId: string): Promise<HandoverDetail> =>
    api.delete(`/handover-readiness/${id}/evidence/${evidenceId}`).then((r) => r.data),
  confirm: (id: string, note: string): Promise<HandoverDetail> =>
    api.post(`/handover-readiness/${id}/confirm`, { note }).then((r) => r.data),
  reopen: (id: string, reason: string): Promise<HandoverDetail> =>
    api.post(`/handover-readiness/${id}/reopen`, { reason }).then((r) => r.data),
  cancel: (id: string, reason: string): Promise<HandoverDetail> =>
    api.post(`/handover-readiness/${id}/cancel`, { reason }).then((r) => r.data),
};

/** `YYYY-MM-DD` -> `DD/MM/YYYY` by string manipulation only (no timezone involved). */
export function fmtBusinessDate(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** Whole-day difference between two `YYYY-MM-DD` business dates. */
export function businessDaysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function apiErrorMessage(error: any, fallback = 'Đã có lỗi xảy ra'): string {
  const msg = error?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join('; ');
  return typeof msg === 'string' && msg ? msg : fallback;
}
