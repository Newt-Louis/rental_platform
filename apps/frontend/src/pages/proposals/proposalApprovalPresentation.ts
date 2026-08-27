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

export function canEditProposalDocument(status: string | undefined, canEdit: boolean) {
  return canEdit && status === 'DRAFT';
}

export function isScenarioScoreAuthoritative() {
  return false;
}
