import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { CategoriesService } from '../categories/categories.service';
import { BookingStatus, PriceApprovalStatus } from '@prisma/client';
import { PriceApprovalPolicyService } from '../approvals/price-approval-policy.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { LeadLifecycleService } from '../crm/lead-lifecycle.service';

/**
 * CR-BOOK-CURRENCY-EDIT-001 — correcting a currency chosen wrongly at creation.
 *
 * The currency is not a label on the money, it is the money: every amount on a
 * booking is denominated in it, and the approval band is resolved in it. So the
 * change is allowed only while nobody has approved a price, and only when the
 * amounts come back in the same request. Carrying 650.000 across a switch from
 * VND to USD would restate a 650 thousand dong offer as a 650 thousand dollar
 * one, and it would look like an ordinary edit in the audit trail.
 */
const decision = (over: Record<string, unknown> = {}) => ({
  status: 'NOT_REQUIRED',
  severity: 'INFO',
  requiresAcknowledgement: false,
  blocking: false,
  basis: 'CATEGORY_BAND',
  proposedRentPerSqm: 0,
  reference: { minRentPerSqm: 0, maxRentPerSqm: 0, currency: 'VND' },
  deviationPercent: 0,
  approval: { required: false, policyConfigured: true, steps: [] },
  categoryPricingId: null,
  warningCode: 'PRICE_NOT_REQUIRED',
  message: 'ok',
  evaluatedAt: new Date().toISOString(),
  fingerprint: 'fp',
  ...over,
});

describe('BookingService.update() — changing the currency', () => {
  let service: BookingService;

  const priceApprovalPolicy = {
    evaluate: jest.fn(),
    resolveSteps: jest.fn().mockResolvedValue({ steps: [], ambiguous: false, ambiguousDetail: '' }),
    snapshotOf: jest.fn((d: any) => ({ status: d.status })),
    fingerprint: jest.fn(() => 'fp'),
  } as any;

  const prisma: any = {
    unit: { findUnique: jest.fn() },
    lead: { findUnique: jest.fn(), update: jest.fn() },
    unitBooking: {
      findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(), aggregate: jest.fn(), count: jest.fn(),
      create: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
    },
    bookingActivity: { create: jest.fn() },
    bookingPriceApprovalStep: {
      deleteMany: jest.fn(), createMany: jest.fn(), update: jest.fn(),
      updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };

  const unitStatus = {
    isCommittedToTenant: jest.fn().mockReturnValue(false),
    isLockedForBooking: jest.fn().mockReturnValue(false),
    transition: jest.fn().mockResolvedValue({}),
  } as any;

  /** A VND booking with a full set of amounts already on it. */
  const booking = (over: Record<string, unknown> = {}) => ({
    id: 'b1',
    isActive: true,
    status: BookingStatus.ACTIVE,
    createdById: 'creator',
    unitId: 'u1',
    leadId: 'l1',
    currencyCode: 'VND',
    priceApprovalStatus: PriceApprovalStatus.NOT_REQUIRED,
    budgetRentMin: 600000,
    budgetRentMax: 700000,
    expectedRent: 800000,
    proposedRentPerSqm: 650000,
    proposedCamPerSqm: 50000,
    serviceFeeSqm: null,
    businessSupportFeeSqm: null,
    exchangeRate: null,
    ...over,
  });

  /** Every amount, re-entered in the new currency. */
  const REPRICED = {
    budgetRentMin: 24,
    budgetRentMax: 28,
    expectedRent: 30,
    proposedRentPerSqm: 26,
    proposedCamPerSqm: 2,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    prisma.unit.findUnique.mockResolvedValue({
      id: 'u1', mallId: 'm1', categoryId: 'c1', floorId: 'f1', zoneId: null,
      isActive: true, baseRentPerSqm: 700000, currencyCode: 'VND', status: 'BOOKING',
    });
    prisma.unitBooking.count.mockResolvedValue(0);
    prisma.unitBooking.findMany.mockResolvedValue([]);
    prisma.unitBooking.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'b1', ...data }));
    prisma.bookingActivity.create.mockResolvedValue({});
    priceApprovalPolicy.evaluate.mockResolvedValue(decision());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: prisma },
        { provide: UnitStatusService, useValue: unitStatus },
        { provide: CategoriesService, useValue: { validateProposedPrice: jest.fn() } },
        { provide: PriceApprovalPolicyService, useValue: priceApprovalPolicy },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: EmailService, useValue: { sendMail: jest.fn(), bookingPriceApprovalHtml: jest.fn() } },
        { provide: LeadLifecycleService, useValue: { transition: jest.fn() } },
      ],
    }).compile();
    service = module.get(BookingService);
  });

  const givenBooking = (over: Record<string, unknown> = {}) =>
    prisma.unitBooking.findUnique.mockResolvedValue(booking(over));

  it('accepts the correction while no price has been approved', async () => {
    givenBooking();

    const result = await service.update('b1', { currencyCode: 'USD', ...REPRICED } as any, 'creator', 'ADMIN');

    expect(prisma.unitBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currencyCode: 'USD', proposedRentPerSqm: 26 }) }),
    );
    expect(result).toBeDefined();
  });

  it('refuses once somebody has approved a price in the old currency', async () => {
    givenBooking({ priceApprovalStatus: PriceApprovalStatus.APPROVED });

    await expect(
      service.update('b1', { currencyCode: 'USD', ...REPRICED } as any, 'creator', 'ADMIN'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.unitBooking.update).not.toHaveBeenCalled();
  });

  it('still allows the correction while a price is only waiting to be approved', async () => {
    givenBooking({ priceApprovalStatus: PriceApprovalStatus.PENDING });

    await expect(
      service.update('b1', { currencyCode: 'USD', ...REPRICED } as any, 'creator', 'ADMIN'),
    ).resolves.toBeDefined();
  });

  it('refuses to carry an amount across, naming what was left behind', async () => {
    givenBooking();

    // proposedCamPerSqm is on the booking but missing from the request.
    const { proposedCamPerSqm, ...partial } = REPRICED;
    await expect(
      service.update('b1', { currencyCode: 'USD', ...partial } as any, 'creator', 'ADMIN'),
    ).rejects.toThrow(/proposedCamPerSqm/);
    expect(prisma.unitBooking.update).not.toHaveBeenCalled();
  });

  it('does not ask for amounts the booking never had', async () => {
    givenBooking({ proposedCamPerSqm: null, budgetRentMin: null, budgetRentMax: null, expectedRent: null });

    await expect(
      service.update('b1', { currencyCode: 'USD', proposedRentPerSqm: 26 } as any, 'creator', 'ADMIN'),
    ).resolves.toBeDefined();
  });

  it('re-reads the price against the new currency even when the digits are unchanged', async () => {
    givenBooking();

    await service.update(
      'b1',
      { currencyCode: 'USD', ...REPRICED, proposedRentPerSqm: 650000 } as any,
      'creator',
      'ADMIN',
    );

    // 650000 VND and 650000 USD are not the same offer, and are not measured
    // against the same band.
    expect(priceApprovalPolicy.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ currencyCode: 'USD', proposedRentPerSqm: 650000 }),
    );
  });

  it('clears any earlier sign-off, because it was given for other figures', async () => {
    givenBooking({ priceApprovalStatus: PriceApprovalStatus.REJECTED });

    await service.update('b1', { currencyCode: 'USD', ...REPRICED } as any, 'creator', 'ADMIN');

    expect(prisma.unitBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priceApprovedById: null, priceApprovedAt: null, priceApprovalNote: null }),
      }),
    );
  });

  it('drops the exchange rate when the currency becomes the local one', async () => {
    givenBooking({ currencyCode: 'USD', exchangeRate: 24500 });

    await service.update('b1', { currencyCode: 'VND', ...REPRICED } as any, 'creator', 'ADMIN');

    expect(prisma.unitBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currencyCode: 'VND', exchangeRate: null }) }),
    );
  });

  it('writes what happened into the booking’s own history', async () => {
    givenBooking();

    await service.update('b1', { currencyCode: 'USD', ...REPRICED } as any, 'creator', 'ADMIN');

    const note = prisma.bookingActivity.create.mock.calls[0][0].data.note;
    expect(note).toContain('VND');
    expect(note).toContain('USD');
  });

  it('leaves an ordinary edit alone: no currency in the request, no re-pricing demanded', async () => {
    givenBooking();

    await service.update('b1', { requestedArea: 320 } as any, 'creator', 'ADMIN');

    const data = prisma.unitBooking.update.mock.calls[0][0].data;
    expect(data.currencyCode).toBeUndefined();
    expect(priceApprovalPolicy.evaluate).not.toHaveBeenCalled();
  });

  it('treats re-sending the same currency as no change at all', async () => {
    givenBooking();

    await service.update('b1', { currencyCode: 'VND', requestedArea: 320 } as any, 'creator', 'ADMIN');

    // No amounts were re-entered, and none had to be.
    const data = prisma.unitBooking.update.mock.calls[0][0].data;
    expect(data.currencyCode).toBeUndefined();
  });
});
