import { BadRequestException } from '@nestjs/common';
import { Prisma, StepStatus, WorkflowStatus } from '@prisma/client';
import { ApprovalsService } from './approvals.service';

describe('ApprovalsService transactional decisions', () => {
  const eventEmitter = { emit: jest.fn() };
  const outbox = { enqueue: jest.fn() };
  const tx = {
    approvalStep: { findUnique: jest.fn(), update: jest.fn() },
    approvalWorkflow: { update: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  let service: ApprovalsService;

  beforeEach(() => {
    jest.clearAllMocks();
    outbox.enqueue.mockResolvedValue({ id: 'outbox-1' });
    service = new ApprovalsService(prisma as any, eventEmitter as any, outbox as any);
  });

  it('commits the final approval and its outbox event atomically', async () => {
    tx.approvalStep.findUnique.mockResolvedValue({
      id: 'step-1',
      workflowId: 'workflow-1',
      status: StepStatus.PENDING,
      approverRole: 'LEGAL',
      stepOrder: 1,
      workflow: {
        status: WorkflowStatus.IN_PROGRESS,
        entityType: 'PROPOSAL',
        entityId: 'proposal-1',
        steps: [{ id: 'step-1', stepOrder: 1, status: StepStatus.PENDING }],
      },
    });

    await service.approve('step-1', 'user-1', 'LEGAL', 'OK');

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    expect(tx.approvalStep.update).toHaveBeenCalled();
    expect(tx.approvalWorkflow.update).toHaveBeenCalledWith({
      where: { id: 'workflow-1' },
      data: { status: WorkflowStatus.APPROVED },
    });
    expect(outbox.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventKey: 'approval:workflow-1:completed',
        eventName: 'approval.workflow.completed',
        payload: expect.objectContaining({
          workflowId: 'workflow-1',
          entityId: 'proposal-1',
        }),
      }),
    );
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('does not emit when the transaction fails', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('rollback'));

    await expect(service.approve('step-1', 'user-1', 'LEGAL')).rejects.toThrow('rollback');
    expect(eventEmitter.emit).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('rejects an already completed workflow without writing', async () => {
    tx.approvalStep.findUnique.mockResolvedValue({
      id: 'step-1',
      workflowId: 'workflow-1',
      status: StepStatus.PENDING,
      approverRole: 'LEGAL',
      workflow: { status: WorkflowStatus.APPROVED },
    });

    await expect(service.reject('step-1', 'user-1', 'LEGAL')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.approvalStep.update).not.toHaveBeenCalled();
    expect(tx.approvalWorkflow.update).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('writes rejection and its outbox event in the same transaction', async () => {
    tx.approvalStep.findUnique.mockResolvedValue({
      id: 'step-1',
      workflowId: 'workflow-1',
      status: StepStatus.PENDING,
      approverRole: 'LEGAL',
      workflow: {
        status: WorkflowStatus.IN_PROGRESS,
        entityType: 'PROPOSAL',
        entityId: 'proposal-1',
      },
    });

    await service.reject('step-1', 'user-1', 'LEGAL', 'Needs revision');

    expect(tx.approvalWorkflow.update).toHaveBeenCalledWith({
      where: { id: 'workflow-1' },
      data: { status: WorkflowStatus.REJECTED },
    });
    expect(outbox.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventKey: 'approval:workflow-1:rejected',
        eventName: 'approval.workflow.rejected',
      }),
    );
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
