import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StepStatus, WorkflowStatus } from '@prisma/client';
import { ApprovalsService } from './approvals.service';

describe('ApprovalsService Golden Fitout workspace', () => {
  const fitoutContext = {
    id: 'sub-1', workflowId: 'workflow-1', title: 'Shop drawing', revisionNo: 2,
    status: 'IN_PROGRESS', stageCode: 'SUBMIT_DESIGN', submittedAt: new Date(), dueDate: null,
    formType: { id: 'form-1', code: 'SHOP_DRAWING', name: 'Shop drawing' },
    submittedBy: { id: 'submitter-1', fullName: 'Tenant User' },
    project: {
      id: 'project-1', status: 'SUBMIT_DESIGN',
      tenant: { id: 'tenant-1', brandName: 'Brand', companyName: 'Company' },
      unit: { id: 'unit-1', code: 'L1-01', name: 'Unit 1', mallId: null, floor: { id: 'floor-1', name: 'L1', mallId: 'mall-1' } },
    },
  };
  const step = {
    id: 'step-1', stepOrder: 1, stepName: 'Operation review', approverRole: 'OPERATION',
    approverId: null, status: StepStatus.PENDING, createdAt: new Date(),
    workflow: {
      id: 'workflow-1', entityType: 'FITOUT_SUBMITTAL', entityId: 'sub-1',
      status: WorkflowStatus.IN_PROGRESS, proposal: null, fitoutSubmittal: fitoutContext,
      steps: [{ id: 'step-1', stepOrder: 1, status: StepStatus.PENDING, approverRole: 'OPERATION', approverId: null }],
    },
  };
  const prisma: any = {
    $transaction: jest.fn(),
    approvalStep: { findMany: jest.fn() },
    approvalWorkflow: { findUnique: jest.fn() },
    approvalPolicyRule: { findMany: jest.fn() },
    unifiedDocument: { findMany: jest.fn() },
    fitoutStageConfig: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  const outbox = { enqueue: jest.fn() };
  let service: ApprovalsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApprovalsService(prisma, {} as any, outbox as any);
    prisma.approvalStep.findMany.mockResolvedValue([step]);
    prisma.unifiedDocument.findMany.mockResolvedValue([{
      id: 'document-1', entityId: 'sub-1', fileName: 'drawing.pdf', mimeType: 'application/pdf',
      fileSize: 100, version: 2, isLatest: true, uploadedAt: new Date(),
    }]);
    prisma.fitoutStageConfig.findMany.mockResolvedValue([{ code: 'SUBMIT_DESIGN', name: 'Submit design' }]);
    prisma.fitoutStageConfig.findUnique.mockResolvedValue({ code: 'SUBMIT_DESIGN', name: 'Submit design' });
  });

  it.each(['fitout_submittal', 'UNKNOWN', ''])('rejects unsupported entityType %p before querying', async (entityType) => {
    await expect(service.getPending('user-1', 'OPERATION', { entityType }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.approvalStep.findMany).not.toHaveBeenCalled();
  });

  it('scopes Fitout pending rows by entity, current step and direct-or-floor Mall and returns safe attachments', async () => {
    const result: any = await service.getPending(
      'user-1', 'OPERATION', { entityType: 'FITOUT_SUBMITTAL' }, ['proposal-mall'], ['mall-1'],
    );

    expect(prisma.approvalStep.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workflow: expect.objectContaining({
          entityType: 'FITOUT_SUBMITTAL',
          fitoutSubmittal: { project: { unit: { OR: [
            { mallId: { in: ['mall-1'] } },
            { floor: { mallId: { in: ['mall-1'] } } },
          ] } } },
        }),
      }),
    }));
    expect(result.total).toBe(1);
    expect(result.data[0].workflow.fitoutSubmittal.attachments[0]).toEqual(expect.objectContaining({
      id: 'document-1', fileName: 'drawing.pdf',
    }));
    expect(result.data[0].workflow.fitoutSubmittal.attachments[0]).not.toHaveProperty('entityId');
    expect(result.data[0].workflow.fitoutSubmittal.attachments[0]).not.toHaveProperty('filePath');
    expect(result.data[0].workflow.fitoutSubmittal.stage).toEqual({
      code: 'SUBMIT_DESIGN', name: 'Submit design',
    });
    expect(result.data[0].policyReason).toBeNull();
    expect(prisma.approvalPolicyRule.findMany).not.toHaveBeenCalled();
  });

  it('fails closed on a mismatched workflow entity pointer', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([{
      ...step, workflow: { ...step.workflow, entityId: 'sub-other' },
    }]);

    await expect(service.getPending('user-1', 'OPERATION', { entityType: 'FITOUT_SUBMITTAL' }, [], ['mall-1']))
      .resolves.toEqual(expect.objectContaining({ data: [], total: 0 }));
    expect(prisma.unifiedDocument.findMany).not.toHaveBeenCalled();
  });

  it('keeps Proposal cross-Mall behavior while independently Mall-scoping Fitout in the combined queue', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([]);

    await service.getPending('ceo-1', 'CEO', {}, undefined, ['mall-1']);

    expect(prisma.approvalStep.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workflow: expect.objectContaining({
          OR: [
            { entityType: 'PROPOSAL' },
            {
              entityType: 'FITOUT_SUBMITTAL',
              fitoutSubmittal: { project: { unit: { OR: [
                { mallId: { in: ['mall-1'] } },
                { floor: { mallId: { in: ['mall-1'] } } },
              ] } } },
            },
          ],
        }),
      }),
    }));
  });

  it('allows the current exact Fitout approver with project-Mall access to open the dossier', async () => {
    prisma.approvalWorkflow.findUnique.mockResolvedValue(step.workflow);
    prisma.unifiedDocument.findMany.mockResolvedValue([{
      id: 'document-1', fileName: 'drawing.pdf', mimeType: 'application/pdf', fileSize: 100,
      version: 2, isLatest: true, uploadedAt: new Date(),
    }]);

    const result: any = await service.getWorkflow(
      'workflow-1', { id: 'user-1', role: 'OPERATION' }, ['mall-1'],
    );
    expect(result.fitoutSubmittal.attachments).toHaveLength(1);
    expect(result.fitoutSubmittal.stage).toEqual({ code: 'SUBMIT_DESIGN', name: 'Submit design' });
  });

  it('preserves Proposal workflow detail behavior without Fitout capability checks', async () => {
    const proposalWorkflow = {
      id: 'proposal-workflow', entityType: 'PROPOSAL', entityId: 'proposal-1',
      status: WorkflowStatus.IN_PROGRESS, proposal: { id: 'proposal-1' },
      fitoutSubmittal: null, steps: [],
    };
    prisma.approvalWorkflow.findUnique.mockResolvedValue(proposalWorkflow);

    await expect(service.getWorkflow('proposal-workflow')).resolves.toBe(proposalWorkflow);
    expect(prisma.unifiedDocument.findMany).not.toHaveBeenCalled();
  });

  it('denies same-Mall wrong role, wrong assignee, terminal workflow and wrong Mall', async () => {
    prisma.approvalWorkflow.findUnique.mockResolvedValue(step.workflow);
    await expect(service.getWorkflow('workflow-1', { id: 'user-1', role: 'FINANCE' }, ['mall-1']))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getWorkflow('workflow-1', { id: 'user-1', role: 'OPERATION' }, ['mall-2']))
      .rejects.toBeInstanceOf(ForbiddenException);

    prisma.approvalWorkflow.findUnique.mockResolvedValue({
      ...step.workflow,
      steps: [{ ...step.workflow.steps[0], approverId: 'other-user' }],
    });
    await expect(service.getWorkflow('workflow-1', { id: 'user-1', role: 'OPERATION' }, ['mall-1']))
      .rejects.toBeInstanceOf(ForbiddenException);

    prisma.approvalWorkflow.findUnique.mockResolvedValue({ ...step.workflow, status: WorkflowStatus.APPROVED });
    await expect(service.getWorkflow('workflow-1', { id: 'user-1', role: 'OPERATION' }, ['mall-1']))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.unifiedDocument.findMany).not.toHaveBeenCalled();
  });

  it('revalidates ordinary project-Mall access inside a Fitout decision transaction', async () => {
    const tx: any = {
      approvalStep: {
        findUnique: jest.fn().mockResolvedValue({
          ...step,
          workflowId: 'workflow-1',
          workflow: {
            ...step.workflow,
            fitoutSubmittal: fitoutContext,
          },
        }),
        update: jest.fn(),
      },
      approvalWorkflow: { update: jest.fn() },
      userMallAccess: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(service.approve('step-1', 'user-1', 'OPERATION'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.userMallAccess.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', mallId: 'mall-1', isActive: true }, select: { id: true },
    });
    expect(tx.approvalStep.update).not.toHaveBeenCalled();
  });

  it('rejects a later Fitout step before a rejection write', async () => {
    const tx: any = {
      approvalStep: {
        findUnique: jest.fn().mockResolvedValue({
          ...step,
          stepOrder: 2,
          workflowId: 'workflow-1',
          workflow: {
            ...step.workflow,
            steps: [
              { id: 'earlier', stepOrder: 1, stepName: 'Earlier', status: StepStatus.PENDING },
              { id: 'step-1', stepOrder: 2, stepName: 'Current', status: StepStatus.PENDING },
            ],
            fitoutSubmittal: fitoutContext,
          },
        }),
        update: jest.fn(),
      },
      approvalWorkflow: { update: jest.fn() },
      userMallAccess: { findFirst: jest.fn().mockResolvedValue({ id: 'mall-access-1' }) },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(service.reject('step-1', 'user-1', 'OPERATION', 'Needs correction'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.approvalStep.update).not.toHaveBeenCalled();
  });

  it('denies a wrong-Mall actor before revealing the later-step diagnostic on reject', async () => {
    const tx: any = {
      approvalStep: {
        findUnique: jest.fn().mockResolvedValue({
          ...step,
          stepOrder: 2,
          workflowId: 'workflow-1',
          workflow: {
            ...step.workflow,
            steps: [
              { id: 'earlier', stepOrder: 1, stepName: 'Earlier', status: StepStatus.PENDING },
              { id: 'step-1', stepOrder: 2, stepName: 'Current', status: StepStatus.PENDING },
            ],
            fitoutSubmittal: fitoutContext,
          },
        }),
        update: jest.fn(),
      },
      approvalWorkflow: { update: jest.fn() },
      userMallAccess: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(service.reject('step-1', 'user-1', 'OPERATION', 'Needs correction'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.userMallAccess.findFirst).toHaveBeenCalled();
    expect(tx.approvalStep.update).not.toHaveBeenCalled();
  });
});
