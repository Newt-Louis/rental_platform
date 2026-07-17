import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService admin safety and listing', () => {
  const prisma: any = {
    user: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };
  const service = new UsersService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('lists both active and locked non-deleted users by default', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 20 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { deletedAt: null },
    }));
  });

  it('applies server-side role, status and search filters', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.findAll({ page: 2, limit: 10, search: 'ops', role: Role.OPERATION, isActive: 'false' });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: expect.objectContaining({ role: Role.OPERATION, isActive: false, deletedAt: null, OR: expect.any(Array) }),
    }));
  });

  it('returns totals independent from list pagination', async () => {
    prisma.user.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);

    await expect(service.stats()).resolves.toEqual({ total: 12, active: 9, locked: 3, admins: 2 });
  });

  it('prevents an administrator from locking itself', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: Role.ADMIN, isActive: true });

    await expect(service.update('admin-1', { isActive: false }, 'admin-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('prevents deleting own account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: Role.ADMIN, isActive: true });

    await expect(service.remove('admin-1', 'admin-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents locking the last active administrator', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: Role.ADMIN, isActive: true });
    prisma.user.count.mockResolvedValue(0);

    await expect(service.update('admin-1', { isActive: false }, 'admin-2'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows locking an administrator when another active administrator remains', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: Role.ADMIN, isActive: true });
    prisma.user.count.mockResolvedValue(1);
    prisma.user.update.mockResolvedValue({ id: 'admin-1', isActive: false });

    await expect(service.update('admin-1', { isActive: false }, 'admin-2'))
      .resolves.toEqual({ id: 'admin-1', isActive: false });
  });
});
