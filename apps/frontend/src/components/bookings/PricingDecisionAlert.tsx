import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { formatMoneyWithCode } from '@/lib/currency';
import type { CurrencyCode } from '@/types';

/**
 * CR-BOOKING-PRICE-APPROVAL-ALWAYS-WARN-004 — the one place a pricing decision
 * is rendered.
 *
 * Every booking screen shows the same decision the same way. Previously the
 * only feedback about a price was the booking silently landing in a PENDING
 * state after it had already been created, and a price that needed nothing
 * looked identical to a price nobody could evaluate.
 *
 * This component renders, it does not decide. The server owns every field here
 * — basis, deviation, approval, signers. The frontend must never work out on
 * its own whether approval is needed, or it will eventually disagree with the
 * steps the server actually wrote.
 */

export type PricingDecisionStatus =
  | 'NOT_REQUIRED'
  | 'ROUTED'
  | 'POLICY_NOT_CONFIGURED'
  | 'POLICY_AMBIGUOUS'
  | 'PRICING_REFERENCE_MISSING'
  | 'CURRENCY_MISMATCH';

export interface PricingDecisionStep {
  stepOrder: number;
  stepName: string;
  approverRole: string;
  approverId: string;
  approverName?: string | null;
  policyRuleCode: string;
  policyName: string;
}

export interface PricingDecision {
  status: PricingDecisionStatus;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  requiresAcknowledgement: boolean;
  blocking: boolean;
  basis: 'CATEGORY_BAND' | 'UNIT_BASE_RENT' | 'NONE';
  proposedRentPerSqm: number;
  reference: {
    minRentPerSqm?: number | null;
    maxRentPerSqm?: number | null;
    unitBaseRentPerSqm?: number | null;
    currency: CurrencyCode;
    referenceCurrency?: CurrencyCode | null;
  };
  deviationPercent: number | null;
  approval: {
    required: boolean;
    policyConfigured: boolean;
    steps: PricingDecisionStep[];
  };
  warningCode: string;
  message: string;
  evaluatedAt: string;
  fingerprint: string;
}

const TONE = {
  INFO: {
    box: 'border-blue-200 bg-blue-50',
    title: 'text-blue-800',
    body: 'text-blue-700',
    Icon: Info,
    iconClass: 'text-blue-500',
  },
  WARNING: {
    box: 'border-amber-300 bg-amber-50',
    title: 'text-amber-900',
    body: 'text-amber-800',
    Icon: AlertTriangle,
    iconClass: 'text-amber-500',
  },
  ERROR: {
    box: 'border-red-300 bg-red-50',
    title: 'text-red-900',
    body: 'text-red-800',
    Icon: XCircle,
    iconClass: 'text-red-500',
  },
} as const;

const TITLE: Record<PricingDecisionStatus, string> = {
  NOT_REQUIRED: 'Kiểm tra giá thuê hoàn tất',
  ROUTED: 'Cảnh báo giá thuê',
  POLICY_NOT_CONFIGURED: 'Chưa cấu hình quy trình duyệt giá',
  POLICY_AMBIGUOUS: 'Cấu hình quy trình duyệt chưa hợp lệ',
  PRICING_REFERENCE_MISSING: 'Chưa có giá tham chiếu',
  CURRENCY_MISMATCH: 'Không thể đối chiếu giá',
};

const BASIS_LABEL: Record<PricingDecision['basis'], string> = {
  CATEGORY_BAND: 'Khung giá ngành hàng',
  UNIT_BASE_RENT: 'Giá thuê cơ bản của mặt bằng',
  NONE: 'Không có nguồn tham chiếu',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="shrink-0 text-[11px] opacity-70">{label}</span>
      <span className="text-right text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function PricingDecisionAlert({
  decision,
  loading,
  acknowledged,
  onAcknowledgeChange,
  className,
}: {
  decision?: PricingDecision | null;
  loading?: boolean;
  /** Omit the pair to render read-only, e.g. on a detail sheet. */
  acknowledged?: boolean;
  onAcknowledgeChange?: (next: boolean) => void;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500 ${className ?? ''}`}>
        <Loader2 size={14} className="animate-spin" />
        Đang kiểm tra giá theo khung giá và quy trình phê duyệt...
      </div>
    );
  }

  if (!decision) return null;

  const tone = TONE[decision.severity];
  const { Icon } = tone;
  const currency = decision.reference.currency;
  const money = (v?: number | null) => (v == null ? '—' : `${formatMoneyWithCode(v, currency)}/m²`);

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tone.box} ${className ?? ''}`}>
      <div className="flex items-start gap-2">
        <Icon size={15} className={`mt-0.5 shrink-0 ${tone.iconClass}`} />
        <div className="min-w-0 flex-1">
          <div className={`text-xs font-semibold ${tone.title}`}>{TITLE[decision.status]}</div>
          <p className={`mt-1 text-xs leading-relaxed ${tone.body}`}>{decision.message}</p>

          {decision.basis !== 'NONE' && (
            <div className={`mt-2 rounded-md bg-white/60 px-2.5 py-1.5 ${tone.body}`}>
              <Row label="Cơ sở đối chiếu" value={BASIS_LABEL[decision.basis]} />
              {decision.reference.minRentPerSqm != null && (
                <Row label="Giá sàn" value={money(decision.reference.minRentPerSqm)} />
              )}
              {decision.reference.maxRentPerSqm != null && (
                <Row label="Giá trần" value={money(decision.reference.maxRentPerSqm)} />
              )}
              {decision.reference.unitBaseRentPerSqm != null && (
                <Row label="Giá thuê cơ bản" value={money(decision.reference.unitBaseRentPerSqm)} />
              )}
              <Row label="Giá đề xuất" value={money(decision.proposedRentPerSqm)} />
              {decision.deviationPercent != null && decision.deviationPercent > 0 && (
                <Row
                  label="Chênh lệch"
                  value={`${decision.deviationPercent.toFixed(2).replace('.', ',')}%`}
                />
              )}
            </div>
          )}

          {/* Only rendered when the server chose to disclose the signers. */}
          {decision.approval.steps.length > 0 && (
            <div className="mt-2">
              <div className={`text-[11px] font-medium ${tone.title}`}>Quy trình dự kiến:</div>
              <ol className={`mt-1 space-y-0.5 text-xs ${tone.body}`}>
                {decision.approval.steps.map((step) => (
                  <li key={`${step.stepOrder}-${step.approverId}`} className="flex gap-1.5">
                    <span className="opacity-60">{step.stepOrder}.</span>
                    <span>
                      {step.approverName ?? step.stepName}
                      <span className="opacity-60"> — {step.stepName}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {decision.status === 'NOT_REQUIRED' && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-blue-600">
              <CheckCircle2 size={12} /> Không yêu cầu phê duyệt giá
            </div>
          )}

          {decision.requiresAcknowledgement && onAcknowledgeChange && (
            <label className={`mt-2.5 flex cursor-pointer items-start gap-2 text-xs ${tone.title}`}>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!!acknowledged}
                onChange={(e) => onAcknowledgeChange(e.target.checked)}
              />
              <span>Tôi đã đọc và xác nhận thông tin giá ở trên</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
