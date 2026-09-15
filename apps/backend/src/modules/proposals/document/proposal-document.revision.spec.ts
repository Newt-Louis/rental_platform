/**
 * Re-opening a Tờ trình (PROP-REVISE). A Proposal can be taken back for changes
 * while it waits for approval, after approval as long as no contract exists,
 * and after a rejection; never once it became a contract.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProposalDocumentService } from './proposal-document.service';

type Status = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CONVERTED';

function harness(opts: {
  status: Status;
  workflowStatus?: 'IN_PROGRESS' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  contract?: boolean;
  pendingApprovers?: string[];
  noWorkflow?: boolean;
}) {
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ status: opts.status, proposalNumber: 'PRO-1' }]),
    contract: { findFirst: jest.fn().mockResolvedValue(opts.contract ? { contractNumber: 'HD-1' } : null) },
    approvalWorkflow: {
      findUnique: jest.fn().mockResolvedValue(opts.noWorkflow ? null : {
        id: 'wf-1',
        status: opts.workflowStatus ?? 'IN_PROGRESS',
        documentVersionId: 'dv-1',
        steps: (opts.pendingApprovers ?? []).map((approverId) => ({ approverId })),
      }),
      update: jest.fn(),
    },
    approvalStep: { updateMany: jest.fn().mockResolvedValue({ count: (opts.pendingApprovers ?? []).length }) },
    proposalDocumentVersion: { updateMany: jest.fn() },
    notification: { create: jest.fn() },
    proposal: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn((fn: any, options: any) => { prisma.lastOptions = options; return fn(tx); }) };
  return { tx, prisma, service: new ProposalDocumentService(prisma) };
}

const REASON = 'Khách thuê đổi diện tích';
const code = (e: any) => e?.getResponse?.()?.code;
const noWrites = (tx: any) => {
  expect(tx.approvalWorkflow.update).not.toHaveBeenCalled();
  expect(tx.approvalStep.updateMany).not.toHaveBeenCalled();
  expect(tx.proposalDocumentVersion.updateMany).not.toHaveBeenCalled();
  expect(tx.proposal.update).not.toHaveBeenCalled();
  expect(tx.auditLog.create).not.toHaveBeenCalled();
};

describe('ProposalDocumentService.startRevision', () => {
  it.each(['SUBMITTED', 'UNDER_REVIEW'] as const)('PROP-REVISE-001 withdraws a %s submission: pending steps skipped, workflow WITHDRAWN and detached, version superseded', async (status) => {
    const { tx, prisma, service } = harness({ status, pendingApprovers: ['u-finance', 'u-legal', 'u-finance'] });

    const result = await service.startRevision('prop-1', 'u-author', `  ${REASON}  `);

    expect(result).toEqual({ proposalId: 'prop-1', previousStatus: status, previousDocumentVersionId: 'dv-1', skippedSteps: 3 });
    expect(prisma.lastOptions).toEqual({ isolationLevel: 'Serializable' });
    expect(tx.approvalStep.updateMany).toHaveBeenCalledWith({ where: { workflowId: 'wf-1', status: 'PENDING' }, data: { status: 'SKIPPED' } });
    expect(tx.approvalWorkflow.update).toHaveBeenCalledWith({ where: { id: 'wf-1' }, data: { status: 'WITHDRAWN', proposalId: null } });
    expect(tx.proposalDocumentVersion.updateMany).toHaveBeenCalledWith({ where: { id: 'dv-1', status: { in: ['SUBMITTED', 'APPROVED'] } }, data: { status: 'SUPERSEDED' } });
    expect(tx.proposal.update).toHaveBeenCalledWith({ where: { id: 'prop-1' }, data: { status: 'DRAFT' } });
    // Each waiting approver is told once.
    expect(tx.notification.create.mock.calls.map((c: any) => c[0].data.userId).sort()).toEqual(['u-finance', 'u-legal']);
    expect(tx.notification.create.mock.calls[0][0].data.body).toContain(REASON);
    const audit = JSON.parse(tx.auditLog.create.mock.calls[0][0].data.payload);
    expect(audit).toEqual(expect.objectContaining({ previousStatus: status, reason: REASON, previousWorkflowId: 'wf-1', skippedSteps: 3 }));
  });

  it('PROP-REVISE-002 replaces an APPROVED version with no contract: workflow kept APPROVED but detached, version superseded, no step touched', async () => {
    const { tx, service } = harness({ status: 'APPROVED', workflowStatus: 'APPROVED' });

    await service.startRevision('prop-1', 'u-author', REASON);

    expect(tx.approvalWorkflow.update).toHaveBeenCalledWith({ where: { id: 'wf-1' }, data: { proposalId: null } });
    expect(tx.approvalStep.updateMany).not.toHaveBeenCalled();
    expect(tx.proposalDocumentVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'SUPERSEDED' } }));
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.proposal.update).toHaveBeenCalledWith({ where: { id: 'prop-1' }, data: { status: 'DRAFT' } });
  });

  it('PROP-REVISE-003 a REJECTED Proposal restarts without a reason and its rejected version keeps REJECTED', async () => {
    const { tx, service } = harness({ status: 'REJECTED', workflowStatus: 'REJECTED' });

    await service.startRevision('prop-1', 'u-author');

    expect(tx.approvalWorkflow.update).toHaveBeenCalledWith({ where: { id: 'wf-1' }, data: { proposalId: null } });
    expect(tx.approvalWorkflow.update.mock.calls[0][0].data).not.toHaveProperty('documentVersionId');
    expect(tx.proposalDocumentVersion.updateMany).not.toHaveBeenCalled();
    expect(tx.proposal.update).toHaveBeenCalledWith({ where: { id: 'prop-1' }, data: { status: 'DRAFT' } });
  });

  it.each([
    [{ status: 'CONVERTED' as Status }, 'PROPOSAL_REVISION_NOT_ALLOWED'],
    [{ status: 'APPROVED' as Status, workflowStatus: 'APPROVED' as const, contract: true }, 'PROPOSAL_REVISION_NOT_ALLOWED'],
    [{ status: 'DRAFT' as Status }, 'PROPOSAL_ALREADY_DRAFT'],
  ])('PROP-REVISE-004 refuses %j with %s and writes nothing', async (opts, expected) => {
    const { tx, service } = harness(opts);
    const error = await service.startRevision('prop-1', 'u-author', REASON).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(code(error)).toBe(expected);
    noWrites(tx);
  });

  it.each([
    ['SUBMITTED' as Status, undefined],
    ['SUBMITTED' as Status, '   ok '],
    ['APPROVED' as Status, ''],
  ])('PROP-REVISE-005 withdrawing or replacing an approval requires a reason (%s, %j)', async (status, reason) => {
    const { tx, service } = harness({ status, workflowStatus: status === 'APPROVED' ? 'APPROVED' : 'IN_PROGRESS' });
    const error = await service.startRevision('prop-1', 'u-author', reason).catch((e) => e);
    expect(code(error)).toBe('PROPOSAL_REVISION_REASON_REQUIRED');
    noWrites(tx);
  });

  it.each([
    ['SUBMITTED' as Status, 'APPROVED' as const],
    ['SUBMITTED' as Status, 'REJECTED' as const],
    ['APPROVED' as Status, 'IN_PROGRESS' as const],
  ])('PROP-REVISE-006 a %s Proposal whose workflow already settled as %s asks for a reload instead of guessing', async (status, workflowStatus) => {
    const { tx, service } = harness({ status, workflowStatus, pendingApprovers: ['u-legal'] });
    const error = await service.startRevision('prop-1', 'u-author', REASON).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(code(error)).toBe('PROPOSAL_REVISION_CONFLICT');
    noWrites(tx);
  });

  it('PROP-REVISE-007 a Serializable conflict with a concurrent approval decision becomes a 409', async () => {
    const prisma: any = { $transaction: jest.fn().mockRejectedValue(Object.assign(new Error('write conflict'), { code: 'P2034' })) };
    const error = await new ProposalDocumentService(prisma).startRevision('prop-1', 'u-author', REASON).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(code(error)).toBe('PROPOSAL_REVISION_CONFLICT');
  });
});
