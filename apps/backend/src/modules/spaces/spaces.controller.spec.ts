import { SpacesController } from './spaces.controller';

describe('SpacesController Mall permissions', () => {
  const spacesService = { getMalls: jest.fn() };
  const unitMediaService = {};
  const mallAccess = { getAccessibleMallIds: jest.fn() };
  const controller = new SpacesController(
    spacesService as any,
    unitMediaService as any,
    mallAccess as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('only requests Malls assigned to a regular user', async () => {
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);
    spacesService.getMalls.mockResolvedValue([{ id: 'mall-1' }]);

    await controller.getMalls({ id: 'user-1', role: 'OPERATION' });

    expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith('user-1', 'OPERATION');
    expect(spacesService.getMalls).toHaveBeenCalledWith(['mall-1']);
  });

  it('keeps the full Mall list for a bypass role', async () => {
    mallAccess.getAccessibleMallIds.mockResolvedValue(null);

    await controller.getMalls({ id: 'admin-1', role: 'ADMIN' });

    expect(spacesService.getMalls).toHaveBeenCalledWith(undefined);
  });
});
