import { ServiceContractsController } from './service-contracts.controller';

describe('ServiceContractsController mall-scoped summaries', () => {
  const service = { alerts: jest.fn(), stats: jest.fn() } as any;
  const mallAccess = { assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() } as any;
  const user = { id: 'user-1', role: 'MALL_DIRECTOR' };
  let controller: ServiceContractsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ServiceContractsController(service, mallAccess);
  });

  it('scopes alerts to the selected mall after checking access', async () => {
    service.alerts.mockResolvedValue({ expiring: 1 });

    await controller.alerts('30', 'mall-1', user);

    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('user-1', 'MALL_DIRECTOR', 'mall-1');
    expect(service.alerts).toHaveBeenCalledWith(['mall-1'], 30);
    expect(mallAccess.getAccessibleMallIds).not.toHaveBeenCalled();
  });

  it('scopes stats to all accessible malls when no mall is selected', async () => {
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1', 'mall-2']);
    service.stats.mockResolvedValue({ total: 2 });

    await controller.stats(undefined, user);

    expect(service.stats).toHaveBeenCalledWith(['mall-1', 'mall-2']);
  });
});
