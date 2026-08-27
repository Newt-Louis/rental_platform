import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UserMallAccessService } from './user-mall-access.service';

describe('UserMallAccessService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    mall: { findUnique: jest.fn() },
    userMallAccess: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  let service: UserMallAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserMallAccessService(prisma);
  });

  it('grants or restores access for an active user with a grantable role', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isActive: true });
    prisma.mall.findUnique.mockResolvedValue({ id: 'mall-1' });
    prisma.userMallAccess.upsert.mockResolvedValue({ id: 'access-1' });

    await expect(service.grantAccess({
      userId: 'user-1', mallId: 'mall-1', role: Role.LEASING_EXECUTIVE,
    }, 'admin-1')).resolves.toEqual({ id: 'access-1' });

    expect(prisma.userMallAccess.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_mallId: { userId: 'user-1', mallId: 'mall-1' } },
      update: expect.objectContaining({ isActive: true, grantedById: 'admin-1' }),
    }));
  });

  it('rejects access for an inactive user before writing', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isActive: false });
    prisma.mall.findUnique.mockResolvedValue({ id: 'mall-1' });

    await expect(service.grantAccess({
      userId: 'user-1', mallId: 'mall-1', role: Role.FINANCE,
    }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.userMallAccess.upsert).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.CEO, Role.TENANT])('rejects non-scoped role %s', async (role) => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isActive: true });
    prisma.mall.findUnique.mockResolvedValue({ id: 'mall-1' });

    await expect(service.grantAccess({ userId: 'user-1', mallId: 'mall-1', role }, 'admin-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.userMallAccess.upsert).not.toHaveBeenCalled();
  });

  it('rejects an unknown runtime role instead of leaking a Prisma error', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isActive: true });
    prisma.mall.findUnique.mockResolvedValue({ id: 'mall-1' });

    await expect(service.grantAccess({
      userId: 'user-1', mallId: 'mall-1', role: 'ROOT' as Role,
    }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns not found when revoking a missing grant', async () => {
    prisma.userMallAccess.findUnique.mockResolvedValue(null);
    await expect(service.revokeAccess('user-1', 'mall-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.userMallAccess.update).not.toHaveBeenCalled();
  });

  it('soft-revokes an existing grant', async () => {
    prisma.userMallAccess.findUnique.mockResolvedValue({ id: 'access-1' });
    prisma.userMallAccess.update.mockResolvedValue({ id: 'access-1', isActive: false });

    await service.revokeAccess('user-1', 'mall-1');
    expect(prisma.userMallAccess.update).toHaveBeenCalledWith({
      where: { userId_mallId: { userId: 'user-1', mallId: 'mall-1' } },
      data: { isActive: false },
    });
  });

  it('lists only active grants for a user', async () => {
    prisma.userMallAccess.findMany.mockResolvedValue([]);
    await service.listForUser('user-1');
    expect(prisma.userMallAccess.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', isActive: true },
    }));
  });
});
