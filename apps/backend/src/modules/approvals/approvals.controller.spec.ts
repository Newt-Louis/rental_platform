import { ApprovalsController } from './approvals.controller';
import { BadRequestException } from '@nestjs/common';

describe('ApprovalsController mall access', () => {
  const service: any = { getPending: jest.fn(), getHistory: jest.fn(), approve: jest.fn(), getWorkflow: jest.fn() };
  const mallAccess: any = {
    assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn(), extractAndValidateMallAccess: jest.fn(),
  };
  let controller: ApprovalsController;

  beforeEach(() => {
    jest.clearAllMocks();
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);
    controller = new ApprovalsController(service, mallAccess);
  });

  it('uses and validates the mall selected in the request instead of stale active mall context', async () => {
    const user = { id: 'u1', role: 'FINANCE', activeMallId: 'mall-old' };
    await controller.getPending(user, { page: 1, mallId: 'mall-new' });
    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('u1', 'FINANCE', 'mall-new', { crossMallRead: true });
    expect(service.getPending).toHaveBeenCalledWith(
      'u1', 'FINANCE', { page: 1, mallId: 'mall-new' }, ['mall-new'],
      [],
    );
  });

  it('scopes pending and history queues to assigned malls', async () => {
    const user = { id: 'u1', role: 'FINANCE' };
    await controller.getPending(user, { page: 1 });
    await controller.getHistory(user, { page: 2 });
    expect(service.getPending).toHaveBeenCalledWith('u1', 'FINANCE', { page: 1 }, ['mall-1'], ['mall-1']);
    expect(service.getHistory).toHaveBeenCalledWith('u1', 'FINANCE', { page: 2 }, ['mall-1']);
  });

  it('validates step mall before approving', async () => {
    const user = { id: 'u1', role: 'FINANCE' };
    await controller.approve('step-1', { comment: 'Reviewed' }, user);
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(
      'u1', 'FINANCE', { approvalStepId: 'step-1' }, { crossMallRead: true },
    );
    expect(service.approve).toHaveBeenCalledWith('step-1', 'u1', 'FINANCE', 'Reviewed');
  });

  it('rejects an invalid entityType before any Mall or Approval query', async () => {
    await expect(controller.getPending(
      { id: 'u1', role: 'OPERATION' }, { entityType: 'fitout_submittal' },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(mallAccess.getAccessibleMallIds).not.toHaveBeenCalled();
    expect(service.getPending).not.toHaveBeenCalled();
  });

  it('requires ordinary project-Mall access for an explicit Fitout queue', async () => {
    const user = { id: 'ceo-1', role: 'CEO' };
    await controller.getPending(user, { entityType: 'FITOUT_SUBMITTAL', mallId: 'mall-1' });

    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('ceo-1', 'CEO', 'mall-1');
    expect(service.getPending).toHaveBeenCalledWith(
      'ceo-1', 'CEO', { entityType: 'FITOUT_SUBMITTAL', mallId: 'mall-1' },
      ['mall-1'], ['mall-1'],
    );
  });

  it('retains an explicit requested Mall as an ADMIN Fitout queue filter', async () => {
    const user = { id: 'admin-1', role: 'ADMIN' };
    await controller.getPending(user, { entityType: 'FITOUT_SUBMITTAL', mallId: 'mall-1' });

    expect(service.getPending).toHaveBeenCalledWith(
      'admin-1', 'ADMIN', { entityType: 'FITOUT_SUBMITTAL', mallId: 'mall-1' },
      ['mall-1'], ['mall-1'],
    );
  });
});
