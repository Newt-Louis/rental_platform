import { ForbiddenException } from '@nestjs/common';
import { MallAccessService } from './mall-access.service';

describe('MallAccessService resource resolution', () => {
  const prisma = {
    userMallAccess: { findFirst: jest.fn() },
    unit: { findUnique: jest.fn() },
    floor: { findUnique: jest.fn() },
    contract: { findUnique: jest.fn() },
    fitoutProject: { findUnique: jest.fn() },
    fitoutSubmittal: { findUnique: jest.fn() },
    fitoutIssue: { findUnique: jest.fn() },
    invoice: { findUnique: jest.fn() },
    unitBooking: { findUnique: jest.fn() },
    unitSlot: { findUnique: jest.fn() },
    slotBooking: { findUnique: jest.fn() },
    slotPricingRule: { findUnique: jest.fn() },
    servicePriceCatalog: { findUnique: jest.fn() },
    fitoutTask: { findUnique: jest.fn() },
    fitoutDailyReportEntry: { findUnique: jest.fn() },
    mallAnnouncement: { findUnique: jest.fn() },
  };
  let service: MallAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MallAccessService(prisma as any);
  });

  it.each([
    ['fitoutProjectId', 'fitoutProject'],
    ['fitoutSubmittalId', 'fitoutSubmittal'],
    ['fitoutIssueId', 'fitoutIssue'],
    ['invoiceId', 'invoice'],
    ['bookingId', 'unitBooking'],
    ['slotId', 'unitSlot'],
    ['slotBookingId', 'slotBooking'],
    ['slotPricingRuleId', 'slotPricingRule'],
  ])('enforces mall access resolved from %s', async (source, repository) => {
    const relation = repository === 'fitoutProject'
      ? { unit: { mallId: 'mall-1', floor: null } }
      : repository === 'fitoutSubmittal'
        ? { project: { unit: { mallId: 'mall-1', floor: null } } }
        : repository === 'fitoutIssue'
          ? { unit: { mallId: 'mall-1', floor: null } }
      : repository === 'invoice'
        ? { contract: { unit: { mallId: 'mall-1', floor: null } } }
        : repository === 'slotBooking' || repository === 'slotPricingRule'
          ? { slot: { unit: { mallId: 'mall-1', floor: null } } }
          : { unit: { mallId: 'mall-1', floor: null } };
    (prisma as any)[repository].findUnique.mockResolvedValue(relation);
    prisma.userMallAccess.findFirst.mockResolvedValue(null);

    await expect(service.extractAndValidateMallAccess(
      'user-1',
      'OPERATION',
      { [source]: 'resource-1' },
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.userMallAccess.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', mallId: 'mall-1', isActive: true },
    });
  });
});

// CR-101 Phase 3A -- negative + positive cross-Mall coverage for the 4 new
// resolvers this phase added (servicePriceCatalogId, fitoutGanttTaskId,
// fitoutDailyReportEntryId, announcementId). Every Batch A route delegates
// its authorization decision through one of these resolvers via
// extractAndValidateMallAccess, so proving DENY-on-different-mall and
// ALLOW-on-same-mall here is the correct level to prove the routes are safe,
// rather than duplicating supertest e2e per controller (no such e2e/supertest
// harness exists elsewhere in this codebase to extend).
describe('MallAccessService — CR-101 Phase 3A new resolvers', () => {
  const prisma = {
    userMallAccess: { findFirst: jest.fn() },
    servicePriceCatalog: { findUnique: jest.fn() },
    fitoutTask: { findUnique: jest.fn() },
    fitoutDailyReportEntry: { findUnique: jest.fn() },
    mallAnnouncement: { findUnique: jest.fn() },
  };
  let service: MallAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MallAccessService(prisma as any);
  });

  const cases: Array<[string, string, unknown]> = [
    ['servicePriceCatalogId', 'servicePriceCatalog', { mallId: 'mall-1' }],
    ['fitoutGanttTaskId', 'fitoutTask', { project: { unit: { mallId: 'mall-1', floor: null } } }],
    ['fitoutDailyReportEntryId', 'fitoutDailyReportEntry', { project: { unit: { mallId: 'mall-1', floor: null } } }],
    ['announcementId', 'mallAnnouncement', { mallId: 'mall-1' }],
  ];

  it.each(cases)('DENY: %s resolved to a different Mall than the caller has access to', async (source, repository, relation) => {
    (prisma as any)[repository].findUnique.mockResolvedValue(relation);
    prisma.userMallAccess.findFirst.mockResolvedValue(null); // caller has no UserMallAccess row for mall-1

    await expect(service.extractAndValidateMallAccess(
      'user-A',
      'OPERATION',
      { [source]: 'resource-1' },
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.userMallAccess.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-A', mallId: 'mall-1', isActive: true },
    });
  });

  it.each(cases)('ALLOW: %s resolved to a Mall the caller does have access to', async (source, repository, relation) => {
    (prisma as any)[repository].findUnique.mockResolvedValue(relation);
    prisma.userMallAccess.findFirst.mockResolvedValue({ id: 'access-1', userId: 'user-A', mallId: 'mall-1', isActive: true });

    await expect(service.extractAndValidateMallAccess(
      'user-A',
      'OPERATION',
      { [source]: 'resource-1' },
    )).resolves.toBeUndefined();
  });

  it.each(cases)('ADMIN bypasses the check entirely (CEO no longer does, CR-101 Phase 3G) for %s (no resolver lookup performed)', async (source, repository) => {
    await service.extractAndValidateMallAccess('user-admin', 'ADMIN', { [source]: 'resource-1' });
    expect((prisma as any)[repository].findUnique).not.toHaveBeenCalled();
    expect(prisma.userMallAccess.findFirst).not.toHaveBeenCalled();
  });
});

// CR-101 Phase 3B -- same DENY/ALLOW/bypass coverage for the one genuinely new
// resolver this phase added (`zoneId`, Zone's own-id lookup). Mall/Floor/Unit's
// own-id routes reuse the pre-existing `mallId`(direct)/`floorId`/`unitId`
// sources unchanged -- already covered by the tests above and the Phase 3A
// block, so no new resolver-level tests are needed for those three.
describe('MallAccessService — CR-101 Phase 3B new resolver (zoneId)', () => {
  const prisma = {
    userMallAccess: { findFirst: jest.fn() },
    zone: { findUnique: jest.fn() },
  };
  let service: MallAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MallAccessService(prisma as any);
  });

  it('DENY: zoneId resolved to a different Mall than the caller has access to', async () => {
    prisma.zone.findUnique.mockResolvedValue({ mallId: 'mall-1' });
    prisma.userMallAccess.findFirst.mockResolvedValue(null);

    await expect(service.extractAndValidateMallAccess(
      'user-A', 'OPERATION', { zoneId: 'zone-1' },
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.userMallAccess.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-A', mallId: 'mall-1', isActive: true },
    });
  });

  it('ALLOW: zoneId resolved to a Mall the caller does have access to', async () => {
    prisma.zone.findUnique.mockResolvedValue({ mallId: 'mall-1' });
    prisma.userMallAccess.findFirst.mockResolvedValue({ id: 'access-1', userId: 'user-A', mallId: 'mall-1', isActive: true });

    await expect(service.extractAndValidateMallAccess(
      'user-A', 'OPERATION', { zoneId: 'zone-1' },
    )).resolves.toBeUndefined();
  });

  it('ADMIN bypasses the check entirely (CEO no longer does, CR-101 Phase 3G) for zoneId (no resolver lookup performed)', async () => {
    await service.extractAndValidateMallAccess('user-admin', 'ADMIN', { zoneId: 'zone-1' });
    expect(prisma.zone.findUnique).not.toHaveBeenCalled();
    expect(prisma.userMallAccess.findFirst).not.toHaveBeenCalled();
  });
});

// CR-101 Phase 3C (C3) -- DENY/ALLOW/bypass coverage for the 4 new resolvers
// this batch added (workOrder, parkingCustomerContract, serviceContract --
// direct-field lookups; patrolCheck -- folds patrol.service.ts's existing,
// unchanged checkMallId() logic into this canonical registry). These back
// files.controller.ts's remaining 5 GAP routes closing to ENFORCED (Maintenance
// reuses the pre-existing maintenanceSchedule resolver, already covered by
// Phase-1-era tests, not re-tested here).
describe('MallAccessService — CR-101 Phase 3C (C3) new resolvers', () => {
  const prisma = {
    userMallAccess: { findFirst: jest.fn() },
    workOrder: { findUnique: jest.fn() },
    parkingCustomerContract: { findUnique: jest.fn() },
    serviceContract: { findUnique: jest.fn() },
    patrolCheck: { findUnique: jest.fn() },
  };
  let service: MallAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MallAccessService(prisma as any);
  });

  const cases: Array<[string, string, unknown]> = [
    ['workOrderId', 'workOrder', { mallId: 'mall-1' }],
    ['parkingCustomerContractId', 'parkingCustomerContract', { mallId: 'mall-1' }],
    ['serviceContractId', 'serviceContract', { mallId: 'mall-1' }],
    ['patrolCheckId', 'patrolCheck', { shift: { mallId: 'mall-1' } }],
  ];

  it.each(cases)('DENY: %s resolved to a different Mall than the caller has access to', async (source, repository, relation) => {
    (prisma as any)[repository].findUnique.mockResolvedValue(relation);
    prisma.userMallAccess.findFirst.mockResolvedValue(null);

    await expect(service.extractAndValidateMallAccess(
      'user-A', 'OPERATION', { [source]: 'resource-1' },
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.userMallAccess.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-A', mallId: 'mall-1', isActive: true },
    });
  });

  it.each(cases)('ALLOW: %s resolved to a Mall the caller does have access to', async (source, repository, relation) => {
    (prisma as any)[repository].findUnique.mockResolvedValue(relation);
    prisma.userMallAccess.findFirst.mockResolvedValue({ id: 'access-1', userId: 'user-A', mallId: 'mall-1', isActive: true });

    await expect(service.extractAndValidateMallAccess(
      'user-A', 'OPERATION', { [source]: 'resource-1' },
    )).resolves.toBeUndefined();
  });

  it.each(cases)('ADMIN bypasses the check entirely (CEO no longer does, CR-101 Phase 3G) for %s (no resolver lookup performed)', async (source, repository) => {
    await service.extractAndValidateMallAccess('user-admin', 'ADMIN', { [source]: 'resource-1' });
    expect((prisma as any)[repository].findUnique).not.toHaveBeenCalled();
    expect(prisma.userMallAccess.findFirst).not.toHaveBeenCalled();
  });

  it('patrolCheckId resolves via shift.mallId, not point.route.mallId -- proves the fold reused the correct (shift-based) chain from checkMallId(), not the parallel un-cross-validated point/route path', async () => {
    prisma.patrolCheck.findUnique.mockResolvedValue({ shift: { mallId: 'mall-1' } });
    prisma.userMallAccess.findFirst.mockResolvedValue({ id: 'access-1', userId: 'user-A', mallId: 'mall-1', isActive: true });

    await service.extractAndValidateMallAccess('user-A', 'OPERATION', { patrolCheckId: 'check-1' });

    expect(prisma.patrolCheck.findUnique).toHaveBeenCalledWith({
      where: { id: 'check-1' },
      select: { shift: { select: { mallId: true } } },
    });
  });
});

// CR-101 Phase 3D -- DENY/ALLOW/bypass coverage for the one new resolver this
// phase added (floorPlanAnalysisId), backing ai.controller.ts's
// getAnalysis/pollStatus/applyAnalysis routes closing from zero-Mall-check to
// ENFORCED.
describe('MallAccessService — CR-101 Phase 3D new resolver (floorPlanAnalysisId)', () => {
  const prisma = {
    userMallAccess: { findFirst: jest.fn() },
    floorPlanAnalysis: { findUnique: jest.fn() },
  };
  let service: MallAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MallAccessService(prisma as any);
  });

  it('DENY: floorPlanAnalysisId resolved to a different Mall than the caller has access to', async () => {
    prisma.floorPlanAnalysis.findUnique.mockResolvedValue({ mallId: 'mall-1' });
    prisma.userMallAccess.findFirst.mockResolvedValue(null);

    await expect(service.extractAndValidateMallAccess(
      'user-A', 'MALL_DIRECTOR', { floorPlanAnalysisId: 'analysis-1' },
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.userMallAccess.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-A', mallId: 'mall-1', isActive: true },
    });
  });

  it('ALLOW: floorPlanAnalysisId resolved to a Mall the caller does have access to', async () => {
    prisma.floorPlanAnalysis.findUnique.mockResolvedValue({ mallId: 'mall-1' });
    prisma.userMallAccess.findFirst.mockResolvedValue({ id: 'access-1', userId: 'user-A', mallId: 'mall-1', isActive: true });

    await expect(service.extractAndValidateMallAccess(
      'user-A', 'MALL_DIRECTOR', { floorPlanAnalysisId: 'analysis-1' },
    )).resolves.toBeUndefined();
  });

  it('ADMIN bypasses the check entirely (CEO no longer does, CR-101 Phase 3G) for floorPlanAnalysisId (no resolver lookup performed)', async () => {
    await service.extractAndValidateMallAccess('user-admin', 'ADMIN', { floorPlanAnalysisId: 'analysis-1' });
    expect(prisma.floorPlanAnalysis.findUnique).not.toHaveBeenCalled();
    expect(prisma.userMallAccess.findFirst).not.toHaveBeenCalled();
  });
});

// CR-101 Phase 3G (BC-CEO-SCOPE, Option A) -- CEO is no longer a blanket BYPASS_ROLES
// member. It gets unrestricted read ONLY when a call site explicitly opts in via
// `{ crossMallRead: true }`, and ONLY because CEO is in CROSS_MALL_READ_ROLES -- an
// ordinary role passing the same opt-in gets no special treatment.
describe('MallAccessService — CR-101 Phase 3G CROSS_MALL_READ (crossMallRead opt-in)', () => {
  const prisma = {
    userMallAccess: { findFirst: jest.fn(), findMany: jest.fn() },
    unit: { findUnique: jest.fn() },
  };
  let service: MallAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MallAccessService(prisma as any);
  });

  it('getAccessibleMallIds: CEO without crossMallRead opt-in gets the ordinary UserMallAccess-derived list, not unrestricted', async () => {
    prisma.userMallAccess.findMany.mockResolvedValue([{ mallId: 'mall-1' }]);

    const result = await service.getAccessibleMallIds('user-ceo', 'CEO');

    expect(result).toEqual(['mall-1']);
    expect(prisma.userMallAccess.findMany).toHaveBeenCalled();
  });

  it('getAccessibleMallIds: CEO WITH crossMallRead opt-in gets unrestricted (null), no DB lookup', async () => {
    const result = await service.getAccessibleMallIds('user-ceo', 'CEO', { crossMallRead: true });

    expect(result).toBeNull();
    expect(prisma.userMallAccess.findMany).not.toHaveBeenCalled();
  });

  it('getAccessibleMallIds: an ordinary role (MALL_DIRECTOR) with crossMallRead:true gets no special treatment', async () => {
    prisma.userMallAccess.findMany.mockResolvedValue([{ mallId: 'mall-2' }]);

    const result = await service.getAccessibleMallIds('user-md', 'MALL_DIRECTOR', { crossMallRead: true });

    expect(result).toEqual(['mall-2']);
  });

  it('assertMallAccess: CEO without crossMallRead opt-in is denied a Mall it has no UserMallAccess grant for', async () => {
    prisma.userMallAccess.findFirst.mockResolvedValue(null);

    await expect(
      service.assertMallAccess('user-ceo', 'CEO', 'mall-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assertMallAccess: CEO WITH crossMallRead opt-in is never denied, no DB lookup', async () => {
    await expect(
      service.assertMallAccess('user-ceo', 'CEO', 'mall-1', { crossMallRead: true }),
    ).resolves.toBeUndefined();
    expect(prisma.userMallAccess.findFirst).not.toHaveBeenCalled();
  });

  it('extractAndValidateMallAccess: CEO WITH crossMallRead opt-in skips resolution entirely, even for a mismatched-Mall entity', async () => {
    prisma.unit.findUnique.mockResolvedValue({ mallId: 'mall-99', floor: null });

    await expect(
      service.extractAndValidateMallAccess('user-ceo', 'CEO', { unitId: 'unit-1' }, { crossMallRead: true }),
    ).resolves.toBeUndefined();
    expect(prisma.unit.findUnique).not.toHaveBeenCalled();
  });

  it('extractAndValidateMallAccess: CEO WITHOUT crossMallRead opt-in is denied like any ordinary role', async () => {
    prisma.unit.findUnique.mockResolvedValue({ mallId: 'mall-1', floor: null });
    prisma.userMallAccess.findFirst.mockResolvedValue(null);

    await expect(
      service.extractAndValidateMallAccess('user-ceo', 'CEO', { unitId: 'unit-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hasCrossMallRead: true only for CEO among the roles checked', () => {
    expect(service.hasCrossMallRead('CEO')).toBe(true);
    expect(service.hasCrossMallRead('ADMIN')).toBe(false);
    expect(service.hasCrossMallRead('MALL_DIRECTOR')).toBe(false);
    expect(service.hasCrossMallRead(undefined)).toBe(false);
  });
});
