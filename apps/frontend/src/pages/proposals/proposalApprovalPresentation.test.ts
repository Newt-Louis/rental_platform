import { describe, expect, it } from 'vitest';
import {
  canEditProposalDocument,
  getApprovalPosition,
  getContractHandoff,
  getProposalParty,
  getProposalRoleCapabilities,
  isScenarioScoreAuthoritative,
} from './proposalApprovalPresentation';
import viDeals from '@/locales/vi/deals.json';

describe('Golden Proposal & Approval presentation rules', () => {
  it('matches Proposal controller role capabilities without expanding access', () => {
    expect(getProposalRoleCapabilities('LEASING_EXECUTIVE')).toEqual({
      canEdit: true,
      canConvert: false,
      canDirectReject: false,
    });
    expect(getProposalRoleCapabilities('CEO')).toEqual({
      canEdit: false,
      canConvert: false,
      canDirectReject: false,
    });
  });

  it('only presents document editing for an authorized DRAFT Proposal', () => {
    expect(canEditProposalDocument('DRAFT', true)).toBe(true);
    expect(canEditProposalDocument('SUBMITTED', true)).toBe(false);
    expect(canEditProposalDocument('DRAFT', false)).toBe(false);
  });

  it('derives the current sequential approval step from authoritative statuses', () => {
    const position = getApprovalPosition([
      { id: 'step-2', stepOrder: 2, status: 'PENDING' },
      { id: 'step-1', stepOrder: 1, status: 'APPROVED' },
      { id: 'step-3', stepOrder: 3, status: 'PENDING' },
    ]);
    expect(position.state).toBe('CURRENT');
    expect(position.step.id).toBe('step-2');
    expect(position.total).toBe(3);
  });

  it('does not treat a later pending step as current before prior approval', () => {
    const position = getApprovalPosition([
      { id: 'step-1', stepOrder: 1, status: 'PENDING' },
      { id: 'step-2', stepOrder: 2, status: 'PENDING' },
    ]);
    expect(position.step.id).toBe('step-1');
  });

  it('presents automatic Contract handoff and Tenant exception factually', () => {
    expect(getContractHandoff({ status: 'APPROVED', tenantId: 'tenant-1' }).state).toBe('AUTOMATIC_PROCESSING');
    expect(getContractHandoff({ status: 'APPROVED', tenant: { id: 'tenant-1' } }).state).toBe('AUTOMATIC_PROCESSING');
    expect(getContractHandoff({ status: 'APPROVED', tenantId: null }).state).toBe('TENANT_REQUIRED');
    expect(getContractHandoff({ status: 'CONVERTED', contract: { id: 'contract-1' } }).state).toBe('CONTRACT_CREATED');
  });

  it('uses explicit party provenance instead of an unlabeled fallback', () => {
    expect(getProposalParty({ tenant: { brandName: 'Tenant A' } })).toEqual({ type: 'TENANT', name: 'Tenant A' });
    expect(getProposalParty({ lead: { brandName: 'Lead B' } })).toEqual({ type: 'LEAD', name: 'Lead B' });
  });

  it('never presents the undefined Scenario score as authoritative', () => {
    expect(isScenarioScoreAuthoritative()).toBe(false);
  });

  it('provides business-facing Vietnamese labels for approval role enums', () => {
    expect(viDeals.approvals.roles.LEASING_MANAGER).toBe('Quản lý Leasing');
    expect(viDeals.approvals.roles.MALL_DIRECTOR).toBe('Giám đốc TTTM');
    expect(viDeals.approvals.roles.FINANCE).toBe('Tài chính');
    expect(viDeals.approvals.roles.LEGAL).toBe('Pháp chế');
    expect(viDeals.approvals.roles.TENANT).toBe('Khách thuê');
  });

  it('provides complete Vietnamese labels for visible Proposal fields and actions', () => {
    expect(viDeals.proposals.fields.party).toBe('Khách thuê / thương hiệu');
    expect(viDeals.proposals.fields.floorUnknown).toBe('Chưa xác định tầng');
    expect(viDeals.proposals.actions.editDoc).toBe('Chỉnh sửa tờ trình');
  });
});
