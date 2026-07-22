import { TenantsController } from './tenants.controller';

describe('TenantsController mall access', () => {
  const service: any = { findAll: jest.fn(), findOne: jest.fn() };
  const mallAccess: any = {
    assertMallAccess: jest.fn(),
    getAccessibleMallIds: jest.fn(),
    extractAndValidateMallAccess: jest.fn(),
  };
  let controller: TenantsController;

  beforeEach(() => {
    jest.clearAllMocks();
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-assigned']);
    controller = new TenantsController(service, mallAccess);
  });

  it('uses and validates the mall selected in the request', async () => {
    const user = { id: 'u1', role: 'LEASING_MANAGER', activeMallId: 'mall-old' };
    await controller.findAll({ page: 1, mallId: 'mall-new' }, user);

    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('u1', 'LEASING_MANAGER', 'mall-new');
    expect(service.findAll).toHaveBeenCalledWith({ page: 1, mallId: 'mall-new', mallIds: ['mall-new'] });
    expect(mallAccess.getAccessibleMallIds).not.toHaveBeenCalled();
  });

  it('falls back to assigned malls when no mall context is selected', async () => {
    const user = { id: 'u1', role: 'LEASING_MANAGER' };
    await controller.findAll({ page: 1 }, user);

    expect(service.findAll).toHaveBeenCalledWith({ page: 1, mallIds: ['mall-assigned'] });
  });
});
