/**
 * CR-PROPOSAL-DOCUMENT-FINALIZATION — PROP-SOD-01 and Proposal approval authority.
 *
 * Found at runtime: the Leasing Manager who prepared a Proposal approved step 1
 * of it, because a rule routed that step to them and nothing checked who the
 * preparer was. Authority is now the assignment on the step, and the preparer
 * is excluded whatever their role.
 */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { StepStatus, WorkflowStatus } from '@prisma/client';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';

const AUTHOR = 'user-author';
const MANAGER = 'user-manager';
const FINANCE = 'user-finance';

function harness(overrides: { steps?: any[]; workflow?: any } = {}) {
  const steps = overrides.steps ?? [
    { id: 'step-1', stepOrder: 1, status: StepStatus.PENDING, approverRole: 'LEASING_MANAGER', approverId: MANAGER },
    { id: 'step-2', stepOrder: 2, status: StepStatus.PENDING, approverRole: 'FINANCE', approverId: FINANCE },
  ];
  const workflow = {
    id: 'wf-1',
    status: WorkflowStatus.IN_PROGRESS,
    entityType: 'PROPOSAL',
    entityId: 'prop-1',
    documentVersionId: 'dv-1',
    proposal: { id: 'prop-1', createdById: AUTHOR },
    documentVersion: { id: 'dv-1', status: 'SUBMITTED', proposal: { id: 'prop-1', createdById: AUTHOR } },
    steps,
    ...overrides.workflow,
  };
  const tx: any = {
    approvalStep: {
      findUnique: jest.fn(async ({ where }: any) => {
        const step = workflow.steps.find((s: any) => s.id === where.id);
        return step ? { ...step, workflowId: workflow.id, workflow } : null;
      }),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    approvalWorkflow: { update: jest.fn() },
    user: { findUnique: jest.fn(async ({ where }: any) => ({ fullName: `Tên của ${where.id}` })) },
  };
  const outbox = { enqueue: jest.fn() };
  const eventEmitter = { emit: jest.fn() };
  const prisma: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
  const service = new ApprovalsService(prisma, eventEmitter as any, outbox as any);
  const expectZeroSideEffects = () => {
    expect(tx.approvalStep.update).not.toHaveBeenCalled();
    expect(tx.approvalStep.updateMany).not.toHaveBeenCalled();
    expect(tx.approvalWorkflow.update).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  };
  return { service, tx, outbox, eventEmitter, prisma, workflow, expectZeroSideEffects };
}

const code = (e: any) => (typeof e?.getResponse === 'function' ? (e.getResponse() as any).code : undefined);

describe('Proposal approval — segregation of duties and authority', () => {
  it('PROP-SOD-001 the preparer cannot approve a step of their own Proposal, even when assigned to it', async () => {
    const h = harness({ steps: [{ id: 'step-1', stepOrder: 1, status: StepStatus.PENDING, approverRole: 'LEASING_MANAGER', approverId: AUTHOR }] });
    const err = await h.service.approve('step-1', AUTHOR, 'LEASING_MANAGER', 'tự duyệt').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(code(err)).toBe('APPROVAL_SOD_SELF_DECISION');
    h.expectZeroSideEffects();
  });

  it('PROP-SOD-002 the preparer cannot reject a step of their own Proposal', async () => {
    const h = harness({ steps: [{ id: 'step-1', stepOrder: 1, status: StepStatus.PENDING, approverRole: 'LEASING_MANAGER', approverId: AUTHOR }] });
    const err = await h.service.reject('step-1', AUTHOR, 'LEASING_MANAGER', 'x').catch((e) => e);
    expect(code(err)).toBe('APPROVAL_SOD_SELF_DECISION');
    h.expectZeroSideEffects();
  });

  it('PROP-SOD-003 holding the step role does not make someone its approver', async () => {
    const h = harness();
    const err = await h.service.approve('step-1', 'another-leasing-manager', 'LEASING_MANAGER').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(code(err)).toBe('APPROVAL_STEP_NOT_ASSIGNEE');
    h.expectZeroSideEffects();
  });

  it('PROP-SOD-003 a step with no assigned approver cannot be decided by role', async () => {
    const h = harness({ steps: [{ id: 'step-1', stepOrder: 1, status: StepStatus.PENDING, approverRole: 'LEASING_MANAGER', approverId: null }] });
    const err = await h.service.approve('step-1', MANAGER, 'LEASING_MANAGER').catch((e) => e);
    expect(code(err)).toBe('APPROVAL_STEP_UNASSIGNED');
    h.expectZeroSideEffects();
  });

  it('PROP-SOD-004 ADMIN does not bypass assignment or segregation of duties', async () => {
    const notAssigned = harness();
    expect(code(await notAssigned.service.approve('step-1', 'admin-1', 'ADMIN').catch((e) => e))).toBe('APPROVAL_STEP_NOT_ASSIGNEE');
    notAssigned.expectZeroSideEffects();

    const adminAuthor = harness({ workflow: { proposal: { id: 'prop-1', createdById: 'admin-1' } }, steps: [{ id: 'step-1', stepOrder: 1, status: StepStatus.PENDING, approverRole: 'ADMIN', approverId: 'admin-1' }] });
    expect(code(await adminAuthor.service.approve('step-1', 'admin-1', 'ADMIN').catch((e) => e))).toBe('APPROVAL_SOD_SELF_DECISION');
    adminAuthor.expectZeroSideEffects();
  });

  it('PROP-SOD-005 the assigned approver approves, and the next approver is notified durably', async () => {
    const h = harness();
    const result = await h.service.approve('step-1', MANAGER, 'LEASING_MANAGER', 'Đồng ý');

    expect(result).toMatchObject({ completed: false, nextStepOrder: 2 });
    expect(h.tx.approvalStep.updateMany).toHaveBeenCalledWith({
      where: { id: 'step-1', status: StepStatus.PENDING },
      data: expect.objectContaining({ status: StepStatus.APPROVED, approverId: MANAGER, comment: 'Đồng ý' }),
    });
    expect(h.outbox.enqueue).toHaveBeenCalledWith(h.tx, expect.objectContaining({
      eventKey: 'approval:wf-1:step-advanced:2',
      eventName: 'approval.workflow.step-advanced',
      payload: expect.objectContaining({ workflowId: 'wf-1', entityType: 'PROPOSAL', entityId: 'prop-1', nextStepOrder: 2 }),
    }));
    // Not emitted in-process any more.
    expect(h.eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('PROP-SOD-006 a later step approver cannot act before earlier steps are approved', async () => {
    const h = harness();
    const err = await h.service.approve('step-2', FINANCE, 'FINANCE').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toMatch(/must be approved first/);
    h.expectZeroSideEffects();
  });

  it('PROP-SOD-007 an approver cannot decide a step twice', async () => {
    const h = harness({ steps: [
      { id: 'step-1', stepOrder: 1, status: StepStatus.APPROVED, approverRole: 'LEASING_MANAGER', approverId: MANAGER },
      { id: 'step-2', stepOrder: 2, status: StepStatus.PENDING, approverRole: 'FINANCE', approverId: FINANCE },
    ] });
    const err = await h.service.approve('step-1', MANAGER, 'LEASING_MANAGER').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    h.expectZeroSideEffects();
  });

  it('PROP-SOD-009 a denied self-approval writes nothing at all', async () => {
    const h = harness({ steps: [{ id: 'step-1', stepOrder: 1, status: StepStatus.PENDING, approverRole: 'LEASING_MANAGER', approverId: AUTHOR }] });
    await h.service.approve('step-1', AUTHOR, 'LEASING_MANAGER').catch(() => undefined);
    await h.service.reject('step-1', AUTHOR, 'LEASING_MANAGER').catch(() => undefined);
    h.expectZeroSideEffects();
  });

  it('PROP-SOD-010 when a concurrent request already decided the step, this one gets 409 and no event', async () => {
    const lostClaim = harness();
    lostClaim.tx.approvalStep.updateMany.mockResolvedValue({ count: 0 });
    const err = await lostClaim.service.approve('step-1', MANAGER, 'LEASING_MANAGER').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(code(err)).toBe('APPROVAL_STEP_ALREADY_DECIDED');
    expect(lostClaim.outbox.enqueue).not.toHaveBeenCalled();

    const serializationLoser = harness();
    serializationLoser.prisma.$transaction.mockRejectedValue(Object.assign(new Error('could not serialize'), { code: 'P2034' }));
    const err2 = await serializationLoser.service.approve('step-1', MANAGER, 'LEASING_MANAGER').catch((e) => e);
    expect(code(err2)).toBe('APPROVAL_STEP_ALREADY_DECIDED');
  });

  it('refuses decisions on a document version that is no longer awaiting approval', async () => {
    const h = harness({ workflow: { documentVersion: { id: 'dv-1', status: 'REJECTED', proposal: { id: 'prop-1', createdById: AUTHOR } } } });
    const err = await h.service.approve('step-1', MANAGER, 'LEASING_MANAGER').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    h.expectZeroSideEffects();
  });

  it('resolves the preparer through the document version when the workflow was detached by a revision', async () => {
    const h = harness({ workflow: { proposal: null }, steps: [{ id: 'step-1', stepOrder: 1, status: StepStatus.PENDING, approverRole: 'LEASING_MANAGER', approverId: AUTHOR }] });
    expect(code(await h.service.approve('step-1', AUTHOR, 'LEASING_MANAGER').catch((e) => e))).toBe('APPROVAL_SOD_SELF_DECISION');
  });
});

describe('Proposal approval — Mall isolation at the controller', () => {
  it('PROP-SOD-008 a Mall A approver cannot decide a Mall B step; the service is never reached', async () => {
    const service = { approve: jest.fn(), reject: jest.fn() };
    const mallAccess = { extractAndValidateMallAccess: jest.fn().mockRejectedValue(new ForbiddenException('No access to this mall')) };
    const controller = new ApprovalsController(service as any, mallAccess as any);
    const user = { id: 'mall-a-approver', role: 'LEASING_MANAGER' };

    await expect(controller.approve('step-mall-b', { comment: 'x' } as any, user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.reject('step-mall-b', { comment: 'x' } as any, user)).rejects.toBeInstanceOf(ForbiddenException);

    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('mall-a-approver', 'LEASING_MANAGER', { approvalStepId: 'step-mall-b' }, { crossMallRead: true });
    expect(service.approve).not.toHaveBeenCalled();
    expect(service.reject).not.toHaveBeenCalled();
  });
});
