import { ForbiddenException } from '@nestjs/common';
import { SpacesController } from './spaces.controller';

// CR-101 Phase 3B (P0-002 + Mall/Floor/Zone route gaps) -- proves every
// newly-enforced route calls the Mall-access check BEFORE delegating to the
// service, and that a denial from MallAccessService actually blocks the
// service call rather than being swallowed. Complements the resolver-level
// DENY/ALLOW/bypass tests in mall-access.service.spec.ts (which prove the
// resolvers themselves are correct) -- this file proves the routes are wired
// to call them at all.
describe('SpacesController — CR-101 Phase 3B authorization wiring', () => {
  const spacesService: any = {
    getMall: jest.fn(), updateMall: jest.fn(), deleteMall: jest.fn(),
    updateFloor: jest.fn(), deleteFloor: jest.fn(),
    updateZone: jest.fn(), deleteZone: jest.fn(),
    getUnit: jest.fn(), updateUnit: jest.fn(), updateUnitStatus: jest.fn(), deleteUnit: jest.fn(),
    getUnits: jest.fn(), getFloors: jest.fn(), getZones: jest.fn(),
    bulkUpdateUnits: jest.fn(), compareUnits: jest.fn(), mergeUnits: jest.fn(), splitUnit: jest.fn(),
  };
  const unitMediaService: any = { getUnitMedia: jest.fn() };
  const mallAccess: any = {
    assertMallAccess: jest.fn(),
    extractAndValidateMallAccess: jest.fn(),
    getAccessibleMallIds: jest.fn(),
  };
  const controller = new SpacesController(spacesService, unitMediaService, mallAccess);
  const user = { id: 'user-1', role: 'OPERATION' };

  // resetAllMocks (not clearAllMocks): a mockRejectedValue set by one test must
  // not leak its implementation into the next test, only its call history needs
  // clearing -- clearAllMocks only does the latter.
  beforeEach(() => jest.resetAllMocks());

  describe('direct mallId=own-id routes (Mall entity)', () => {
    it.each([
      ['getMall', (id: string) => controller.getMall(id, user)],
      ['updateMall', (id: string) => controller.updateMall(id, {}, user)],
      ['deleteMall', (id: string) => controller.deleteMall(id, user)],
    ])('%s calls assertMallAccess with the route id and blocks the service on denial', async (_name, invoke) => {
      mallAccess.assertMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(invoke('mall-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('user-1', 'OPERATION', 'mall-1');
      expect(spacesService.getMall).not.toHaveBeenCalled();
      expect(spacesService.updateMall).not.toHaveBeenCalled();
      expect(spacesService.deleteMall).not.toHaveBeenCalled();
    });
  });

  describe('entity-resolver routes (Floor/Zone/Unit own-id)', () => {
    it.each([
      ['updateFloor', { floorId: 'floor-1' }, () => controller.updateFloor('floor-1', {}, user)],
      ['deleteFloor', { floorId: 'floor-1' }, () => controller.deleteFloor('floor-1', user)],
      ['updateZone', { zoneId: 'zone-1' }, () => controller.updateZone('zone-1', {}, user)],
      ['deleteZone', { zoneId: 'zone-1' }, () => controller.deleteZone('zone-1', user)],
      ['getUnit', { unitId: 'unit-1' }, () => controller.getUnit('unit-1', user)],
      ['updateUnit', { unitId: 'unit-1' }, () => controller.updateUnit('unit-1', {} as any, user)],
      ['updateUnitStatus', { unitId: 'unit-1' }, () => controller.updateUnitStatus('unit-1', 'VACANT' as any, user)],
      ['deleteUnit', { unitId: 'unit-1' }, () => controller.deleteUnit('unit-1', user)],
      ['splitUnit', { unitId: 'unit-1' }, () => controller.splitUnit('unit-1', user)],
    ])('%s calls extractAndValidateMallAccess with %j and blocks the service on denial', async (_name, expectedSource, invoke) => {
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(invoke()).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('user-1', 'OPERATION', expectedSource);
      for (const fn of Object.values(spacesService)) expect(fn as jest.Mock).not.toHaveBeenCalled();
    });
  });

  describe('list routes: explicit mallId is checked, omitted mallId falls back to the accessible set', () => {
    it('getUnits checks assertMallAccess when mallId is given, and does not fall back', async () => {
      spacesService.getUnits.mockResolvedValue({ data: [], total: 0 });
      await controller.getUnits({ mallId: 'mall-1' }, user);
      expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('user-1', 'OPERATION', 'mall-1');
      expect(mallAccess.getAccessibleMallIds).not.toHaveBeenCalled();
      expect(spacesService.getUnits).toHaveBeenCalledWith({ mallId: 'mall-1' }, undefined);
    });

    it('getUnits falls back to the accessible-Mall set when mallId is omitted', async () => {
      mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);
      spacesService.getUnits.mockResolvedValue({ data: [], total: 0 });
      await controller.getUnits({}, user);
      expect(mallAccess.assertMallAccess).not.toHaveBeenCalled();
      expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith('user-1', 'OPERATION');
      expect(spacesService.getUnits).toHaveBeenCalledWith({}, ['mall-1']);
    });

    it('getUnits blocks the service call when the explicit mallId is denied', async () => {
      mallAccess.assertMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(controller.getUnits({ mallId: 'mall-2' }, user)).rejects.toBeInstanceOf(ForbiddenException);
      expect(spacesService.getUnits).not.toHaveBeenCalled();
    });
  });

  describe('bulk / multi-entity routes pass the caller through to the service for per-entity checking', () => {
    it('bulkUpdateUnits forwards userId and the user object (accessible-set check happens in the service)', async () => {
      spacesService.bulkUpdateUnits.mockResolvedValue({ updated: 1 });
      await controller.bulkUpdateUnits({ unitIds: ['unit-1'], updates: {} }, user);
      expect(spacesService.bulkUpdateUnits).toHaveBeenCalledWith(['unit-1'], {}, 'user-1', user);
    });

    it('mergeUnits forwards userId and the user object', async () => {
      spacesService.mergeUnits.mockResolvedValue({ combinedUnit: {}, mergedUnitIds: [] });
      await controller.mergeUnits({ unitIds: ['unit-1', 'unit-2'], code: 'AB' } as any, user);
      expect(spacesService.mergeUnits).toHaveBeenCalledWith(['unit-1', 'unit-2'], { code: 'AB' }, 'user-1', user);
    });

    it('compareUnits forwards the user object for the accessible-set check in the service', async () => {
      spacesService.compareUnits.mockResolvedValue({ units: [], summary: {} });
      await controller.compareUnits('unit-1,unit-2', user);
      expect(spacesService.compareUnits).toHaveBeenCalledWith(['unit-1', 'unit-2'], user);
    });
  });
});
