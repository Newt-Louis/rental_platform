import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { CategoriesService } from '../categories/categories.service';
import { UnitStatus } from '@prisma/client';

const makeUnit = (status: UnitStatus) => ({
  id: 'unit-1',
  mallId: 'mall-1',
  code: 'A01',
  status,
  isActive: true,
});

const createDto = {
  unitId: 'unit-1',
  leadId: 'lead-1',
  holdDays: 7,
};

describe('BookingService — unit status lock (#20)', () => {
  let service: BookingService;

  const prisma = {
    unit: { findUnique: jest.fn() },
    lead: { findUnique: jest.fn(), update: jest.fn() },
    customer: { findUnique: jest.fn() },
    unitBooking: {
      findFirst: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _max: { priority: 0 } }),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
    },
    bookingActivity: { create: jest.fn() },
    // runSerializable() uses the interactive-callback form ($transaction(fn, opts)), not the
    // array form — invoke the callback with `prisma` itself standing in for `tx`, so the
    // per-call mocks above double as the transaction-scoped ones too (same pattern as
    // contract-activation.spec.ts / proposals.service.spec.ts).
    $transaction: jest.fn((fn: any) => fn(prisma)),
  } as any;

  const unitStatus = {
    isCommittedToTenant: jest.fn(),
    isLockedForBooking: jest.fn(),
    transition: jest.fn(),
  } as any;

  const categories = { getDefaultCamForUnit: jest.fn().mockResolvedValue(0) } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', isActive: true });
    prisma.unitBooking.findFirst.mockResolvedValue(null);
    prisma.unitBooking.create.mockResolvedValue({ id: 'booking-1' });
    prisma.unitBooking.aggregate.mockResolvedValue({ _max: { priority: 0 } });
    prisma.unitBooking.count.mockResolvedValue(0);
    prisma.bookingActivity.create.mockResolvedValue({});
    prisma.lead.update.mockResolvedValue({});
    unitStatus.transition.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: prisma },
        { provide: UnitStatusService, useValue: unitStatus },
        { provide: CategoriesService, useValue: categories },
      ],
    }).compile();
    service = module.get(BookingService);
  });

  it('blocks booking when unit is OCCUPIED', async () => {
    prisma.unit.findUnique.mockResolvedValue(makeUnit(UnitStatus.OCCUPIED));
    unitStatus.isCommittedToTenant.mockReturnValue(true);
    unitStatus.isLockedForBooking.mockReturnValue(true);

    await expect(service.create(createDto as any, 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('blocks booking when unit is CONTRACTED', async () => {
    prisma.unit.findUnique.mockResolvedValue(makeUnit(UnitStatus.CONTRACTED));
    unitStatus.isCommittedToTenant.mockReturnValue(true);
    unitStatus.isLockedForBooking.mockReturnValue(true);

    await expect(service.create(createDto as any, 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('blocks booking when unit is UNDER_FITOUT', async () => {
    prisma.unit.findUnique.mockResolvedValue(makeUnit(UnitStatus.UNDER_FITOUT));
    unitStatus.isCommittedToTenant.mockReturnValue(true);
    unitStatus.isLockedForBooking.mockReturnValue(true);

    await expect(service.create(createDto as any, 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('blocks booking when unit is NEGOTIATING (GAP #20 fix)', async () => {
    prisma.unit.findUnique.mockResolvedValue(makeUnit(UnitStatus.NEGOTIATING));
    unitStatus.isCommittedToTenant.mockReturnValue(false);
    unitStatus.isLockedForBooking.mockReturnValue(true);

    await expect(service.create(createDto as any, 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('blocks booking when unit is MERGED', async () => {
    prisma.unit.findUnique.mockResolvedValue(makeUnit(UnitStatus.MERGED));
    unitStatus.isCommittedToTenant.mockReturnValue(false);
    unitStatus.isLockedForBooking.mockReturnValue(true);

    await expect(service.create(createDto as any, 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('allows booking when unit is VACANT', async () => {
    prisma.unit.findUnique.mockResolvedValue(makeUnit(UnitStatus.VACANT));
    unitStatus.isCommittedToTenant.mockReturnValue(false);
    unitStatus.isLockedForBooking.mockReturnValue(false);

    const result = await service.create(createDto as any, 'user-1');
    expect(result).toBeDefined();
  });

  it('allows secondary-priority booking when unit is BOOKING (queue feature)', async () => {
    prisma.unit.findUnique.mockResolvedValue(makeUnit(UnitStatus.BOOKING));
    unitStatus.isCommittedToTenant.mockReturnValue(false);
    unitStatus.isLockedForBooking.mockReturnValue(false);

    const result = await service.create(createDto as any, 'user-1');
    expect(result).toBeDefined();
  });
});
