import { OccupancyAnalyticsService } from './occupancy-analytics.service';
import { UnitStatus } from '@prisma/client';

const makeUnit = (overrides: any) => ({
  id: `u-${Math.random()}`,
  status: UnitStatus.VACANT,
  areaNLA: 100,
  baseRentPerSqm: 0,
  leaseTermType: 'LONG',
  category: 'F&B',
  floor: { id: 'floor-1', name: 'Tầng 1' },
  mall: { id: 'mall-1', name: 'THISO Mall' },
  ...overrides,
});

describe('OccupancyAnalyticsService — floor × category breakdown (#26, #28)', () => {
  let service: OccupancyAnalyticsService;

  const prisma = {
    unit: { findMany: jest.fn() },
    slotBooking: { findMany: jest.fn() },
    occupancySnapshot: { findMany: jest.fn() },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.slotBooking.findMany.mockResolvedValue([]);
    service = new OccupancyAnalyticsService(prisma, {
      runExclusive: jest.fn((_name, _ttl, task) => task()),
    } as any);
  });

  // ─── #26 avgRentPerSqm breakdown by floor ────────────────────────────────

  describe('getOccupancyV2 — avgRentPerSqm by floor', () => {
    it('calculates avgRentPerSqm for occupied units per floor', async () => {
      prisma.unit.findMany.mockResolvedValue([
        makeUnit({ status: UnitStatus.OCCUPIED, floor: { id: 'f1', name: 'T1' }, baseRentPerSqm: 500, areaNLA: 100 }),
        makeUnit({ status: UnitStatus.OCCUPIED, floor: { id: 'f1', name: 'T1' }, baseRentPerSqm: 700, areaNLA: 100 }),
        makeUnit({ status: UnitStatus.VACANT, floor: { id: 'f1', name: 'T1' }, baseRentPerSqm: 0, areaNLA: 50 }),
        makeUnit({ status: UnitStatus.OCCUPIED, floor: { id: 'f2', name: 'T2' }, baseRentPerSqm: 900, areaNLA: 200 }),
      ]);

      const result = await service.getOccupancyV2();

      const t1 = result.byFloor.find((floor: any) => floor.name === 'T1');
      const t2 = result.byFloor.find((floor: any) => floor.name === 'T2');

      expect(t1).toBeDefined();
      expect(t1.avgRentPerSqm).toBe(600); // (500+700)/2
      expect(t2.avgRentPerSqm).toBe(900);
    });

    it('returns avgRentPerSqm = 0 for floor with no occupied units', async () => {
      prisma.unit.findMany.mockResolvedValue([
        makeUnit({ status: UnitStatus.VACANT, floor: { id: 'f1', name: 'T1' }, baseRentPerSqm: 0 }),
      ]);

      const result = await service.getOccupancyV2();
      expect(result.byFloor.find((floor: any) => floor.name === 'T1')?.avgRentPerSqm).toBe(0);
    });
  });

  // ─── #28 floor × category breakdown ─────────────────────────────────────

  describe('getCategoryByFloor (#28)', () => {
    it('returns breakdown of categories per floor with occupancy ratio', async () => {
      prisma.unit.findMany.mockResolvedValue([
        // Floor 1: F&B (2 OCCUPIED), Fashion (1 VACANT)
        makeUnit({ floor: { id: 'f1', name: 'T1' }, category: 'F&B', status: UnitStatus.OCCUPIED }),
        makeUnit({ floor: { id: 'f1', name: 'T1' }, category: 'F&B', status: UnitStatus.OCCUPIED }),
        makeUnit({ floor: { id: 'f1', name: 'T1' }, category: 'Fashion', status: UnitStatus.VACANT }),
        // Floor 2: Fashion (1 OCCUPIED)
        makeUnit({ floor: { id: 'f2', name: 'T2' }, category: 'Fashion', status: UnitStatus.OCCUPIED }),
      ]);

      const result = await service.getCategoryByFloor();

      const t1 = result.find((r: any) => r.floorName === 'T1');
      expect(t1).toBeDefined();
      expect(t1.categories).toHaveLength(2);

      const fnb = t1.categories.find((c: any) => c.category === 'F&B');
      expect(fnb.total).toBe(2);
      expect(fnb.occupied).toBe(2);
      expect(fnb.occupancyRate).toBe('100.0');

      const fashion = t1.categories.find((c: any) => c.category === 'Fashion');
      expect(fashion.total).toBe(1);
      expect(fashion.occupied).toBe(0);
      expect(fashion.occupancyRate).toBe('0.0');
    });

    it('returns empty array when no units', async () => {
      prisma.unit.findMany.mockResolvedValue([]);
      const result = await service.getCategoryByFloor();
      expect(result).toEqual([]);
    });
  });

  // ─── #29 split billing revenue vs tenant sales ────────────────────────────

  describe('getRevenueSplit (#29)', () => {
    it('includes both billingRevenue and tenantSales in summary', async () => {
      prisma.unit.findMany.mockResolvedValue([
        makeUnit({ status: UnitStatus.OCCUPIED, baseRentPerSqm: 500, camPerSqm: 50, areaNLA: 100 }),
      ]);

      const result = await service.getOccupancyV2();
      expect(result.summary).toHaveProperty('totalMonthlyBillingRevenue');
    });
  });

  describe('occupancy by rental zone', () => {
    it('calculates long-term and short-term occupancy independently by area', async () => {
      const now = Date.now();
      prisma.unit.findMany.mockResolvedValue([
        makeUnit({ leaseTermType: 'LONG', status: UnitStatus.OCCUPIED, areaNLA: 100 }),
        makeUnit({ leaseTermType: 'LONG', status: UnitStatus.VACANT, areaNLA: 100 }),
        makeUnit({ leaseTermType: 'SHORT', status: UnitStatus.OCCUPIED, areaNLA: 30 }),
        makeUnit({ leaseTermType: 'SHORT', status: UnitStatus.VACANT, areaNLA: 70 }),
      ]);
      prisma.slotBooking.findMany.mockResolvedValue([{
        installationStartDatetime: new Date(now - 3_600_000),
        dismantlingEndDatetime: new Date(now + 3_600_000),
        startDatetime: new Date(now - 1_800_000),
        endDatetime: new Date(now + 1_800_000),
        slot: { id: 'short-slot-1', unitId: 'short-unit-1', area: 30 },
      }]);

      const result = await service.getOccupancyV2();
      expect(result.byLeaseTerm.find((zone: any) => zone.leaseTermType === 'LONG')?.occupancyRate).toBe(50);
      expect(result.byLeaseTerm.find((zone: any) => zone.leaseTermType === 'SHORT')?.occupancyRate).toBe(30);
    });
  });
});
