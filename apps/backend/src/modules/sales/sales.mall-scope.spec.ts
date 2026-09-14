/**
 * MALL-001 / BC-007 — the Sales module had no Mall boundary of any kind.
 *
 * Proven at runtime on a two-Mall database (2026-09-07), as MALL_DIRECTOR holding
 * access to Mall A only:
 *
 *   GET  /sales?period=2026-08          -> Mall B's turnover row, brand name and
 *                                          gross sales of 777,000,000
 *   GET  /sales/summary?period=2026-08  -> totalGross 777,000,000, entirely Mall B
 *   GET  /sales/top-tenants             -> Mall B's tenant
 *   POST /sales/:id/approve             -> Mall B row moved PENDING -> APPROVED
 *   POST /sales/:id/dispute             -> Mall B row moved APPROVED -> DISPUTED
 *
 * Approval state on SalesTurnover feeds revenue-share billing, so the write half
 * was a financial control bypass, not only a read leak.
 *
 * These tests pin the two things that made it possible: list routes that never
 * derived a scope, and :id routes that trusted possession of the id.
 */
import { Role } from '@prisma/client';
import { SCOPE_KEY } from '../../common/decorators/scope.decorator';
import { EnforcementStatus } from '../../common/constants/scope.types';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

const MALL_A = 'mall-a';
const MALL_B = 'mall-b';

function buildController(accessible: string[] | null) {
  const salesService: any = {
    findAll: jest.fn(),
    getSummary: jest.fn(),
    getTopTenants: jest.fn(),
    getDeadlineStatus: jest.fn(),
    getAuditTrail: jest.fn(),
    approveSales: jest.fn(),
    disputeSales: jest.fn(),
  };
  const mallAccess: any = {
    getAccessibleMallIds: jest.fn().mockResolvedValue(accessible),
    extractAndValidateMallAccess: jest.fn(),
    assertMallAccess: jest.fn(),
  };
  return { controller: new SalesController(salesService, mallAccess), salesService, mallAccess };
}

const director = { id: 'director-1', role: Role.MALL_DIRECTOR };

describe('SalesController — every route derives its Mall scope server-side', () => {
  // The defining defect: no route asked who the caller was.
  it.each([
    ['findAll', (c: SalesController) => c.findAll({ period: '2026-08' }, director), 'findAll'],
    ['getSummary', (c: SalesController) => c.getSummary('2026-08', director), 'getSummary'],
    ['getTopTenants', (c: SalesController) => c.getTopTenants(director, '2026-08', 10), 'getTopTenants'],
    ['getDeadlineStatus', (c: SalesController) => c.getDeadlineStatus('2026-08', director), 'getDeadlineStatus'],
  ])('%s passes the caller accessible Mall set to the service', async (_name, call, method) => {
    const { controller, salesService, mallAccess } = buildController([MALL_A]);

    await call(controller);

    expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith(director.id, director.role);
    // The scope reaches the query as an argument, not as an assumption.
    expect(salesService[method].mock.calls[0]).toContainEqual([MALL_A]);
  });

  // MALL-04 — the only client-supplied filter on these routes is tenantId, and it
  // must narrow inside the derived set rather than replace it.
  it('a client-supplied tenantId cannot replace the derived Mall scope', async () => {
    const { controller, salesService } = buildController([MALL_A]);

    await controller.findAll({ tenantId: 'tenant-in-mall-b' }, director);

    const [query, , mallIds] = salesService.findAll.mock.calls[0];
    expect(query.tenantId).toBe('tenant-in-mall-b');
    expect(mallIds).toEqual([MALL_A]);
  });

  // MALL-03 — an empty scope is a scope, not an absent one.
  it('a caller with no accessible malls still passes a scope, not undefined', async () => {
    const { controller, salesService } = buildController([]);

    await controller.findAll({}, director);

    expect(salesService.findAll.mock.calls[0][2]).toEqual([]);
    expect(salesService.findAll.mock.calls[0][2]).not.toBeUndefined();
  });

  // ADMIN/TENANT bypass resolves to null; that is the one unrestricted case and
  // it comes from MallAccessService, never from an omitted argument.
  it('a bypass role propagates null rather than a fabricated list', async () => {
    const { controller, salesService } = buildController(null);

    await controller.findAll({}, { id: 'admin-1', role: Role.ADMIN });

    expect(salesService.findAll.mock.calls[0][2]).toBeNull();
  });
});

describe('SalesController — :id routes resolve the record owning Mall', () => {
  it.each([
    ['getAuditTrail', (c: SalesController) => c.getAuditTrail('sales-in-mall-b', director)],
    ['approveSales', (c: SalesController) => c.approveSales('sales-in-mall-b', director)],
    ['disputeSales', (c: SalesController) => c.disputeSales('sales-in-mall-b', { reason: 'x' } as any, director)],
  ])('%s validates ownership through the central resolver before acting', async (_n, call) => {
    const { controller, mallAccess } = buildController([MALL_A]);

    await call(controller);

    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(
      director.id,
      director.role,
      { salesTurnoverId: 'sales-in-mall-b' },
    );
  });

  it.each([
    ['approveSales', (c: SalesController) => c.approveSales('sales-in-mall-b', director), 'approveSales'],
    ['disputeSales', (c: SalesController) => c.disputeSales('sales-in-mall-b', { reason: 'x' } as any, director), 'disputeSales'],
  ])('%s does not mutate when the ownership check throws', async (_n, call, method) => {
    const { controller, salesService, mallAccess } = buildController([MALL_A]);
    mallAccess.extractAndValidateMallAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(call(controller)).rejects.toThrow();
    // The write must not have been reached. This is the half that changed
    // financial approval state on another mall's record.
    expect(salesService[method]).not.toHaveBeenCalled();
  });
});

describe('SalesService — the scope reaches the Prisma where clause', () => {
  function buildService() {
    const prisma: any = {
      salesTurnover: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      contract: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { service: new SalesService(prisma as any), prisma };
  }

  // SalesTurnover has no mallId of its own; the boundary is the Unit's.
  it('findAll filters through the unit owning Mall', async () => {
    const { service, prisma } = buildService();

    await service.findAll({ period: '2026-08' }, undefined, [MALL_A]);

    expect(prisma.salesTurnover.findMany.mock.calls[0][0].where).toMatchObject({
      unit: { mallId: { in: [MALL_A] } },
      period: '2026-08',
    });
    // The count must carry the same filter, or the page total would still
    // disclose how much data exists in other malls.
    expect(prisma.salesTurnover.count.mock.calls[0][0].where).toMatchObject({
      unit: { mallId: { in: [MALL_A] } },
    });
  });

  // PHASE 8 — the fail-open shape this codebase must never grow: `[]` treated as
  // "no filter". `[]` is truthy, so it becomes `{ in: [] }` and matches nothing.
  it('an empty scope matches no rows instead of every row', async () => {
    const { service, prisma } = buildService();

    await service.findAll({}, undefined, []);

    const { where } = prisma.salesTurnover.findMany.mock.calls[0][0];
    expect(where.unit).toEqual({ mallId: { in: [] } });
    expect(where).not.toEqual({});
  });

  it('only null lifts the filter, and null is reachable only for bypass roles', async () => {
    const { service, prisma } = buildService();

    await service.findAll({}, undefined, null);

    expect(prisma.salesTurnover.findMany.mock.calls[0][0].where.unit).toBeUndefined();
  });

  it.each([
    ['getSummary', (s: SalesService) => s.getSummary('2026-08', undefined, [MALL_A])],
    ['getTopTenants', (s: SalesService) => s.getTopTenants('2026-08', 10, [MALL_A])],
  ])('%s filters through the unit owning Mall', async (_n, call) => {
    const { service, prisma } = buildService();

    await call(service);

    expect(prisma.salesTurnover.findMany.mock.calls[0][0].where).toMatchObject({
      unit: { mallId: { in: [MALL_A] } },
    });
  });

  // The deadline report names tenants that have NOT submitted, so an unscoped
  // version disclosed other malls' tenants and contracts just as plainly.
  it('getDeadlineStatus scopes both the contracts it expects and the rows it counts', async () => {
    const { service, prisma } = buildService();

    await service.getDeadlineStatus('2026-08', [MALL_A]);

    expect(prisma.contract.findMany.mock.calls[0][0].where).toMatchObject({
      unit: { mallId: { in: [MALL_A] } },
    });
    expect(prisma.salesTurnover.findMany.mock.calls[0][0].where).toMatchObject({
      unit: { mallId: { in: [MALL_A] } },
    });
  });

  it('a TENANT stays bounded by tenantId even with an unrestricted Mall scope', async () => {
    const { service, prisma } = buildService();

    await service.findAll({ tenantId: 'someone-else' }, { id: 'u', role: 'TENANT', tenantId: 'my-tenant' }, null);

    expect(prisma.salesTurnover.findMany.mock.calls[0][0].where.tenantId).toBe('my-tenant');
  });
});

describe('SalesController — the scope declaration matches reality', () => {
  it('no longer declares itself a GAP', () => {
    const scope = Reflect.getMetadata(SCOPE_KEY, SalesController);
    expect(scope.status).toBe(EnforcementStatus.ENFORCED);
    expect(scope.status).not.toBe(EnforcementStatus.GAP);
  });
});
