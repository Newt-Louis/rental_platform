import { approvalsApi, proposalsApi } from '@/api';

/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 — the one way any screen obtains a Tờ trình
 * PDF: the server-rendered official document from GET /proposals/:id/pdf.
 *
 * The editor used to print its own HTML through window.open + outerHTML, which
 * lost every Tailwind class and could differ from what approvers downloaded.
 * The editor, the proposal list and the approval screen all call this now.
 */
export async function exportOfficialProposalPdf(
  proposal: {
    id: string;
    proposalNumber: string;
    documentVersionId?: string | null;
    versionNumber?: number | null;
    /** From the approval screen: fetched through the workflow, so every approver can open it. */
    approvalWorkflowId?: string | null;
  },
  mode: 'download' | 'open' = 'download',
): Promise<void> {
  // A submitted document is always requested by its exact version, so an
  // approver can never be handed today's mutable Proposal instead.
  const blob: Blob = proposal.approvalWorkflowId
    ? await approvalsApi.exportWorkflowDocumentPdf(proposal.approvalWorkflowId)
    : proposal.documentVersionId
      ? await proposalsApi.exportVersionPdf(proposal.id, proposal.documentVersionId)
      : await proposalsApi.exportPdf(proposal.id);
  const url = URL.createObjectURL(blob);
  if (mode === 'open') {
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = `proposal-${proposal.proposalNumber}${proposal.versionNumber ? `-v${proposal.versionNumber}` : ''}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Business code of a failed proposal request (e.g. PROPOSAL_DOCUMENT_NOT_REVIEWED). */
export function proposalErrorCode(error: unknown): string | null {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

/** Structured routing issues the server returns with APPROVAL_* codes. */
export function proposalRoutingIssues(error: unknown): Array<{ stepOrder: number | null; stepName: string | null; reason: string }> {
  const errors = (error as { response?: { data?: { errors?: unknown } } })?.response?.data?.errors;
  return Array.isArray(errors) ? errors.filter((e) => e && typeof e === 'object' && 'reason' in e) as any : [];
}

export const SUBMIT_BLOCK_LABELS: Record<string, string> = {
  PROPOSAL_DOCUMENT_NOT_REVIEWED: 'Tờ trình chưa được xác nhận nội dung.',
  PROPOSAL_DOCUMENT_STALE: 'Dữ liệu Proposal đã thay đổi. Vui lòng kiểm tra lại tờ trình.',
  APPROVAL_ROUTING_SELF_CONFLICT: 'Quy trình phê duyệt đang giao người lập làm người duyệt — cần điều chỉnh cấu hình phê duyệt.',
  APPROVAL_STEP_UNASSIGNED: 'Quy trình phê duyệt còn bước chưa có người phụ trách — cần hoàn tất cấu hình.',
  APPROVAL_ROUTING_INVALID: 'Cấu hình người phê duyệt không hợp lệ — cần kiểm tra lại quy trình phê duyệt.',
};

export const ROUTING_REASON_LABELS: Record<string, string> = {
  STEP_UNASSIGNED: 'chưa có người phụ trách',
  SELF_APPROVAL: 'đang giao cho người lập Proposal',
  APPROVER_NOT_FOUND: 'người phê duyệt không còn tồn tại',
  APPROVER_INACTIVE: 'tài khoản người phê duyệt đang bị khoá',
  APPROVER_ROLE_NOT_ELIGIBLE: 'vai trò người phê duyệt không được phép duyệt',
  APPROVER_ROLE_CHANGED: 'vai trò người phê duyệt đã thay đổi so với cấu hình',
  APPROVER_NO_MALL_ACCESS: 'người phê duyệt không có quyền truy cập Mall này',
  NO_ACTIVE_POLICY: 'Mall chưa có quy tắc phê duyệt',
  NO_ACTIONABLE_STEP: 'không có bước phê duyệt nào áp dụng',
};

/** Server message for a failed proposal request, e.g. the stale-document gate. */
export function proposalErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}
