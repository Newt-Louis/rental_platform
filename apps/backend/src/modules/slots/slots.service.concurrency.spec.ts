import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SlotsService } from './slots.service';

describe('SlotsService allocation concurrency', () => {
  const tx: any = {
    slotBooking: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma: any = {
    unitSlot: { findUnique: jest.fn() },
    unit: { findUnique: jest.fn() },
    lead: { findUnique: jest.fn() },
    $transaction: jest.fn(async (operation: any) => operation(tx)),
  };
  const unitStatus: any = { isCommittedToTenant: jest.fn(() => false) };
  let service: SlotsService;

  const slot = {
    id: 'slot-1',
    unitId: 'unit-1',
    area: 20,
    pricePerDaySqm: 10,
    pricePerHour: null,
    pricePerSqmMonth: null,
    pricingRules: [],
  };
  const dto: any = {
    type: 'DAILY',
    installationStartDatetime: '2026-09-01T07:00:00Z',
    installationEndDatetime: '2026-09-01T09:00:00Z',
    startDatetime: '2026-09-01T09:00:00Z',
    endDatetime: '2026-09-02T18:00:00Z',
    dismantlingStartDatetime: '2026-09-02T18:00:00Z',
    dismantlingEndDatetime: '2026-09-02T20:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SlotsService(prisma, unitStatus);
    prisma.unitSlot.findUnique.mockResolvedValue(slot);
    prisma.unit.findUnique.mockResolvedValue({ status: 'VACANT', leaseTermType: 'SHORT' });
    tx.slotBooking.findMany.mockResolvedValue([]);
    tx.slotBooking.count.mockResolvedValue(0);
    tx.slotBooking.create.mockResolvedValue({ id: 'booking-1' });
  });

  it('checks conflicts and creates through one Serializable transaction', async () => {
    await service.createBooking('slot-1', dto, 'user-1');

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(tx.slotBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ slotId: 'slot-1', status: { in: ['PENDING', 'CONFIRMED'] } }),
    }));
    expect(tx.slotBooking.create).toHaveBeenCalledTimes(1);
  });

  it('retries a recognized serialization conflict and then succeeds', async () => {
    prisma.$transaction
      .mockRejectedValueOnce(Object.assign(new Error('serialization conflict'), { code: 'P2034' }))
      .mockImplementationOnce(async (operation: any) => operation(tx));

    await service.createBooking('slot-1', dto, 'user-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.slotBooking.create).toHaveBeenCalledTimes(1);
  });

  it('does not create when the serialized conflict read finds an occupied interval', async () => {
    tx.slotBooking.findMany.mockResolvedValue([{
      bookingRef: 'SB-2026-00001',
      installationStartDatetime: new Date('2026-09-01T06:00:00Z'),
      dismantlingEndDatetime: new Date('2026-09-03T20:00:00Z'),
      startDatetime: new Date('2026-09-01T09:00:00Z'),
      endDatetime: new Date('2026-09-03T18:00:00Z'),
    }]);

    await expect(service.createBooking('slot-1', dto, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.slotBooking.create).not.toHaveBeenCalled();
  });

  it('serializes timeline conflict validation with the booking update', async () => {
    tx.slotBooking.findUnique.mockResolvedValue({
      id: 'booking-1',
      slotId: 'slot-1',
      type: 'DAILY',
      status: 'PENDING',
      installationStartDatetime: new Date(dto.installationStartDatetime),
      installationEndDatetime: new Date(dto.installationEndDatetime),
      startDatetime: new Date(dto.startDatetime),
      endDatetime: new Date(dto.endDatetime),
      dismantlingStartDatetime: new Date(dto.dismantlingStartDatetime),
      dismantlingEndDatetime: new Date(dto.dismantlingEndDatetime),
      discountPct: 0,
      baseAmount: 400,
    });
    tx.slotBooking.update.mockResolvedValue({ id: 'booking-1' });

    await service.updateSlotBooking('booking-1', {
      installationStartDatetime: '2026-09-01T06:00:00Z',
    });

    expect(tx.slotBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { not: 'booking-1' } }),
    }));
    expect(tx.slotBooking.update).toHaveBeenCalledTimes(1);
  });
});
