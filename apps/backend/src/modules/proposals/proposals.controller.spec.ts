import { ProposalsController } from './proposals.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('ProposalsController access and roles', () => {
  const service: any = { findAll: jest.fn(), getStats: jest.fn(), findOne: jest.fn(), update: jest.fn() };
  const mallAccess: any = {
    assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn(), extractAndValidateMallAccess: jest.fn(),
  };
  let controller: ProposalsController;

  beforeEach(() => {
    jest.clearAllMocks();
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);
    controller = new ProposalsController(service, {} as any, {} as any, mallAccess);
  });

  it('scopes lists and KPI to assigned malls', async () => {
    const user = { id: 'u1', role: 'LEASING_EXECUTIVE' };
    await controller.findAll({ status: 'DRAFT' }, user);
    await controller.stats(user);
    expect(service.findAll).toHaveBeenCalledWith({ status: 'DRAFT', mallIds: ['mall-1'] });
    expect(service.getStats).toHaveBeenCalledWith(['mall-1']);
  });

  it('validates proposal mall before returning detail', async () => {
    await controller.findOne('p1', { id: 'u1', role: 'LEASING_EXECUTIVE' });
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(
      'u1', 'LEASING_EXECUTIVE', { proposalId: 'p1' },
    );
  });

  it('prevents executive conversion and CEO mutation through role metadata', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProposalsController.prototype.convert)).toEqual([
      'ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR',
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, ProposalsController.prototype.update)).not.toContain('CEO');
  });
});
