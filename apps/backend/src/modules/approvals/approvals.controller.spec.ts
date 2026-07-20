import { ApprovalsController } from './approvals.controller';

describe('ApprovalsController mall access', () => {
  const service: any = { getPending: jest.fn(), getHistory: jest.fn(), approve: jest.fn(), getWorkflow: jest.fn() };
  const mallAccess: any = { getAccessibleMallIds: jest.fn(), extractAndValidateMallAccess: jest.fn() };
  let controller: ApprovalsController;

  beforeEach(() => {
    jest.clearAllMocks();
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);
    controller = new ApprovalsController(service, mallAccess);
  });

  it('scopes pending and history queues to assigned malls', async () => {
    const user = { id: 'u1', role: 'FINANCE' };
    await controller.getPending(user, { page: 1 });
    await controller.getHistory(user, { page: 2 });
    expect(service.getPending).toHaveBeenCalledWith('u1', 'FINANCE', { page: 1 }, ['mall-1']);
    expect(service.getHistory).toHaveBeenCalledWith('u1', 'FINANCE', { page: 2 }, ['mall-1']);
  });

  it('validates step mall before approving', async () => {
    const user = { id: 'u1', role: 'FINANCE' };
    await controller.approve('step-1', { comment: 'Reviewed' }, user);
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(
      'u1', 'FINANCE', { approvalStepId: 'step-1' },
    );
    expect(service.approve).toHaveBeenCalledWith('step-1', 'u1', 'FINANCE', 'Reviewed');
  });
});
