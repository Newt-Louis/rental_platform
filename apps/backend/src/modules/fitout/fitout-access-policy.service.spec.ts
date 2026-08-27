import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { FitoutAccessPolicyService } from './fitout-access-policy.service';

describe('FitoutAccessPolicyService', () => {
  const prisma = {
    fitoutProject: { findUnique: jest.fn() },
    fitoutSubmittal: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
  };
  let service: FitoutAccessPolicyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FitoutAccessPolicyService(prisma as any);
    prisma.fitoutProject.findUnique.mockResolvedValue({
      id: 'project-1',
      tenantId: 'tenant-1',
      contract: { currencyCode: 'USD' },
      unit: { mallId: 'mall-1', floor: { mallId: 'mall-1' } },
    });
  });

  it('resolves the authoritative project Mall and immutable Contract currency', async () => {
    await expect(service.getProjectContext('project-1')).resolves.toEqual({
      id: 'project-1', tenantId: 'tenant-1', mallId: 'mall-1', contractCurrencyCode: 'USD',
    });
  });

  it('allows only the owning Tenant to access a project', async () => {
    await expect(service.assertTenantProject('project-1', { tenantId: 'tenant-1' })).resolves.toBeDefined();
    await expect(service.assertTenantProject('project-1', { tenantId: 'tenant-2' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires own-Tenant and own-submitter for Tenant submittal mutation', async () => {
    prisma.fitoutSubmittal.findUnique.mockResolvedValue({
      id: 'sub-1', projectId: 'project-1', submittedById: 'tenant-user-1',
      project: { tenantId: 'tenant-1' },
    });

    await expect(service.assertTenantSubmittal(
      'sub-1', { id: 'tenant-user-1', tenantId: 'tenant-1' }, true,
    )).resolves.toBeDefined();
    await expect(service.assertTenantSubmittal(
      'sub-1', { id: 'tenant-user-2', tenantId: 'tenant-1' }, true,
    )).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires active project-Mall access and the exact OPERATION role for assignment', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'operation-1', role: Role.OPERATION, isActive: true, mallAccess: [{ id: 'access-1' }],
    });
    await expect(service.assertActiveProjectMallUser('project-1', 'operation-1', Role.OPERATION))
      .resolves.toBeDefined();

    prisma.user.findUnique.mockResolvedValue({
      id: 'director-1', role: Role.MALL_DIRECTOR, isActive: true, mallAccess: [{ id: 'access-1' }],
    });
    await expect(service.assertActiveProjectMallUser('project-1', 'director-1', Role.OPERATION))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([Role.TENANT, Role.FINANCE, Role.CEO])(
    'rejects %s as a fitout staff target even with Mall access',
    async (role) => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'target-1', role, isActive: true, mallAccess: [{ id: 'access-1' }],
      });
      await expect(service.assertActiveProjectMallUser('project-1', 'target-1'))
        .rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('allows active ADMIN as the only global recipient exception', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1', role: Role.ADMIN, isActive: true, mallAccess: [],
    });
    await expect(service.assertActiveProjectMallUser('project-1', 'admin-1')).resolves.toBeDefined();

    prisma.user.findUnique.mockResolvedValue({
      id: 'director-1', role: Role.MALL_DIRECTOR, isActive: true, mallAccess: [],
    });
    await expect(service.assertActiveProjectMallUser('project-1', 'director-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('builds recipient selection from active ADMIN plus active requested role at the project Mall', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.findProjectMallRecipients('project-1', Role.OPERATION);

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isActive: true,
        OR: [
          { role: Role.ADMIN },
          { role: Role.OPERATION, mallAccess: { some: { mallId: 'mall-1', isActive: true } } },
        ],
      },
    }));
  });

  it('never selects Tenant recipients from a stale workflow role configuration', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.findProjectMallRecipients('project-1', Role.TENANT);

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, OR: [{ role: Role.ADMIN }] },
    }));
  });
});
