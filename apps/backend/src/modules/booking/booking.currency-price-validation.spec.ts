import { Test, TestingModule } from '@nestjs/testing';
import { BookingService } from './booking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { CategoriesService } from '../categories/categories.service';
import { BookingStatus, UnitStatus } from '@prisma/client';
import { PriceApprovalPolicyService } from '../approvals/price-approval-policy.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';

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
// CR-BOOK-PRICE-APPROVAL-001 — the price path now resolves its approver chain
// from the Mall's ApprovalPolicyRule and notifies them. Default to "inside the
// band" so tests that say nothing about price keep their old behaviour.
const priceApprovalPolicy = {
  evaluate: jest.fn().mockResolvedValue({
    evaluated: true,
    requiresApproval: false,
    deviationPercent: 0,
    approvalLevel: 'NONE',
    pricingRuleId: null,
    pricingSnapshot: undefined,
    steps: [],
    unrouted: false,
    message: 'ok',
  }),
  resolveSteps: jest.fn().mockResolvedValue([]),
} as any;
const notifications = { create: jest.fn() } as any;
const emailService = { sendMail: jest.fn(), bookingPriceApprovalHtml: jest.fn() } as any;

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
    // CR-BOOK-PRICE-APPROVAL-001 — the policy-resolved approver chain.
    bookingPriceApprovalStep: { deleteMany: jest.fn(), createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
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
        // CR-BOOK-PRICE-APPROVAL-001 — price routing / notification collaborators.
        { provide: PriceApprovalPolicyService, useValue: priceApprovalPolicy },
        { provide: NotificationsService, useValue: notifications },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();
    service = module.get(BookingService);
  });

  describe('create()', () => {
    beforeEach(() => {
      priceApprovalPolicy.evaluate.mockResolvedValue({
        evaluated: true,
        requiresApproval: true,
        deviationPercent: 99.995,
        approvalLevel: 'CEO',
        pricingRuleId: 'rule-1',
        pricingSnapshot: undefined,
        steps: [],
        unrouted: true,
        message: 'Below floor',
      });
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

      expect(priceApprovalPolicy.evaluate).toHaveBeenCalledWith(
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

      expect(priceApprovalPolicy.evaluate).toHaveBeenCalledWith(
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

      expect(priceApprovalPolicy.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({ proposedRentPerSqm: 25, currencyCode: 'USD' }),
      );
      expect(updated.priceApprovalStatus).toBe('PENDING');
    });
  });
});
