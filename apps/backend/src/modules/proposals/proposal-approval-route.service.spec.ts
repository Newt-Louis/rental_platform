/**
 * The approval route of a Proposal (PROP-ROUTE-PREVIEW). Submit and the draft
 * Tờ trình work the route out the same way: active rules of the Mall, matched
 * against the Proposal, each signed by the person the rule names.
 */
import { Role } from '@prisma/client';
import { ProposalApprovalRouteService } from './proposal-approval-route.service';
import { ProposalDocumentService } from './document/proposal-document.service';

const rule = (code: string, stepOrder: number, approverRole: Role, approver: { id: string; fullName: string }, extra: Record<string, unknown> = {}) => ({
  code, stepName: code, stepOrder, approverRole, approverId: approver.id, approver: { fullName: approver.fullName },
  conditionType: 'DISCOUNT_PCT', operator: '>=', threshold: 0, isRequired: true, ...extra,
});
const M = { id: 'u-m', fullName: 'Tran Thi B' };
const D = { id: 'u-d', fullName: 'Le Van C' };
const C = { id: 'u-c', fullName: 'Pham CEO' };
const L = { id: 'u-l', fullName: 'Hoang Van E' };

function harness(opts: { rules?: any[]; users?: any[] } = {}) {
  const prisma: any = {
    proposal: {
      findUnique: jest.fn().mockResolvedValue({
        createdById: 'u-author', tenantId: null, discount: 7, rentFree: 0, rentPerSqm: 30, rentCurrency: 'USD',
        unit: { mallId: 'mall-1', categoryId: null, floorId: null, zoneId: null, category: null }, tenant: null,
      }),
    },
    invoice: { count: jest.fn().mockResolvedValue(0) },
    approvalPolicyRule: { findMany: jest.fn().mockResolvedValue(opts.rules ?? []) },
    user: {
      findMany: jest.fn(async ({ where }: any) => (opts.users ?? []).filter((u) => where.id.in.includes(u.id))),
    },
  };
  const categories: any = { validateProposedPrice: jest.fn() };
  return { prisma, service: new ProposalApprovalRouteService(prisma, categories) };
}

const active = (id: string, role: Role) => ({ id, role, isActive: true, deletedAt: null, mallAccess: [{ id: 'a' }] });

describe('ProposalApprovalRouteService.preview', () => {
  it('PROP-ROUTE-PREVIEW-003 lists every matching step in order, named with the person each rule names', async () => {
    const { service, prisma } = harness({
      rules: [
        rule('LEGAL', 60, Role.LEGAL, L),
        rule('MANAGER', 10, Role.LEASING_MANAGER, M),
        rule('DIRECTOR_DISCOUNT', 20, Role.MALL_DIRECTOR, D, { isRequired: false, operator: '>', threshold: 5 }),
        rule('CEO_DISCOUNT', 30, Role.CEO, C, { isRequired: false, operator: '>', threshold: 10 }),
      ].sort((a, b) => a.stepOrder - b.stepOrder),
      users: [active('u-m', Role.LEASING_MANAGER), active('u-d', Role.MALL_DIRECTOR), active('u-l', Role.LEGAL)],
    });

    const preview = await service.preview('prop-1');

    expect(prisma.approvalPolicyRule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, mallId: 'mall-1' } }));
    expect(preview.policyConfigured).toBe(true);
    expect(preview.issues).toEqual([]);
    // Discount 7%: the Director rule (> 5) matches, the CEO rule (> 10) does not.
    expect(preview.steps).toEqual([
      { stepOrder: 1, stepName: 'MANAGER', approverRole: Role.LEASING_MANAGER, approverId: 'u-m', approverName: 'Tran Thi B' },
      { stepOrder: 2, stepName: 'DIRECTOR_DISCOUNT', approverRole: Role.MALL_DIRECTOR, approverId: 'u-d', approverName: 'Le Van C' },
      { stepOrder: 3, stepName: 'LEGAL', approverRole: Role.LEGAL, approverId: 'u-l', approverName: 'Hoang Van E' },
    ]);
  });

  it('PROP-ROUTE-PREVIEW-004 shows what would block submit: the author as approver, or a locked approver', async () => {
    const { service } = harness({
      rules: [rule('MANAGER', 10, Role.LEASING_MANAGER, { id: 'u-author', fullName: 'Người lập' }), rule('LEGAL', 60, Role.LEGAL, L)],
      users: [active('u-author', Role.LEASING_MANAGER), { ...active('u-l', Role.LEGAL), isActive: false }],
    });
    const preview = await service.preview('prop-1');
    expect(preview.steps.map((s) => s.approverName)).toEqual(['Người lập', 'Hoang Van E']);
    expect(preview.issues).toEqual([
      { stepOrder: 1, stepName: 'MANAGER', reason: 'SELF_APPROVAL' },
      { stepOrder: 2, stepName: 'LEGAL', reason: 'APPROVER_INACTIVE' },
    ]);
  });

  it('PROP-ROUTE-PREVIEW-005 a Mall with no active rules is reported, not invented', async () => {
    const { service } = harness({ rules: [] });
    const preview = await service.preview('prop-1');
    expect(preview).toEqual(expect.objectContaining({ policyConfigured: false, steps: [], issues: [{ stepOrder: null, stepName: null, reason: 'NO_ACTIVE_POLICY' }] }));
  });
});

describe('ProposalDocumentService — draft approval block', () => {
  function documents(status: string, preview: any) {
    const service: any = new ProposalDocumentService(
      { proposal: { findUnique: jest.fn().mockResolvedValue({ status, approvalWorkflow: null }) } } as any,
      { preview } as any,
    );
    service.getLiveDocument = jest.fn().mockResolvedValue({ proposalId: 'prop-1', approval: { state: 'NOT_SUBMITTED', steps: [] }, warnings: [], warningCodes: [] });
    return service as ProposalDocumentService;
  }

  it('PROP-ROUTE-PREVIEW-006 a DRAFT document carries the expected route; nothing is a decision', async () => {
    const preview = jest.fn().mockResolvedValue({
      evaluatedAt: '2026-09-16T00:00:00.000Z', policyConfigured: true, issues: [],
      steps: [{ stepOrder: 1, stepName: 'Finance Review', approverRole: 'FINANCE', approverId: 'u-f', approverName: 'Pham Thi D' }],
    });
    const doc = await documents('DRAFT', preview).getDocument('prop-1');
    expect(preview).toHaveBeenCalledWith('prop-1');
    expect(doc.approval).toEqual({
      state: 'NOT_SUBMITTED',
      steps: [expect.objectContaining({ stepName: 'Finance Review', approverName: 'Pham Thi D', status: 'PENDING', presentation: 'EXPECTED_APPROVER', identitySource: 'ASSIGNED_APPROVER', decidedAt: null })],
      preview: { evaluatedAt: '2026-09-16T00:00:00.000Z', policyConfigured: true, issues: [] },
    });
  });

  it('PROP-ROUTE-PREVIEW-007 a failing preview never hides the draft document', async () => {
    const doc = await documents('DRAFT', jest.fn().mockRejectedValue(new Error('rules unavailable'))).getDocument('prop-1');
    expect(doc.approval).toEqual({ state: 'NOT_SUBMITTED', steps: [] });
  });

  it('PROP-ROUTE-PREVIEW-008 a submitted Proposal never gets a preview in place of its real workflow', async () => {
    const preview = jest.fn();
    const doc = await documents('SUBMITTED', preview).getDocument('prop-1');
    expect(preview).not.toHaveBeenCalled();
    expect(doc.warningCodes).toContain('LEGACY_SUBMISSION_UNVERSIONED');
  });
});
