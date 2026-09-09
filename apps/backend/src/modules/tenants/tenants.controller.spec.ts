import { TenantsController } from './tenants.controller';

describe('TenantsController mall access', () => {
  const service: any = { findAll: jest.fn(), findOne: jest.fn(), getFitoutArchive: jest.fn() };
  const mallAccess: any = {
    assertMallAccess: jest.fn(),
    getAccessibleMallIds: jest.fn(),
    extractAndValidateMallAccess: jest.fn(),
  };
  const fitoutDossierAccess: any = { getAuthorizedMallIds: jest.fn() };
  let controller: TenantsController;

  beforeEach(() => {
    jest.clearAllMocks();
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-assigned']);
    fitoutDossierAccess.getAuthorizedMallIds.mockResolvedValue(['mall-assigned']);
    controller = new TenantsController(service, mallAccess, fitoutDossierAccess);
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

  it('validates tenant Mall access before reading the Fitout archive', async () => {
    const user = { id: 'u1', role: 'LEASING_MANAGER' };
    await controller.getFitoutArchive('tenant-1', { search: 'drawing' }, user);

    expect(fitoutDossierAccess.getAuthorizedMallIds).toHaveBeenCalledWith(user);
    expect(service.getFitoutArchive).toHaveBeenCalledWith(
      'tenant-1', { search: 'drawing' }, ['mall-assigned'],
    );
  });

  it('does not query Fitout data when Mall access is denied', async () => {
    fitoutDossierAccess.getAuthorizedMallIds.mockRejectedValueOnce(new Error('Mall access denied'));

    await expect(controller.getFitoutArchive(
      'tenant-in-mall-b', {}, { id: 'mall-a-user', role: 'LEASING_MANAGER' },
    )).rejects.toThrow('Mall access denied');

    expect(service.getFitoutArchive).not.toHaveBeenCalled();
    expect(fitoutDossierAccess.getAuthorizedMallIds).toHaveBeenCalledTimes(1);
  });

  it('DOSSIER-008 derives the Mall set server-side for the restricted archive route', async () => {
    const user = { id: 'basic-1', role: 'FITOUT_BASIC_TEAM' };
    fitoutDossierAccess.getAuthorizedMallIds.mockResolvedValueOnce(['mall-a']);

    await controller.searchFitoutArchive({ mallId: 'mall-a', search: 'approved' }, user);

    expect(fitoutDossierAccess.getAuthorizedMallIds).toHaveBeenCalledWith(user, 'mall-a');
    expect(service.getFitoutArchive).toHaveBeenCalledWith(
      undefined, { mallId: 'mall-a', search: 'approved' }, ['mall-a'],
    );
  });

  it('DOSSIER-010 creates zero query side effects when restricted archive authorization fails', async () => {
    fitoutDossierAccess.getAuthorizedMallIds.mockRejectedValueOnce(new Error('denied'));

    await expect(controller.searchFitoutArchive(
      { mallId: 'mall-b' }, { id: 'basic-1', role: 'FITOUT_BASIC_TEAM' },
    )).rejects.toThrow('denied');

    expect(service.getFitoutArchive).not.toHaveBeenCalled();
  });
});
