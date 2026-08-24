import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SpacesService } from './spaces.service';

// CR-101 Phase 3B.1 (INV-SPACE-MAP-001/002): saveMapPositions authorized the
// Floor but never verified that each payload unitId actually belongs to that
// Floor (or even that Mall) before writing its map coordinates -- confirmed
// against the executable code (spaces.service.ts), not assumed from the Phase
// 3B report's finding. Mocked multi-Mall fixture per the authorization's
// Section 6 (Mall A/Floor A/Unit A vs Mall B/Floor B/Unit B) -- the live dev DB
// only has one Mall, so this is deliberately a unit-test fixture, not a DB
// mutation.
describe('SpacesService.saveMapPositions — unit/floor/mall integrity (CR-101 Phase 3B.1)', () => {
  const prisma: any = {
    floor: { findUnique: jest.fn() },
    unit: { findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  };
  const unitStatus: any = { transition: jest.fn() };
  const mallAccess: any = { assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() };
  const service = new SpacesService(prisma, unitStatus, mallAccess);

  const floorA = { id: 'floor-A', mallId: 'mall-A' };
  const floorB = { id: 'floor-B', mallId: 'mall-B' };
  const unitA1 = { id: 'unit-A1', floorId: 'floor-A', mallId: 'mall-A' };
  const unitA2 = { id: 'unit-A2', floorId: 'floor-A', mallId: 'mall-A' };
  const unitB_sameMall = { id: 'unit-B-same-mall', floorId: 'floor-B', mallId: 'mall-A' }; // different Floor, same Mall as A
  const unitB_otherMall = { id: 'unit-B-other-mall', floorId: 'floor-B', mallId: 'mall-B' }; // different Floor AND Mall

  beforeEach(() => jest.clearAllMocks());

  it('ALLOW: Floor A + a single Unit from Floor A', async () => {
    prisma.floor.findUnique.mockResolvedValue(floorA);
    prisma.unit.findMany.mockResolvedValue([unitA1]);
    prisma.unit.update.mockResolvedValue({});

    const result = await service.saveMapPositions('floor-A', [{ unitId: 'unit-A1', x: 1, y: 1, w: 1, h: 1 }]);

    expect(result).toEqual({ updated: 1 });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('ALLOW: Floor A + multiple Units, all from Floor A', async () => {
    prisma.floor.findUnique.mockResolvedValue(floorA);
    prisma.unit.findMany.mockResolvedValue([unitA1, unitA2]);
    prisma.unit.update.mockResolvedValue({});

    const result = await service.saveMapPositions('floor-A', [
      { unitId: 'unit-A1', x: 1, y: 1, w: 1, h: 1 },
      { unitId: 'unit-A2', x: 2, y: 2, w: 1, h: 1 },
    ]);

    expect(result).toEqual({ updated: 2 });
  });

  it('DENY: Floor A + a Unit that belongs to Floor B in the same Mall', async () => {
    prisma.floor.findUnique.mockResolvedValue(floorA);
    prisma.unit.findMany.mockResolvedValue([unitB_sameMall]);

    await expect(service.saveMapPositions('floor-A', [{ unitId: 'unit-B-same-mall', x: 1, y: 1, w: 1, h: 1 }]))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.unit.update).not.toHaveBeenCalled();
  });

  it('DENY: Floor A / Mall A + a Unit from Floor B / Mall B (cross-Mall)', async () => {
    prisma.floor.findUnique.mockResolvedValue(floorA);
    prisma.unit.findMany.mockResolvedValue([unitB_otherMall]);

    await expect(service.saveMapPositions('floor-A', [{ unitId: 'unit-B-other-mall', x: 1, y: 1, w: 1, h: 1 }]))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('DENY, no partial write: valid Units plus one invalid (nonexistent) unitId rejects the whole request', async () => {
    prisma.floor.findUnique.mockResolvedValue(floorA);
    // findMany returns only the units that actually exist -- unit-A1 is real, 'unit-ghost' is not
    prisma.unit.findMany.mockResolvedValue([unitA1]);

    await expect(service.saveMapPositions('floor-A', [
      { unitId: 'unit-A1', x: 1, y: 1, w: 1, h: 1 },
      { unitId: 'unit-ghost', x: 2, y: 2, w: 1, h: 1 },
    ])).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.unit.update).not.toHaveBeenCalled();
  });

  it('DENY: duplicate unitId in the payload is rejected as ambiguous, not silently applied last-write-wins', async () => {
    prisma.floor.findUnique.mockResolvedValue(floorA);

    await expect(service.saveMapPositions('floor-A', [
      { unitId: 'unit-A1', x: 1, y: 1, w: 1, h: 1 },
      { unitId: 'unit-A1', x: 9, y: 9, w: 1, h: 1 },
    ])).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.unit.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('preserves defined current behavior for an empty payload (no-op, not an error)', async () => {
    prisma.floor.findUnique.mockResolvedValue(floorA);

    const result = await service.saveMapPositions('floor-A', []);

    expect(result).toEqual({ updated: 0 });
    expect(prisma.unit.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the target Floor itself does not exist', async () => {
    prisma.floor.findUnique.mockResolvedValue(null);
    await expect(service.saveMapPositions('missing-floor', [{ unitId: 'unit-A1' }]))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  // The Mall-access bypass for ADMIN/CEO (BYPASS_ROLES in MallAccessService)
  // lives entirely at the controller layer, one step before this method is ever
  // called -- saveMapPositions itself takes no role/user parameter and applies
  // this Unit/Floor/Mall integrity check unconditionally. There is structurally
  // no way for an ADMIN-authorized caller to reach this method and skip the
  // check; every test above already exercises the check with no role in play,
  // which is the correct proof that entity integrity is respected regardless of
  // who is authorized to reach the route.
  it('entity-integrity check is unconditional -- not parameterized by caller role at all', () => {
    expect(service.saveMapPositions.length).toBe(2); // (floorId, positions) -- no user/role parameter exists to bypass
  });
});
