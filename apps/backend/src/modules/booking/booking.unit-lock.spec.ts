import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { CategoriesService } from '../categories/categories.service';
import { UnitStatus } from '@prisma/client';
import { PriceApprovalPolicyService } from '../approvals/price-approval-policy.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { LeadLifecycleService } from '../crm/lead-lifecycle.service';

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

// CR-BOOK-PRICE-APPROVAL-001 — the price path now resolves its approver chain
// from the Mall's ApprovalPolicyRule and notifies them. Default to "inside the
// band" so tests that say nothing about price keep their old behaviour.
const priceApprovalPolicy = {
  // CR-...-ALWAYS-WARN-004: the contract is a PricingDecision, and the service
  // asks the policy service to turn it into the persisted snapshot.
  evaluate: jest.fn().mockResolvedValue({
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
  }),
  resolveSteps: jest.fn().mockResolvedValue({ steps: [], ambiguous: false, ambiguousDetail: '' }),
  snapshotOf: jest.fn((d: any) => ({ status: d.status, basis: d.basis })),
  fingerprint: jest.fn(() => 'fp'),
} as any;
const notifications = { create: jest.fn() } as any;
const emailService = { sendMail: jest.fn(), bookingPriceApprovalHtml: jest.fn() } as any;
// CR-CRM-BUSINESS-EVENT: BookingService now routes the Lead status change
// through LeadLifecycleService instead of writing tx.lead.update directly, so
// the transition is recorded as a CRM business event. The double records the
// call; the suites assert on it rather than on the raw write.
const leadLifecycle = { transition: jest.fn().mockResolvedValue(undefined) } as any;


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
    // CR-BOOK-PRICE-APPROVAL-001 — the policy-resolved approver chain.
    bookingPriceApprovalStep: { deleteMany: jest.fn(), createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
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
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', mallId: 'mall-1', isActive: true });
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
        // CR-BOOK-PRICE-APPROVAL-001 — price routing / notification collaborators.
        { provide: PriceApprovalPolicyService, useValue: priceApprovalPolicy },
        { provide: NotificationsService, useValue: notifications },
        { provide: EmailService, useValue: emailService },
        { provide: LeadLifecycleService, useValue: leadLifecycle },
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

  it('blocks booking when unit is LIQUIDATED — still has a live (TERMINATING) contract', async () => {
    prisma.unit.findUnique.mockResolvedValue(makeUnit(UnitStatus.LIQUIDATED));
    unitStatus.isCommittedToTenant.mockReturnValue(true);
    unitStatus.isLockedForBooking.mockReturnValue(true);

    await expect(service.create(createDto as any, 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('allows booking when unit is OFFERING — actively marketed, no hold yet', async () => {
    prisma.unit.findUnique.mockResolvedValue(makeUnit(UnitStatus.OFFERING));
    unitStatus.isCommittedToTenant.mockReturnValue(false);
    unitStatus.isLockedForBooking.mockReturnValue(false);

    const result = await service.create(createDto as any, 'user-1');
    expect(result).toBeDefined();
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
