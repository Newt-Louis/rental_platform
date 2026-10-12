import { BadRequestException } from '@nestjs/common';
import { UnitStatus } from '@prisma/client';
import { SpacesService } from './spaces.service';

// Requirement: tong dien tich cua TAT CA mat bang trong mot Khu vuc khong duoc vuot tong dien tich Khu vuc
// -- gom ca mat bang dai han lan ngan han.
describe('SpacesService zone area budget (long-term + short-term)', () => {
  const prisma: any = {
    mall: { findFirst: jest.fn() },
    floor: { findFirst: jest.fn() },
    zone: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    unit: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
    category: { findUnique: jest.fn() },
  };
  const service = new SpacesService(prisma, {} as any, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.zone.findFirst.mockResolvedValue({ id: 'z1', floorId: null });
    prisma.unit.findUnique.mockResolvedValue(null);
    prisma.mall.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.unit.create.mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));
    prisma.zone.findUnique.mockResolvedValue({ name: 'Zone A', totalArea: 100 });
  });

  const create = (areaNLA: number, leaseTermType: 'LONG' | 'SHORT') =>
    service.createUnit({ mallId: 'm1', zoneId: 'z1', code: 'U1', areaNLA, areaGFA: areaNLA, leaseTermType } as any);

  it('counts long-term units too: 70 long-term + 40 short-term exceeds a 100 m2 zone', async () => {
    prisma.unit.aggregate.mockResolvedValue({ _sum: { areaNLA: 70 } }); // existing long + short units
    await expect(create(40, 'SHORT')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.unit.create).not.toHaveBeenCalled();
  });

  it('applies to a long-term unit as well', async () => {
    prisma.unit.aggregate.mockResolvedValue({ _sum: { areaNLA: 70 } });
    await expect(create(40, 'LONG')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not filter the sum by lease term and ignores merged-away units', async () => {
    prisma.unit.aggregate.mockResolvedValue({ _sum: { areaNLA: 10 } });
    await create(40, 'LONG');
    const where = prisma.unit.aggregate.mock.calls[0][0].where;
    expect(where.leaseTermType).toBeUndefined();
    expect(where).toMatchObject({ zoneId: 'z1', isActive: true, status: { not: UnitStatus.MERGED } });
  });

  it('allows a unit that fits exactly', async () => {
    prisma.unit.aggregate.mockResolvedValue({ _sum: { areaNLA: 60 } });
    await expect(create(40, 'SHORT')).resolves.toBeTruthy();
  });

  it('has no limit when the zone has no total area', async () => {
    prisma.zone.findUnique.mockResolvedValue({ name: 'Zone A', totalArea: null });
    await expect(create(9999, 'LONG')).resolves.toBeTruthy();
    expect(prisma.unit.aggregate).not.toHaveBeenCalled();
  });

  it('refuses to shrink the zone total below the area already allocated to all units', async () => {
    prisma.unit.aggregate.mockResolvedValue({ _sum: { areaNLA: 80 } });
    await expect(service.updateZone('z1', { totalArea: 50 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.zone.update).not.toHaveBeenCalled();
  });
});
