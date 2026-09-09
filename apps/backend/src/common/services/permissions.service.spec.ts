import { Role } from '@prisma/client';
import { PermissionsService } from './permissions.service';

describe('PermissionsService configured-empty semantics', () => {
  it('PERM-FITOUT-EMPTY-001 distinguishes an explicit revoke from missing configuration', async () => {
    const prisma = {
      modulePermission: {
        findMany: jest.fn().mockResolvedValue([
          { mallId: 'mall-a', module: 'fitout', role: Role.OPERATION, allowed: false },
        ]),
      },
    };
    const service = new PermissionsService(prisma as any);

    const roles = await service.getAllowedRoles('fitout', 'mall-a');

    expect(roles).toBeInstanceOf(Set);
    expect(roles?.size).toBe(0);
  });

  it('PERM-FITOUT-NOCONFIG-002 returns null only when no tier is configured', async () => {
    const prisma = {
      modulePermission: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PermissionsService(prisma as any);

    await expect(service.getAllowedRoles('fitout', 'mall-a')).resolves.toBeNull();
  });
});
