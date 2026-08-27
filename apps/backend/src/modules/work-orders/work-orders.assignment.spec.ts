import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';

describe('Work Order assignment lookups — Mall scoping', () => {
  const prisma: any = {
    department: { findMany: jest.fn(), findUnique: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const service = new WorkOrdersService(prisma, {} as any, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.department.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
  });

  describe('scope resolution', () => {
    const build = (accessible: string[] | null) => {
      const mallAccess: any = { getAccessibleMallIds: jest.fn().mockResolvedValue(accessible) };
      const controller = new WorkOrdersController({} as any, mallAccess);
      return { controller, mallAccess };
    };

    it('narrows an unrestricted role to the Mall it asked for', async () => {
      const { controller } = build(null);
      await expect((controller as any).lookupScope({ id: 'u1', role: 'ADMIN' }, 'mall-1'))
        .resolves.toEqual(['mall-1']);
    });

    it('leaves an unrestricted role unfiltered when no Mall is given', async () => {
      const { controller } = build(null);
      await expect((controller as any).lookupScope({ id: 'u1', role: 'ADMIN' }))
        .resolves.toBeUndefined();
    });

    it('intersects a granted role with its own Malls', async () => {
      const { controller } = build(['mall-1', 'mall-2']);
      await expect((controller as any).lookupScope({ id: 'u1', role: 'OPERATION' }, 'mall-2'))
        .resolves.toEqual(['mall-2']);
    });

    it('returns an empty scope — not an error — for an account with no grant', async () => {
      const { controller } = build([]);
      await expect((controller as any).lookupScope({ id: 'u1', role: 'OPERATION' }, 'mall-1'))
        .resolves.toEqual([]);
    });

    it('returns an empty scope for a Mall the account was not granted', async () => {
      const { controller } = build(['mall-9']);
      await expect((controller as any).lookupScope({ id: 'u1', role: 'OPERATION' }, 'mall-1'))
        .resolves.toEqual([]);
    });
  });

  it('returns nothing at all for an empty scope instead of the whole catalogue', async () => {
    await expect(service.assignmentDepartments([])).resolves.toEqual([]);
    await expect(service.assignmentAssignees([])).resolves.toEqual([]);
    expect(prisma.department.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('restricts the department catalogue to the scoped Malls and searches by name', async () => {
    await service.assignmentDepartments(['mall-1'], '  ky thuat ');

    expect(prisma.department.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        mallId: { in: ['mall-1'] },
        name: { contains: 'ky thuat', mode: 'insensitive' },
      },
    }));
  });

  it('offers only staff granted access to the scoped Malls, never tenants', async () => {
    await service.assignmentAssignees(['mall-1']);

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deletedAt: null,
        isActive: true,
        role: { not: 'TENANT' },
        mallAccess: { some: { mallId: { in: ['mall-1'] }, isActive: true } },
      }),
    }));
  });

  it('matches both the Department id and the legacy label when filtering by department', async () => {
    prisma.department.findUnique.mockResolvedValue({ id: 'dept-1', name: 'Kỹ thuật' });

    await service.assignmentAssignees(['mall-1'], 'dept-1');

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ department: { in: ['dept-1', 'Kỹ thuật'] } }),
    }));
  });

  it('resolves a legacy department label to the Department of the scoped Mall', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', fullName: 'Trần A', email: 'a@thiso.com', role: 'OPERATION', department: 'Kỹ thuật' },
      { id: 'u2', fullName: 'Lê B', email: 'b@thiso.com', role: 'OPERATION', department: 'dept-2' },
      { id: 'u3', fullName: 'Vũ C', email: 'c@thiso.com', role: 'OPERATION', department: null },
    ]);
    prisma.department.findMany.mockResolvedValue([
      { id: 'dept-1', name: 'Kỹ thuật', mallId: 'mall-1' },
      { id: 'dept-2', name: 'Vệ sinh', mallId: 'mall-1' },
    ]);

    const result = await service.assignmentAssignees(['mall-1']);

    expect(result.map((user: any) => user.departmentInfo?.name)).toEqual(['Kỹ thuật', 'Vệ sinh', undefined]);
    expect(prisma.department.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ mallId: { in: ['mall-1'] } }),
    }));
  });
});
