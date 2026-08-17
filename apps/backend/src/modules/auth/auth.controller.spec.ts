import { AuthController } from './auth.controller';

describe('AuthController active Mall permissions', () => {
  const authService = { setActiveMall: jest.fn() };
  const mallAccess = { assertMallAccess: jest.fn() };
  const controller = new AuthController(authService as any, mallAccess as any);

  beforeEach(() => jest.clearAllMocks());

  it('validates permission before changing the active Mall', async () => {
    authService.setActiveMall.mockResolvedValue({ activeMallId: 'mall-1' });

    await controller.setActiveMall(
      { id: 'user-1', role: 'OPERATION' },
      { mallId: 'mall-1' },
    );

    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('user-1', 'OPERATION', 'mall-1');
    expect(authService.setActiveMall).toHaveBeenCalledWith('user-1', 'mall-1');
  });

  it('allows clearing the active Mall without a permission lookup', async () => {
    await controller.setActiveMall(
      { id: 'user-1', role: 'OPERATION' },
      { mallId: null },
    );

    expect(mallAccess.assertMallAccess).not.toHaveBeenCalled();
    expect(authService.setActiveMall).toHaveBeenCalledWith('user-1', null);
  });
});
