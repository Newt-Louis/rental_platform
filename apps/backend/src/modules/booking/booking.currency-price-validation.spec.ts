import { Test, TestingModule } from '@nestjs/testing';
import { BookingService } from './booking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { CategoriesService } from '../categories/categories.service';
import { BookingStatus, UnitStatus } from '@prisma/client';

/**
 * Regression for a bug found during a QC pass on the multi-currency work (RC3, c61fdb9+):
 * CategoryPricing.minRentPerSqm/maxRentPerSqm are plain VND-denominated Floats with no
 * currency field. Booking.create()/update() used to call categoriesService.validateProposedPrice()
 * unconditionally regardless of the booking's currencyCode -- so a USD/MMK proposedRentPerSqm
 * got compared against a VND floor/ceiling, producing a nonsensical deviation (e.g. a $25
 * proposal read as ~100% below a 500,000 VND floor), forcing a bogus CEO price-approval
 * requirement and surfacing garbage numbers in the Approvals price-review queue. The frontend
 * create dialog already showed a "not checked for {currency}" disclaimer, but that was cosmetic
 * only -- the backend still ran the check. Fixed by skipping the floor/ceiling check entirely
 * for a non-VND booking.
 */
describe('BookingService — category price-floor validation is VND-only', () => {
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

    it('skips the VND floor/ceiling check for a USD booking -- no bogus approval requirement', async () => {
      const dto = {
        unitId: 'unit-1', leadId: 'lead-1', holdDays: 7,
        proposedRentPerSqm: 25, currencyCode: 'USD',
      } as any;

      const booking = await service.create(dto, 'user-1');

      expect(categories.validateProposedPrice).not.toHaveBeenCalled();
      expect(booking.priceApprovalStatus).toBeNull();
      expect(booking.priceDeviationPercent).toBeNull();
    });

    it('still runs the VND floor/ceiling check for a VND booking (default currency)', async () => {
      const dto = {
        unitId: 'unit-1', leadId: 'lead-1', holdDays: 7,
        proposedRentPerSqm: 100000,
      } as any;

      const booking = await service.create(dto, 'user-1');

      expect(categories.validateProposedPrice).toHaveBeenCalled();
      expect(booking.priceApprovalStatus).toBe('PENDING');
      expect(booking.priceDeviationPercent).toBe(99.995);
    });
  });

  describe('update()', () => {
    it('skips the VND floor/ceiling check when the existing booking is USD-denominated', async () => {
      prisma.unitBooking.findUnique.mockResolvedValue({
        id: 'b1', unitId: 'unit-1', status: BookingStatus.ACTIVE, isActive: true,
        currencyCode: 'USD', proposedRentPerSqm: 20, leadId: 'lead-1', createdById: 'user-1',
      });
      prisma.unit.findUnique.mockResolvedValue({
        id: 'unit-1', mallId: 'mall-1', categoryId: 'cat-1', isActive: true,
      });

      const updated = await service.update('b1', { proposedRentPerSqm: 25 } as any, 'user-1');

      expect(categories.validateProposedPrice).not.toHaveBeenCalled();
      expect(updated.priceApprovalStatus).toBeUndefined();
    });
  });
});
