import { Test, TestingModule } from '@nestjs/testing';
import { BookingService } from './booking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { CategoriesService } from '../categories/categories.service';
import { BookingStatus, UnitStatus } from '@prisma/client';

/**
 * CategoryPricing now carries its own currencyCode (previously a plain
 * VND-denominated Float with no currency field at all -- see
 * docs/program/MULTI_CURRENCY_ARCHITECTURE.md). Booking.create()/update()
 * used to skip categoriesService.validateProposedPrice() entirely for a
 * non-VND booking, to avoid comparing e.g. a USD proposedRentPerSqm against a
 * VND floor/ceiling. Now that validateProposedPrice() itself only matches a
 * pricing rule in the booking's own currency, the check runs for every
 * currency -- these tests assert the booking's currencyCode is what actually
 * gets passed through, not that non-VND bookings are skipped.
 */
describe('BookingService — category price validation is currency-aware', () => {
  let service: BookingService;

  const prisma: any = {
    unit: { findUnique: jest.fn() },
    lead: { findUnique: jest.fn(), update: jest.fn() },
    customer: { findUnique: jest.fn() },
    unitBooking: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    bookingActivity: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  const unitStatus = {
    isCommittedToTenant: jest.fn().mockReturnValue(false),
    isLockedForBooking: jest.fn().mockReturnValue(false),
    transition: jest.fn().mockResolvedValue({}),
  } as any;

  const categories = { validateProposedPrice: jest.fn() } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    prisma.unitBooking.findFirst.mockResolvedValue(null);
    prisma.unitBooking.findUnique.mockResolvedValue(null);
    prisma.unitBooking.findUniqueOrThrow.mockResolvedValue(undefined);
    prisma.unitBooking.aggregate.mockResolvedValue({ _max: { priority: 0 } });
    prisma.unitBooking.count.mockResolvedValue(0);
    prisma.unitBooking.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'booking-new', ...data }));
    prisma.unitBooking.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'b1', ...data }));
    prisma.bookingActivity.create.mockResolvedValue({});
    prisma.lead.update.mockResolvedValue({});
    unitStatus.isCommittedToTenant.mockReturnValue(false);
    unitStatus.isLockedForBooking.mockReturnValue(false);
    unitStatus.transition.mockResolvedValue({});
    categories.validateProposedPrice.mockResolvedValue({
      isValid: false,
      categoryPricing: { id: 'cp-1' },
      proposedRentPerSqm: 25,
      minRentPerSqm: 500000,
      maxRentPerSqm: 800000,
      deviationPercent: 99.995,
      requiresApproval: true,
      approvalLevel: 'CEO',
      message: 'Below floor',
    });

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

  describe('create()', () => {
    beforeEach(() => {
      prisma.unit.findUnique.mockResolvedValue({
        id: 'unit-1', mallId: 'mall-1', categoryId: 'cat-1', status: UnitStatus.VACANT, isActive: true,
      });
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', mallId: 'mall-1', isActive: true });
    });

    it('runs the floor/ceiling check for a USD booking, passing its currencyCode through', async () => {
      const dto = {
        unitId: 'unit-1', leadId: 'lead-1', holdDays: 7,
        proposedRentPerSqm: 25, currencyCode: 'USD',
      } as any;

      const booking = await service.create(dto, 'user-1');

      expect(categories.validateProposedPrice).toHaveBeenCalledWith(
        expect.objectContaining({ proposedRentPerSqm: 25, currencyCode: 'USD' }),
      );
      expect(booking.priceApprovalStatus).toBe('PENDING');
      expect(booking.priceDeviationPercent).toBe(99.995);
    });

    it('runs the floor/ceiling check for a VND booking (default currency)', async () => {
      const dto = {
        unitId: 'unit-1', leadId: 'lead-1', holdDays: 7,
        proposedRentPerSqm: 100000,
      } as any;

      const booking = await service.create(dto, 'user-1');

      expect(categories.validateProposedPrice).toHaveBeenCalledWith(
        expect.objectContaining({ proposedRentPerSqm: 100000, currencyCode: undefined }),
      );
      expect(booking.priceApprovalStatus).toBe('PENDING');
      expect(booking.priceDeviationPercent).toBe(99.995);
    });
  });

  describe('update()', () => {
    it('runs the floor/ceiling check using the existing booking currencyCode when the update omits one', async () => {
      prisma.unitBooking.findUnique.mockResolvedValue({
        id: 'b1', unitId: 'unit-1', status: BookingStatus.ACTIVE, isActive: true,
        currencyCode: 'USD', proposedRentPerSqm: 20, leadId: 'lead-1', createdById: 'user-1',
      });
      prisma.unit.findUnique.mockResolvedValue({
        id: 'unit-1', mallId: 'mall-1', categoryId: 'cat-1', isActive: true,
      });

      const updated = await service.update('b1', { proposedRentPerSqm: 25 } as any, 'user-1');

      expect(categories.validateProposedPrice).toHaveBeenCalledWith(
        expect.objectContaining({ proposedRentPerSqm: 25, currencyCode: 'USD' }),
      );
      expect(updated.priceApprovalStatus).toBe('PENDING');
    });
  });
});
