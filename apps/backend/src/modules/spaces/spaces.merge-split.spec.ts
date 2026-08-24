import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SpacesService } from './spaces.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { MallAccessService } from '../../common/services/mall-access.service';
import { UnitStatus } from '@prisma/client';

const mockUnit = (overrides: any = {}) => ({
  id: 'unit-a',
  mallId: 'mall-1',
  code: 'A01',
  name: 'Unit A',
  areaGFA: 100,
  areaNLA: 90,
  baseRentPerSqm: 500,
  camPerSqm: 50,
  status: UnitStatus.VACANT,
  isActive: true,
  isCombined: false,
  mergedFromIds: null,
  mergedIntoId: null,
  floorId: 'floor-1',
  zoneId: null,
  tenantId: null,
  leaseStartDate: null,
  leaseEndDate: null,
  ...overrides,
});

describe('SpacesService — mergeUnits / splitUnit', () => {
  let service: SpacesService;

  const prisma = {
    unit: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    unitHistory: { create: jest.fn() },
    floor: { findUnique: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(prisma)),
  } as any;

  const unitStatus = { transition: jest.fn() } as any;
  const mallAccess = { assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpacesService,
        { provide: PrismaService, useValue: prisma },
        { provide: UnitStatusService, useValue: unitStatus },
        { provide: MallAccessService, useValue: mallAccess },
      ],
    }).compile();
    service = module.get(SpacesService);
  });

  // ─── mergeUnits ──────────────────────────────────────────────────────────────

  describe('mergeUnits', () => {
    it('throws if fewer than 2 unit IDs provided', async () => {
      await expect(
        service.mergeUnits(['unit-a'], { code: 'AB', name: 'Merged AB' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if any source unit is not VACANT', async () => {
      prisma.unit.findMany.mockResolvedValue([
        mockUnit({ id: 'unit-a', status: UnitStatus.VACANT }),
        mockUnit({ id: 'unit-b', status: UnitStatus.NEGOTIATING }),
      ]);

      await expect(
        service.mergeUnits(['unit-a', 'unit-b'], { code: 'AB', name: 'AB' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if source units are not all from the same mall', async () => {
      prisma.unit.findMany.mockResolvedValue([
        mockUnit({ id: 'unit-a', mallId: 'mall-1', status: UnitStatus.VACANT }),
        mockUnit({ id: 'unit-b', mallId: 'mall-2', status: UnitStatus.VACANT }),
      ]);

      await expect(
        service.mergeUnits(['unit-a', 'unit-b'], { code: 'AB', name: 'AB' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if not all requested units are found', async () => {
      prisma.unit.findMany.mockResolvedValue([
        mockUnit({ id: 'unit-a', status: UnitStatus.VACANT }),
        // unit-b missing
      ]);

      await expect(
        service.mergeUnits(['unit-a', 'unit-b'], { code: 'AB', name: 'AB' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates combined unit C with summed areas and marks A/B as MERGED', async () => {
      const unitA = mockUnit({ id: 'unit-a', areaNLA: 100, areaGFA: 110, mallId: 'mall-1', floorId: 'floor-1', status: UnitStatus.VACANT });
      const unitB = mockUnit({ id: 'unit-b', code: 'A02', areaNLA: 80, areaGFA: 90, mallId: 'mall-1', floorId: 'floor-1', status: UnitStatus.VACANT });
      const combined = { ...unitA, id: 'unit-c', code: 'AB', isCombined: true, areaNLA: 180, areaGFA: 200, mergedFromIds: ['unit-a', 'unit-b'] };

      prisma.unit.findMany.mockResolvedValue([unitA, unitB]);
      prisma.unit.create.mockResolvedValue(combined);
      prisma.unit.update.mockResolvedValue({});
      prisma.unitHistory.create.mockResolvedValue({});

      const result = await service.mergeUnits(['unit-a', 'unit-b'], { code: 'AB', name: 'AB' }, 'user-1');

      // Combined unit should be created
      expect(prisma.unit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'AB',
            isCombined: true,
            areaGFA: 200,
            areaNLA: 180,
            mergedFromIds: ['unit-a', 'unit-b'],
          }),
        }),
      );

      // Source units should be updated to MERGED
      expect(prisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unit-a' },
          data: expect.objectContaining({
            status: UnitStatus.MERGED,
            mergedIntoId: 'unit-c',
          }),
        }),
      );
      expect(prisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unit-b' },
          data: expect.objectContaining({
            status: UnitStatus.MERGED,
            mergedIntoId: 'unit-c',
          }),
        }),
      );

      expect(result.combinedUnit.code).toBe('AB');
    });
  });

  // ─── splitUnit ───────────────────────────────────────────────────────────────

  describe('splitUnit', () => {
    it('throws if unit is not a combined unit', async () => {
      prisma.unit.findUnique.mockResolvedValue(
        mockUnit({ id: 'unit-c', isCombined: false }),
      );

      await expect(service.splitUnit('unit-c', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws if combined unit is OCCUPIED (cannot split active lease)', async () => {
      prisma.unit.findUnique.mockResolvedValue(
        mockUnit({ id: 'unit-c', isCombined: true, status: UnitStatus.OCCUPIED, mergedFromIds: ['unit-a', 'unit-b'] }),
      );

      await expect(service.splitUnit('unit-c', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws if original source units cannot be found', async () => {
      prisma.unit.findUnique.mockResolvedValue(
        mockUnit({ id: 'unit-c', isCombined: true, status: UnitStatus.VACANT, mergedFromIds: ['unit-a', 'unit-b'] }),
      );
      prisma.unit.findMany.mockResolvedValue([
        mockUnit({ id: 'unit-a' }),
        // unit-b not found
      ]);

      await expect(service.splitUnit('unit-c', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('restores source units to VACANT and deactivates combined unit', async () => {
      prisma.unit.findUnique.mockResolvedValue(
        mockUnit({ id: 'unit-c', isCombined: true, status: UnitStatus.VACANT, mergedFromIds: ['unit-a', 'unit-b'] }),
      );
      prisma.unit.findMany.mockResolvedValue([
        mockUnit({ id: 'unit-a', status: UnitStatus.MERGED, mergedIntoId: 'unit-c' }),
        mockUnit({ id: 'unit-b', status: UnitStatus.MERGED, mergedIntoId: 'unit-c', code: 'A02' }),
      ]);
      prisma.unit.update.mockResolvedValue({});
      prisma.unitHistory.create.mockResolvedValue({});

      const result = await service.splitUnit('unit-c', 'user-1');

      // Source units restored to VACANT
      expect(prisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unit-a' },
          data: expect.objectContaining({ status: UnitStatus.VACANT, mergedIntoId: null }),
        }),
      );
      expect(prisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unit-b' },
          data: expect.objectContaining({ status: UnitStatus.VACANT, mergedIntoId: null }),
        }),
      );

      // Combined unit deactivated
      expect(prisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unit-c' },
          data: expect.objectContaining({ isActive: false }),
        }),
      );

      expect(result.restoredUnits).toHaveLength(2);
    });
  });
});
