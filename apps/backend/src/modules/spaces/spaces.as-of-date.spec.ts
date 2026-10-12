import { BadRequestException } from '@nestjs/common';
import { UnitStatus } from '@prisma/client';
import { SpacesService } from './spaces.service';

describe('SpacesService.getUnits asOfDate', () => {
  const units = [
    { id: 'leased', code: 'A1', status: UnitStatus.OCCUPIED },
    { id: 'held', code: 'A2', status: UnitStatus.OCCUPIED },
    { id: 'free', code: 'A3', status: UnitStatus.OCCUPIED },
    { id: 'offering', code: 'A4', status: UnitStatus.OFFERING },
    { id: 'merged', code: 'A5', status: UnitStatus.MERGED },
  ];
  const prisma: any = {
    unit: { findMany: jest.fn(), count: jest.fn() },
    contract: { findMany: jest.fn() },
    unitBooking: { findMany: jest.fn() },
  };
  const service = new SpacesService(prisma, {} as any, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.unit.findMany.mockResolvedValue(units);
    prisma.contract.findMany.mockResolvedValue([{ unitId: 'leased' }]);
    prisma.unitBooking.findMany.mockResolvedValue([{ unitId: 'held' }]);
  });

  it('without asOfDate keeps the stored status and filters in SQL', async () => {
    prisma.unit.count.mockResolvedValue(5);
    await service.getUnits({ status: UnitStatus.VACANT } as any);
    expect(prisma.unit.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: UnitStatus.VACANT }),
    }));
    expect(prisma.contract.findMany).not.toHaveBeenCalled();
  });

  it('derives each unit status for the chosen day', async () => {
    const res: any = await service.getUnits({ asOfDate: '2027-01-15' } as any);
    const byId = Object.fromEntries(res.data.map((u: any) => [u.id, u.status]));
    expect(byId).toEqual({
      leased: UnitStatus.OCCUPIED,
      held: UnitStatus.BOOKING,
      free: UnitStatus.VACANT,
      offering: UnitStatus.OFFERING,
      merged: UnitStatus.MERGED,
    });
    expect(res.data.find((u: any) => u.id === 'free').currentStatus).toBe(UnitStatus.OCCUPIED);
  });

  it('applies the status filter to the derived status, then paginates', async () => {
    const res: any = await service.getUnits({ asOfDate: '2027-01-15', status: UnitStatus.VACANT } as any);
    expect(res.data.map((u: any) => u.id)).toEqual(['free']);
    expect(res.total).toBe(1);
    // the stored status must not be pushed into SQL, or "free" would be filtered out
    expect(prisma.unit.findMany.mock.calls[0][0].where.status).toBeUndefined();
  });

  it('rejects a malformed date', async () => {
    await expect(service.getUnits({ asOfDate: '15/01/2027' } as any)).rejects.toThrow(BadRequestException);
  });
});
