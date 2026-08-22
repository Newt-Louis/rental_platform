import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SpacesService } from './spaces.service';

// CR-101 Phase 3B (INV-AUTH-007/008/010, INV-DATA-002) -- Data Gate reconciliation
// this phase found the current dataset CLEAN, but structurally unguarded: Floor
// and Zone's generic update routes previously accepted a client-supplied mallId
// straight through to Prisma (plain-object DTOs, not class-validator classes, so
// the global whitelist ValidationPipe never engaged) -- unlike Unit, which was
// already protected via sanitizeUnitDto. This file proves the fix: mallId is now
// rejected on Floor/Zone update, and buildingId/floorId cross-Mall mismatches are
// rejected on Floor/Zone create.
describe('SpacesService hierarchy data-integrity safeguards (CR-101 Phase 3B)', () => {
  const prisma: any = {
    mall: { findFirst: jest.fn() },
    building: { findFirst: jest.fn() },
    floor: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    zone: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    unit: { count: jest.fn() },
  };
  const unitStatus: any = { transition: jest.fn() };
  const mallAccess: any = { assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() };
  const service = new SpacesService(prisma, unitStatus, mallAccess);

  beforeEach(() => jest.clearAllMocks());

  describe('updateFloor', () => {
    it('rejects a body containing mallId (Floor may not be relocated across Malls via generic update)', async () => {
      await expect(service.updateFloor('floor-1', { name: 'x', mallId: 'mall-2' } as any))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.floor.update).not.toHaveBeenCalled();
    });

    it('allows a body without mallId to pass through unchanged', async () => {
      prisma.floor.update.mockResolvedValue({ id: 'floor-1', name: 'Level 2' });
      await service.updateFloor('floor-1', { name: 'Level 2' });
      expect(prisma.floor.update).toHaveBeenCalledWith({ where: { id: 'floor-1' }, data: { name: 'Level 2' } });
    });
  });

  describe('updateZone', () => {
    it('rejects a body containing mallId', async () => {
      await expect(service.updateZone('zone-1', { name: 'x', mallId: 'mall-2' } as any))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.zone.update).not.toHaveBeenCalled();
    });

    it('rejects reassigning floorId to a Floor belonging to a different Mall', async () => {
      prisma.zone.findUnique.mockResolvedValue({ mallId: 'mall-1' });
      prisma.floor.findFirst.mockResolvedValue(null); // floor-in-mall-2 not found under mall-1
      await expect(service.updateZone('zone-1', { floorId: 'floor-in-mall-2' }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.floor.findFirst).toHaveBeenCalledWith({ where: { id: 'floor-in-mall-2', mallId: 'mall-1', isActive: true } });
      expect(prisma.zone.update).not.toHaveBeenCalled();
    });

    it('allows reassigning floorId to a Floor within the same Mall', async () => {
      prisma.zone.findUnique.mockResolvedValue({ mallId: 'mall-1' });
      prisma.floor.findFirst.mockResolvedValue({ id: 'floor-2', mallId: 'mall-1' });
      prisma.zone.update.mockResolvedValue({ id: 'zone-1', floorId: 'floor-2' });
      await service.updateZone('zone-1', { floorId: 'floor-2' });
      expect(prisma.zone.update).toHaveBeenCalledWith({ where: { id: 'zone-1' }, data: { floorId: 'floor-2' } });
    });

    it('throws NotFoundException when the zone being updated does not exist', async () => {
      prisma.zone.findUnique.mockResolvedValue(null);
      await expect(service.updateZone('missing-zone', { floorId: 'floor-2' }))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createFloor', () => {
    it('rejects a buildingId belonging to a different Mall', async () => {
      prisma.building.findFirst.mockResolvedValue(null);
      await expect(service.createFloor({ mallId: 'mall-1', name: 'L1', level: '1', buildingId: 'building-in-mall-2' }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.building.findFirst).toHaveBeenCalledWith({ where: { id: 'building-in-mall-2', mallId: 'mall-1', isActive: true } });
      expect(prisma.floor.create).not.toHaveBeenCalled();
    });

    it('allows a buildingId belonging to the same Mall', async () => {
      prisma.building.findFirst.mockResolvedValue({ id: 'building-1', mallId: 'mall-1' });
      prisma.floor.create.mockResolvedValue({ id: 'floor-1' });
      await service.createFloor({ mallId: 'mall-1', name: 'L1', level: '1', buildingId: 'building-1' });
      expect(prisma.floor.create).toHaveBeenCalled();
    });

    it('allows creation with no buildingId at all (no cross-entity check needed)', async () => {
      prisma.floor.create.mockResolvedValue({ id: 'floor-1' });
      await service.createFloor({ mallId: 'mall-1', name: 'L1', level: '1' });
      expect(prisma.building.findFirst).not.toHaveBeenCalled();
      expect(prisma.floor.create).toHaveBeenCalled();
    });
  });

  describe('createZone', () => {
    it('rejects a floorId belonging to a different Mall', async () => {
      prisma.floor.findFirst.mockResolvedValue(null);
      await expect(service.createZone({ mallId: 'mall-1', floorId: 'floor-in-mall-2', name: 'Z1' }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.zone.create).not.toHaveBeenCalled();
    });

    it('allows a floorId belonging to the same Mall', async () => {
      prisma.floor.findFirst.mockResolvedValue({ id: 'floor-1', mallId: 'mall-1' });
      prisma.zone.create.mockResolvedValue({ id: 'zone-1' });
      await service.createZone({ mallId: 'mall-1', floorId: 'floor-1', name: 'Z1' });
      expect(prisma.zone.create).toHaveBeenCalled();
    });
  });
});
