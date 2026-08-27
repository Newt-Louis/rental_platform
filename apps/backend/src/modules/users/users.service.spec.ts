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

  it('includes active mall access with mall name for each listed user', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 20 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        mallAccess: {
          where: { isActive: true },
          select: { mall: { select: { id: true, name: true } } },
        },
      }),
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
      .resolves.toEqual({ id: 'admin-1', isActive: false, departmentInfo: null });
  });
});

describe('UsersService account creation reference validation', () => {
  const prisma: any = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    tenant: { findUnique: jest.fn() },
    department: { findUnique: jest.fn(), findMany: jest.fn() },
    mall: { findMany: jest.fn() },
    userMallAccess: { createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new UsersService(prisma);

  const baseDto = { email: 'New.User@Thiso.com', password: 'Passw0rd!', fullName: ' New User ' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.department.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    prisma.user.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'user-1', ...data }));
  });

  it('stores blank optional references as null instead of an empty foreign key', async () => {
    await service.create({ ...baseDto, role: Role.LEASING_EXECUTIVE, tenantId: '', department: '', phone: '  ' } as any);

    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: null, department: null, phone: null }),
    }));
  });

  it('normalizes the email and trims the full name', async () => {
    await service.create({ ...baseDto } as any);

    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'new.user@thiso.com', fullName: 'New User' }),
    }));
  });

  it('rejects a tenant link on a non-TENANT account with an actionable code', async () => {
    await expect(service.create({ ...baseDto, role: Role.FINANCE, tenantId: 'tenant-1' } as any))
      .rejects.toMatchObject({ response: { code: 'USER_TENANT_ROLE_MISMATCH' } });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown tenant before hitting the database constraint', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.create({ ...baseDto, role: Role.TENANT, tenantId: 'ghost' } as any))
      .rejects.toMatchObject({ response: { code: 'USER_TENANT_NOT_FOUND' } });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown department', async () => {
    prisma.department.findUnique.mockResolvedValue(null);

    await expect(service.create({ ...baseDto, department: 'ghost' } as any))
      .rejects.toMatchObject({ response: { code: 'USER_DEPARTMENT_NOT_FOUND' } });
  });

  it('grants the selected Malls in the same transaction as the account', async () => {
    prisma.mall.findMany.mockResolvedValue([{ id: 'mall-1' }, { id: 'mall-2' }]);

    await service.create(
      { ...baseDto, role: Role.OPERATION, mallIds: ['mall-1', 'mall-2'] } as any,
      'admin-1',
    );

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.userMallAccess.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', mallId: 'mall-1', role: Role.OPERATION, grantedById: 'admin-1', isActive: true },
        { userId: 'user-1', mallId: 'mall-2', role: Role.OPERATION, grantedById: 'admin-1', isActive: true },
      ],
    });
  });

  it('refuses Mall scope for roles that are portfolio-wide', async () => {
    await expect(service.create({ ...baseDto, role: Role.ADMIN, mallIds: ['mall-1'] } as any))
      .rejects.toMatchObject({ response: { code: 'USER_MALL_SCOPE_NOT_APPLICABLE' } });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses to create the account when a selected Mall no longer exists', async () => {
    prisma.mall.findMany.mockResolvedValue([{ id: 'mall-1' }]);

    await expect(service.create({ ...baseDto, role: Role.FINANCE, mallIds: ['mall-1', 'ghost'] } as any))
      .rejects.toMatchObject({ response: { code: 'USER_MALL_NOT_FOUND' } });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('keeps ungranted accounts visible when the list is scoped to a Mall', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 20 }, 'mall-1');

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{
          OR: [
            { mallAccess: { some: { mallId: 'mall-1', isActive: true } } },
            { mallAccess: { none: { isActive: true } } },
          ],
        }],
      }),
    }));
  });

  it('clears a tenant link when the account leaves the TENANT role', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.TENANT, isActive: true, department: null });
    prisma.user.update.mockResolvedValue({ id: 'u1' });

    await service.update('u1', { role: Role.OPERATION }, 'admin-1');

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: Role.OPERATION, tenantId: null }),
    }));
  });

  it('keeps a legacy free-text department value on update', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.FINANCE, isActive: true, department: 'Finance' });
    prisma.user.update.mockResolvedValue({ id: 'u1' });

    await service.update('u1', { department: 'Finance' }, 'admin-1');

    expect(prisma.department.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ department: 'Finance' }),
    }));
  });
});
