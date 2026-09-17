/**
 * A workflow detached by a revision no longer decides its Proposal
 * (PROP-REVISE-008). Its outcome event can still arrive late through the
 * outbox; it must not pull a re-opened DRAFT to APPROVED or REJECTED.
 */
import { ProposalsService } from './proposals.service';

function service(bound: boolean) {
  const prisma: any = {
    approvalWorkflow: { findFirst: jest.fn().mockResolvedValue(bound ? { id: 'wf-1' } : null), findUnique: jest.fn().mockResolvedValue({ documentVersionId: 'dv-1' }) },
    proposal: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
    proposalDocumentVersion: { updateMany: jest.fn() },
  };
  const svc = new (ProposalsService as any)(prisma, {}, {}, {}, { create: jest.fn() }, {}, {}, { increment: jest.fn() }, {}, {}, {}, {}, {}) as ProposalsService;
  (svc as any).handleProposalFullyApproved = jest.fn();
  return { svc, prisma };
}

describe('Proposal outcome events only apply to the bound workflow', () => {
  it.each([
    ['onApprovalWorkflowCompleted', 'APPROVED'],
    ['onApprovalWorkflowRejected', 'REJECTED'],
  ] as const)('%s ignores a workflow detached by a revision', async (handler, _status) => {
    const { svc, prisma } = service(false);
    await (svc as any)[handler]({ workflowId: 'wf-old', entityType: 'PROPOSAL', entityId: 'prop-1' });
    expect(prisma.approvalWorkflow.findFirst).toHaveBeenCalledWith({ where: { id: 'wf-old', proposalId: 'prop-1' }, select: { id: true } });
    expect(prisma.proposal.update).not.toHaveBeenCalled();
    expect(prisma.proposalDocumentVersion.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['onApprovalWorkflowCompleted', 'APPROVED'],
    ['onApprovalWorkflowRejected', 'REJECTED'],
  ] as const)('%s still applies the outcome of the bound workflow', async (handler, status) => {
    const { svc, prisma } = service(true);
    await (svc as any)[handler]({ workflowId: 'wf-1', entityType: 'PROPOSAL', entityId: 'prop-1' });
    expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 'prop-1' }, data: { status } });
    expect(prisma.proposalDocumentVersion.updateMany).toHaveBeenCalledWith({ where: { id: 'dv-1', status: 'SUBMITTED' }, data: { status } });
  });
});
