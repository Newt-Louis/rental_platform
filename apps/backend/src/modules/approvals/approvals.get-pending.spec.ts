import { StepStatus, WorkflowStatus } from '@prisma/client';
import { ApprovalsService } from './approvals.service';

// FR-04 (docs/audit/04-UX-FRICTION-REPORT.md): the pending-approvals queue must
// surface *why* a step exists (which policy rule produced it), correlated by
// stepName+approverRole since ApprovalStep does not store a rule reference.
describe('ApprovalsService.getPending — policy reason (FR-04)', () => {
  const STEP = {
    id: 'step-1',
    stepOrder: 1,
    stepName: 'CEO Approval — High Discount',
    approverRole: 'CEO',
    status: StepStatus.PENDING,
    createdAt: new Date(),
    workflow: {
      entityType: 'PROPOSAL',
      status: WorkflowStatus.IN_PROGRESS,
      proposal: { id: 'p1', discount: 12, rentFree: 30 },
      steps: [{ id: 'step-1', stepOrder: 1, status: StepStatus.PENDING }],
    },
  };

  function makeService(rules: any[]) {
    const prisma: any = {
      approvalStep: { findMany: jest.fn().mockResolvedValue([STEP]) },
      approvalPolicyRule: { findMany: jest.fn().mockResolvedValue(rules) },
    };
    return { service: new ApprovalsService(prisma, {} as any, {} as any), prisma };
  }

  it('attaches the matching active rule name as policyReason', async () => {
    const { service } = makeService([
      { name: 'CEO — Giảm giá trên 10%', stepName: 'CEO Approval — High Discount', approverRole: 'CEO', isActive: true },
      { name: 'Unrelated rule', stepName: 'Something else', approverRole: 'FINANCE', isActive: true },
    ]);
    const result = await service.getPending('u1', 'CEO');
    expect(result.data[0]).toMatchObject({ policyReason: 'CEO — Giảm giá trên 10%' });
  });

  it('returns null policyReason when no active rule matches (rule was edited/deactivated since)', async () => {
    const { service } = makeService([]);
    const result = await service.getPending('u1', 'CEO');
    expect(result.data[0]).toMatchObject({ policyReason: null });
  });
});
