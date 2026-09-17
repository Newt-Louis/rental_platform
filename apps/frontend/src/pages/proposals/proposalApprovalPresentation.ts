import type { Role } from '@/types';
import type { ERPTone } from '@/lib/erp-tones';

export const PROPOSAL_STATUS_TONES: Record<string, ERPTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  CONVERTED: 'brand',
};

export const WORKFLOW_STATUS_TONES: Record<string, ERPTone> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

const PROPOSAL_EDIT_ROLES: Role[] = ['ADMIN', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR'];
const PROPOSAL_CONVERT_ROLES: Role[] = ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR'];
const PROPOSAL_DIRECT_REJECT_ROLES: Role[] = ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR'];

export function getProposalRoleCapabilities(role?: Role) {
  return {
    canEdit: !!role && PROPOSAL_EDIT_ROLES.includes(role),
    canConvert: !!role && PROPOSAL_CONVERT_ROLES.includes(role),
    canDirectReject: !!role && PROPOSAL_DIRECT_REJECT_ROLES.includes(role),
  };
}

export function getProposalParty(proposal: any) {
  if (proposal?.tenant) return { type: 'TENANT' as const, name: proposal.tenant.brandName ?? proposal.tenant.companyName ?? '—' };
  if (proposal?.lead) return { type: 'LEAD' as const, name: proposal.lead.brandName ?? proposal.lead.company ?? '—' };
  if (proposal?.booking?.lead) return { type: 'LEAD' as const, name: proposal.booking.lead.brandName ?? '—' };
  if (proposal?.booking?.customer) return { type: 'CUSTOMER' as const, name: proposal.booking.customer.brandName ?? proposal.booking.customer.companyName ?? '—' };
  return { type: 'UNKNOWN' as const, name: '—' };
}

export function getApprovalPosition(steps: any[] = []) {
  const ordered = [...steps].sort((a, b) => Number(a.stepOrder) - Number(b.stepOrder));
  const rejected = ordered.find((step) => step.status === 'REJECTED');
  if (rejected) return { state: 'REJECTED' as const, step: rejected, current: rejected.stepOrder, total: ordered.length };

  const current = ordered.find((step, index) =>
    step.status === 'PENDING' && ordered.slice(0, index).every((prior) => prior.status === 'APPROVED'),
  );
  if (current) return { state: 'CURRENT' as const, step: current, current: current.stepOrder, total: ordered.length };

  if (ordered.length && ordered.every((step) => step.status === 'APPROVED')) {
    return { state: 'COMPLETED' as const, step: ordered[ordered.length - 1], current: ordered.length, total: ordered.length };
  }

  return { state: 'UNAVAILABLE' as const, step: undefined, current: 0, total: ordered.length };
}

export function getContractHandoff(proposal: any) {
  if (proposal?.contract) return { state: 'CONTRACT_CREATED' as const, contract: proposal.contract };
  if (proposal?.status === 'APPROVED' && !proposal?.tenantId && !proposal?.tenant) return { state: 'TENANT_REQUIRED' as const };
  if (proposal?.status === 'APPROVED') return { state: 'AUTOMATIC_PROCESSING' as const };
  if (proposal?.status === 'CONVERTED') return { state: 'CONVERTED_WITHOUT_LINK' as const };
  return { state: 'NOT_READY' as const };
}

export type RevisionMode = 'WITHDRAW' | 'REPLACE_APPROVED' | 'AFTER_REJECTION';

/**
 * Whether the Tờ trình can be re-opened for changes, and how. Mirrors the API:
 * a pending submission is withdrawn, an approved one without a contract is
 * replaced, a rejected one restarts; a Proposal with a contract never re-opens.
 */
export function getRevisionMode(proposal: any, canEdit: boolean): RevisionMode | null {
  if (!canEdit || !proposal || proposal.contract) return null;
  if (proposal.status === 'SUBMITTED' || proposal.status === 'UNDER_REVIEW') return 'WITHDRAW';
  if (proposal.status === 'APPROVED') return 'REPLACE_APPROVED';
  if (proposal.status === 'REJECTED') return 'AFTER_REJECTION';
  return null;
}

export const REVISION_COPY: Record<RevisionMode, { action: string; title: string; description: string; reasonRequired: boolean; confirm: string }> = {
  WITHDRAW: {
    action: 'Thu hồi & lập lại tờ trình',
    title: 'Thu hồi tờ trình đang chờ duyệt',
    description: 'Các bước chưa duyệt sẽ bị huỷ và người duyệt được thông báo. Proposal trở về bản nháp để chỉnh sửa và phải trình duyệt lại từ đầu. Chữ ký đã có vẫn được lưu trong lịch sử phiên bản cũ.',
    reasonRequired: true,
    confirm: 'Thu hồi và lập lại',
  },
  REPLACE_APPROVED: {
    action: 'Lập lại tờ trình',
    title: 'Lập lại tờ trình đã được duyệt',
    description: 'Phiên bản đã duyệt sẽ bị thay thế và không còn dùng để gửi ra ngoài hay chuyển hợp đồng. Proposal trở về bản nháp và phải được phê duyệt lại toàn bộ.',
    reasonRequired: true,
    confirm: 'Thay thế và lập lại',
  },
  AFTER_REJECTION: {
    action: 'Tạo bản tờ trình mới',
    title: 'Tạo bản tờ trình mới',
    description: 'Proposal trở về bản nháp để chỉnh sửa theo ý kiến từ chối và trình duyệt lại.',
    reasonRequired: false,
    confirm: 'Tạo bản mới',
  },
};

export function canEditProposalDocument(status: string | undefined, canEdit: boolean) {
  return canEdit && status === 'DRAFT';
}

export function isScenarioScoreAuthoritative() {
  return false;
}
