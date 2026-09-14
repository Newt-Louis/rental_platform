/**
 * CR-BOOK-PRICE-APPROVAL-001 — booking price approval workflow.
 *
 * What this replaces: a flat PENDING flag on the booking, an approve/reject
 * endpoint with no role restriction at all, and no notification of any kind.
 * A Leasing Executive could approve the price they had just proposed, and the
 * CEO the policy kept naming was not even a member of the bookings module.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PriceApprovalStatus, StepStatus, Role } from '@prisma/client';
import { BookingService } from './booking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { PriceApprovalPolicyService } from '../approvals/price-approval-policy.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
// Added to BookingService by the concurrent CRM business-event work; mocked so
// this suite exercises the price path and nothing else.
import { LeadLifecycleService } from '../crm/lead-lifecycle.service';

const PROPOSER = 'user-sales';
const MANAGER = 'user-manager';
const DIRECTOR = 'user-director';

function step(over: Partial<any> = {}) {
  return {
    id: 'step-1',
    bookingId: 'bk-1',
    stepOrder: 1,
    stepName: 'Leasing Manager Price Review',
    approverRole: Role.LEASING_MANAGER,
    approverId: MANAGER,
    approver: { id: MANAGER, email: 'manager@thiso.com', fullName: 'Manager' },
    status: StepStatus.PENDING,
    ...over,
  };
}

function booking(over: Partial<any> = {}) {
  return {
    id: 'bk-1',
    bookingNumber: 'BK-001',
    createdById: PROPOSER,
    priceProposedById: PROPOSER,
    proposedRentPerSqm: 700_000,
    currencyCode: 'VND',
    priceApprovalStatus: PriceApprovalStatus.PENDING,
    priceDeviationPercent: 22.2,
    unit: { id: 'unit-1', code: 'A-101', mallId: 'mall-1' },
    priceApprovalSteps: [step()],
    ...over,
  };
}

describe('BookingService — price approval workflow', () => {
  let service: BookingService;
  let prisma: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      unitBooking: {
        findUnique: jest.fn(),
        update: jest.fn(async ({ data }: any) => ({ id: 'bk-1', ...data })),
        // The step/booking transition is a CONDITIONAL claim now, so the double
        // has to report that exactly one row was taken.
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      bookingPriceApprovalStep: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      bookingActivity: { create: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    notifications = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: prisma },
        { provide: CategoriesService, useValue: {} },
        { provide: UnitStatusService, useValue: {} },
        { provide: PriceApprovalPolicyService, useValue: { evaluate: jest.fn() } },
        { provide: NotificationsService, useValue: notifications },
        { provide: EmailService, useValue: { sendMail: jest.fn(), bookingPriceApprovalHtml: jest.fn() } },
        { provide: LeadLifecycleService, useValue: { recordBookingEvent: jest.fn() } },
      ],
    }).compile();
    service = module.get(BookingService);
  });

  // ── Separation of duties ───────────────────────────────────────────────────

  it('refuses the person who proposed the price', async () => {
    prisma.unitBooking.findUnique.mockResolvedValue(booking());

    await expect(
      service.approvePrice('bk-1', {} as any, { id: PROPOSER, role: Role.LEASING_MANAGER }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.unitBooking.update).not.toHaveBeenCalled();
  });

  it('refuses the person who created the booking', async () => {
    prisma.unitBooking.findUnique.mockResolvedValue(
      booking({ priceProposedById: null, createdById: MANAGER }),
    );

    await expect(
      service.approvePrice('bk-1', {} as any, { id: MANAGER, role: Role.LEASING_MANAGER }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('applies separation of duties to ADMIN too', async () => {
    // The account most likely to hold both roles is exactly the one an
    // exemption would exempt.
    prisma.unitBooking.findUnique.mockResolvedValue(booking({ priceProposedById: 'user-admin' }));

    await expect(
      service.approvePrice('bk-1', {} as any, { id: 'user-admin', role: Role.ADMIN }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ── Step routing ───────────────────────────────────────────────────────────

  it('refuses an approver the policy did not name for this step', async () => {
    prisma.unitBooking.findUnique.mockResolvedValue(booking());

    await expect(
      service.approvePrice('bk-1', {} as any, { id: DIRECTOR, role: Role.MALL_DIRECTOR }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.unitBooking.update).not.toHaveBeenCalled();
  });

  it('lets the named approver decide their own step', async () => {
    prisma.unitBooking.findUnique.mockResolvedValue(booking());

    await service.approvePrice('bk-1', { note: 'ok' } as any, { id: MANAGER, role: Role.LEASING_MANAGER });

    // Claimed conditionally: the where clause must pin the step to PENDING, so
    // a second concurrent decision finds nothing to take.
    expect(prisma.bookingPriceApprovalStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step-1', status: StepStatus.PENDING },
        data: expect.objectContaining({ status: StepStatus.APPROVED, decidedById: MANAGER }),
      }),
    );
    expect(prisma.unitBooking.update.mock.calls[0][0].data.priceApprovalStatus).toBe(
      PriceApprovalStatus.APPROVED,
    );
  });

  it('keeps the price PENDING until the LAST step signs off', async () => {
    prisma.unitBooking.findUnique.mockResolvedValue(
      booking({
        priceApprovalSteps: [
          step(),
          step({ id: 'step-2', stepOrder: 2, approverId: DIRECTOR, approverRole: Role.MALL_DIRECTOR }),
        ],
      }),
    );

    await service.approvePrice('bk-1', {} as any, { id: MANAGER, role: Role.LEASING_MANAGER });

    const data = prisma.unitBooking.update.mock.calls[0][0].data;
    expect(data.priceApprovalStatus).toBeUndefined();
    expect(data.priceApprovedById).toBeUndefined();
  });

  it('takes the lowest pending step, so a later approver cannot jump the queue', async () => {
    prisma.unitBooking.findUnique.mockResolvedValue(
      booking({
        priceApprovalSteps: [
          step({ id: 'step-2', stepOrder: 2, approverId: DIRECTOR, approverRole: Role.MALL_DIRECTOR }),
          step(),
        ],
      }),
    );

    await expect(
      service.approvePrice('bk-1', {} as any, { id: DIRECTOR, role: Role.MALL_DIRECTOR }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ── Unrouted ───────────────────────────────────────────────────────────────

  it('holds an unrouted price and lets only ADMIN clear it', async () => {
    const unrouted = booking({ priceApprovalSteps: [] });
    prisma.unitBooking.findUnique.mockResolvedValue(unrouted);

    await expect(
      service.approvePrice('bk-1', {} as any, { id: MANAGER, role: Role.LEASING_MANAGER }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.unitBooking.findUnique.mockResolvedValue(unrouted);
    await service.approvePrice('bk-1', {} as any, { id: 'user-admin', role: Role.ADMIN });
    expect(prisma.unitBooking.update.mock.calls[0][0].data.priceApprovalStatus).toBe(
      PriceApprovalStatus.APPROVED,
    );
  });

  // ── Rejection ──────────────────────────────────────────────────────────────

  it('ends the chain on rejection instead of leaving later steps live', async () => {
    prisma.unitBooking.findUnique.mockResolvedValue(
      booking({
        priceApprovalSteps: [
          step(),
          step({ id: 'step-2', stepOrder: 2, approverId: DIRECTOR, approverRole: Role.MALL_DIRECTOR }),
        ],
      }),
    );

    await service.rejectPrice('bk-1', { reason: 'quá thấp' } as any, {
      id: MANAGER,
      role: Role.LEASING_MANAGER,
    });

    expect(prisma.bookingPriceApprovalStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: StepStatus.SKIPPED } }),
    );
    expect(prisma.unitBooking.update.mock.calls[0][0].data.priceApprovalStatus).toBe(
      PriceApprovalStatus.REJECTED,
    );
  });

  it('refuses to decide a price that is not pending', async () => {
    prisma.unitBooking.findUnique.mockResolvedValue(
      booking({ priceApprovalStatus: PriceApprovalStatus.APPROVED }),
    );

    await expect(
      service.approvePrice('bk-1', {} as any, { id: MANAGER, role: Role.LEASING_MANAGER }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Notification ───────────────────────────────────────────────────────────

  it('tells the proposer the outcome', async () => {
    prisma.unitBooking.findUnique
      .mockResolvedValueOnce(booking())
      .mockResolvedValueOnce({ ...booking(), priceProposedById: PROPOSER });

    await service.approvePrice('bk-1', {} as any, { id: MANAGER, role: Role.LEASING_MANAGER });

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: PROPOSER, type: 'PRICE_APPROVAL_APPROVED' }),
    );
  });
});
