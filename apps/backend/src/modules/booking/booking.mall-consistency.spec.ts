import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { CategoriesService } from '../categories/categories.service';
import { BookingStatus, UnitStatus } from '@prisma/client';
import { PriceApprovalPolicyService } from '../approvals/price-approval-policy.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';

// CR-101 Phase 3E — INV-AUTH-006 caller-specific coverage: BookingService.update()'s
// unit-reassignment branch is the one call site (of 12) where UnitStatusService.transition()
// is fed a client-influenced unitId (`dto.unitId`) against a booking that already belongs to
// an established Mall. MallAccessGuard only proves the caller can access the *new* unit's
// Mall (a staff member can legitimately hold grants to several Malls) — it says nothing about
// whether that Mall is consistent with the booking's own. This suite proves that consistency
// is enforced, and enforced before any write.
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

describe('BookingService.update() — INV-AUTH-006 mall consistency on unit reassignment', () => {
  let service: BookingService;

  const units: Record<string, any> = {
    'unit-old': { id: 'unit-old', mallId: 'mall-1', isActive: true, status: UnitStatus.BOOKING },
    'unit-new-same-mall': { id: 'unit-new-same-mall', mallId: 'mall-1', isActive: true, status: UnitStatus.VACANT },
    'unit-new-other-mall': { id: 'unit-new-other-mall', mallId: 'mall-2', isActive: true, status: UnitStatus.VACANT },
  };

  const booking = {
    id: 'booking-1',
    unitId: 'unit-old',
    leadId: null,
    status: BookingStatus.ACTIVE,
    isActive: true,
    currencyCode: 'VND',
    proposedRentPerSqm: null,
    createdById: 'user-1',
  };

  const prisma = {
    unitBooking: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    unit: { findUnique: jest.fn() },
    bookingActivity: { create: jest.fn() },
    // CR-BOOK-PRICE-APPROVAL-001 — the policy-resolved approver chain.
    bookingPriceApprovalStep: { deleteMany: jest.fn(), createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: any) => fn(prisma)),
  } as any;

  const unitStatus = {
    isLockedForBooking: jest.fn().mockReturnValue(false),
    transition: jest.fn(),
  } as any;

  const categories = {} as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.unitBooking.findUnique.mockResolvedValue(booking);
    prisma.unit.findUnique.mockImplementation(({ where }: any) => Promise.resolve(units[where.id] ?? null));
    prisma.unitBooking.count.mockResolvedValue(0);
    prisma.unitBooking.findFirst.mockResolvedValue(null);
    prisma.unitBooking.update.mockResolvedValue({ id: 'booking-1' });
    prisma.bookingActivity.create.mockResolvedValue({});
    unitStatus.isLockedForBooking.mockReturnValue(false);
    unitStatus.transition.mockResolvedValue({});

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

  it('denies reassignment to a unit in a different mall, before any transaction/write', async () => {
    await expect(
      service.update('booking-1', { unitId: 'unit-new-other-mall' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.unitBooking.update).not.toHaveBeenCalled();
    expect(unitStatus.transition).not.toHaveBeenCalled();
  });

  it('allows reassignment to a different unit within the same mall', async () => {
    const result = await service.update('booking-1', { unitId: 'unit-new-same-mall' } as any, 'user-1');

    expect(result).toBeDefined();
    expect(unitStatus.transition).toHaveBeenCalledWith(
      'unit-new-same-mall',
      UnitStatus.BOOKING,
      expect.objectContaining({ expectedMallId: 'mall-1' }),
      prisma,
    );
  });

  it('does not require mall consistency when the unit is not being changed', async () => {
    const result = await service.update('booking-1', { notes: 'just a note update' } as any, 'user-1');

    expect(result).toBeDefined();
    expect(unitStatus.transition).not.toHaveBeenCalled();
  });

  it('a retry after a cross-mall denial still produces no side effects', async () => {
    await expect(
      service.update('booking-1', { unitId: 'unit-new-other-mall' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update('booking-1', { unitId: 'unit-new-other-mall' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.unitBooking.update).not.toHaveBeenCalled();
    expect(unitStatus.transition).not.toHaveBeenCalled();
  });
});
