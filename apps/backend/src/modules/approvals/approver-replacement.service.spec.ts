/**
 * Replacing the person in charge (APPROVER-REPLACE). One action moves every
 * rule of the Mall naming the old person, and every step still waiting on
 * them, to the new person. Decided steps are never touched.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApproverReplacementService } from './approver-replacement.service';

const MALL = 'mall-1';
const OLD = 'u-old-manager';
const NEW = 'u-new-manager';
const code = (e: any) => e?.getResponse?.()?.code;

function successor(overrides: Record<string, unknown> = {}) {
  return { id: NEW, fullName: 'Quản lý mới', role: Role.LEASING_MANAGER, isActive: true, deletedAt: null, mallAccess: [{ id: 'a' }], ...overrides };
}

function harness(opts: { user?: any; proposalSteps?: any[]; bookingSteps?: any[]; rulesUpdated?: number } = {}) {
  const tx: any = {
    approvalPolicyRule: { updateMany: jest.fn().mockResolvedValue({ count: opts.rulesUpdated ?? 3 }) },
    approvalStep: { findMany: jest.fn().mockResolvedValue(opts.proposalSteps ?? []), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    bookingPriceApprovalStep: { findMany: jest.fn().mockResolvedValue(opts.bookingSteps ?? []), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: jest.fn() },
  };
  const prisma: any = {
    mall: { findUnique: jest.fn().mockResolvedValue({ id: MALL }) },
    user: { findUnique: jest.fn().mockResolvedValue(opts.user === undefined ? successor() : opts.user) },
    $transaction: jest.fn((fn: any, options: any) => { prisma.lastOptions = options; return fn(tx); }),
  };
  const outbox = { enqueue: jest.fn() };
  return { tx, prisma, outbox, service: new ApproverReplacementService(prisma, outbox as any) };
}

const proposalStep = (id: string, stepOrder: number, earlier: Array<'APPROVED' | 'PENDING'>, createdById = 'u-author') => ({
  id, stepOrder, stepName: `Bước ${stepOrder}`, workflowId: `wf-${id}`,
  workflow: {
    entityId: `prop-${id}`,
    steps: [...earlier.map((status, i) => ({ stepOrder: i + 1, status })), { stepOrder, status: 'PENDING' }],
    proposal: { createdById, proposalNumber: `PRO-${id}` },
  },
});

const input = { mallId: MALL, fromUserId: OLD, toUserId: NEW };

describe('ApproverReplacementService.replace', () => {
  it.each<[any, string]>([
    [{ toUserId: OLD }, 'APPROVER_REPLACEMENT_SAME_USER'],
    [{ user: null }, 'APPROVER_REPLACEMENT_USER_NOT_FOUND'],
    [{ user: successor({ isActive: false }) }, 'APPROVER_REPLACEMENT_USER_INACTIVE'],
    [{ user: successor({ role: Role.LEASING_EXECUTIVE }) }, 'APPROVER_REPLACEMENT_ROLE_NOT_ELIGIBLE'],
    [{ user: successor({ mallAccess: [] }) }, 'APPROVER_REPLACEMENT_NO_MALL_ACCESS'],
  ])('APPROVER-REPLACE-001 refuses %j (%s) before anything is written', async (opts, expected) => {
    const { service, prisma } = harness({ user: opts.user });
    const error = await service.replace({ ...input, ...(opts.toUserId ? { toUserId: opts.toUserId } : {}) }, 'admin').catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(code(error)).toBe(expected);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('APPROVER-REPLACE-002 rewrites every rule of the Mall naming the old person, with the new person\'s role', async () => {
    const { service, tx, prisma } = harness({ user: successor({ role: Role.MALL_DIRECTOR }) });
    const result = await service.replace(input, 'admin');
    expect(prisma.lastOptions).toEqual({ isolationLevel: 'Serializable' });
    expect(tx.approvalPolicyRule.updateMany).toHaveBeenCalledWith({
      where: { mallId: MALL, approverId: OLD },
      data: { approverId: NEW, approverRole: Role.MALL_DIRECTOR },
    });
    expect(result.rulesUpdated).toBe(3);
  });

  it('APPROVER-REPLACE-003 moves pending proposal steps, notifies only the step now actionable, and never hands a Proposal to its own author', async () => {
    const { service, tx, outbox } = harness({
      proposalSteps: [proposalStep('s1', 1, []), proposalStep('s2', 3, ['APPROVED', 'PENDING']), proposalStep('s3', 1, [], NEW)],
    });

    const result = await service.replace(input, 'admin');

    expect(tx.approvalStep.findMany.mock.calls[0][0].where).toEqual({
      status: 'PENDING', approverId: OLD,
      workflow: { status: 'IN_PROGRESS', entityType: 'PROPOSAL', proposal: { unit: { mallId: MALL } } },
    });
    expect(tx.approvalStep.updateMany.mock.calls.map((c: any) => c[0])).toEqual([
      { where: { id: 's1', status: 'PENDING' }, data: { approverId: NEW, approverRole: Role.LEASING_MANAGER } },
      { where: { id: 's2', status: 'PENDING' }, data: { approverId: NEW, approverRole: Role.LEASING_MANAGER } },
    ]);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue.mock.calls[0][1]).toEqual(expect.objectContaining({
      eventName: 'approval.workflow.step-advanced',
      payload: { workflowId: 'wf-s1', entityType: 'PROPOSAL', entityId: 'prop-s1', nextStepOrder: 1 },
    }));
    expect(result).toEqual(expect.objectContaining({
      reassignedProposalSteps: 2,
      skipped: [{ entityType: 'PROPOSAL', entityId: 'prop-s3', reference: 'PRO-s3', stepName: 'Bước 1', reason: 'SELF_APPROVAL' }],
    }));
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('APPROVAL_APPROVER_REPLACED');
    expect(JSON.parse(audit.payload)).toEqual(expect.objectContaining({ fromUserId: OLD, toUserId: NEW, rulesUpdated: 3, reassignedProposalSteps: 2 }));
  });

  it('APPROVER-REPLACE-004 a step decided in the meantime is neither counted nor notified', async () => {
    const { service, tx, outbox } = harness({ proposalSteps: [proposalStep('s1', 1, [])] });
    tx.approvalStep.updateMany.mockResolvedValue({ count: 0 });
    const result = await service.replace(input, 'admin');
    expect(result.reassignedProposalSteps).toBe(0);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('APPROVER-REPLACE-005 moves pending booking price steps too, keeping booking separation of duties', async () => {
    const booking = (id: string, extra: Record<string, unknown> = {}) => ({
      id, stepOrder: 1, stepName: 'Duyệt giá', bookingId: `bk-${id}`,
      booking: { bookingNumber: `BK-${id}`, createdById: 'u-exec', priceProposedById: 'u-exec', priceApprovalSteps: [{ stepOrder: 1, status: 'PENDING' }], ...extra },
    });
    const { service, tx, outbox } = harness({ bookingSteps: [booking('b1'), booking('b2', { createdById: NEW })] });

    const result = await service.replace(input, 'admin');

    expect(tx.bookingPriceApprovalStep.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.bookingPriceApprovalStep.updateMany).toHaveBeenCalledWith({ where: { id: 'b1', status: 'PENDING' }, data: { approverId: NEW, approverRole: Role.LEASING_MANAGER } });
    expect(outbox.enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({ eventName: 'booking.price-approval.reassigned', payload: { bookingId: 'bk-b1' } }));
    expect(result.reassignedBookingPriceSteps).toBe(1);
    expect(result.skipped).toEqual([expect.objectContaining({ entityType: 'BOOKING_PRICE', reference: 'BK-b2', reason: 'SELF_APPROVAL' })]);
  });

  it('APPROVER-REPLACE-006 a concurrent decision surfaces as 409, not a database error', async () => {
    const { service, prisma } = harness();
    prisma.$transaction.mockRejectedValue(Object.assign(new Error('conflict'), { code: 'P2034' }));
    const error = await service.replace(input, 'admin').catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(code(error)).toBe('APPROVER_REPLACEMENT_CONFLICT');
  });
});

describe('ApproverReplacementService.listApproversInUse', () => {
  it('APPROVER-REPLACE-007 lists everyone rules or pending steps depend on, with what would block them', async () => {
    const prisma: any = {
      mall: { findUnique: jest.fn().mockResolvedValue({ id: MALL }) },
      approvalPolicyRule: { groupBy: jest.fn().mockResolvedValue([{ approverId: 'u-m', _count: { _all: 2 } }, { approverId: 'u-l', _count: { _all: 1 } }]) },
      approvalStep: { groupBy: jest.fn().mockResolvedValue([{ approverId: 'u-m', _count: { _all: 3 } }, { approverId: 'u-gone', _count: { _all: 1 } }]) },
      bookingPriceApprovalStep: { groupBy: jest.fn().mockResolvedValue([]) },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u-m', fullName: 'Tran Thi B', email: 'm@x', role: Role.LEASING_MANAGER, isActive: true, deletedAt: null, mallAccess: [{ id: 'a' }] },
          { id: 'u-l', fullName: 'Hoang Van E', email: 'l@x', role: Role.LEGAL, isActive: false, deletedAt: null, mallAccess: [] },
          { id: 'u-gone', fullName: 'Nghi viec', email: 'g@x', role: Role.OPERATION, isActive: true, deletedAt: null, mallAccess: [{ id: 'a' }] },
        ]),
      },
    };
    const rows = await new ApproverReplacementService(prisma, {} as any).listApproversInUse(MALL);

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['u-m', 'u-l', 'u-gone'] } });
    const by = Object.fromEntries(rows.map((r) => [r.user.id, r]));
    expect(by['u-m']).toEqual(expect.objectContaining({ issues: [], ruleCount: 2, pendingProposalSteps: 3 }));
    expect(by['u-l'].issues).toEqual(['INACTIVE', 'NO_MALL_ACCESS']);
    expect(by['u-gone']).toEqual(expect.objectContaining({ issues: ['ROLE_NOT_ELIGIBLE'], ruleCount: 0, pendingProposalSteps: 1 }));
  });
});
