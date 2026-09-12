/**
 * CR-BOOK-PRICE-APPROVAL-001 — integration checks against a REAL PostgreSQL.
 *
 * The unit specs pin the decision logic with mocks. These pin the things mocks
 * cannot: what two concurrent writers actually do to the same row, whether a
 * denied mutation truly leaves nothing behind, and whether a booking from
 * another Mall can be reached by id.
 *
 * Requires a database created from the full migration chain:
 *   createdb leasing_cr_test
 *   DATABASE_URL=...leasing_cr_test npx prisma migrate deploy
 *   CR_TEST_DATABASE_URL=...leasing_cr_test npx jest -c test/jest-e2e.json
 *
 * The suite skips itself (loudly) when that URL is absent so it can never
 * silently pass in an environment without a database.
 */
import { PrismaClient, Role, PriceApprovalStatus, StepStatus, UnitStatus, BookingStatus } from '@prisma/client';
import { ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { BookingService } from '../src/modules/booking/booking.service';
import { PriceApprovalPolicyService } from '../src/modules/approvals/price-approval-policy.service';
import { CategoriesService } from '../src/modules/categories/categories.service';
import { EmailService } from '../src/modules/notifications/email.service';

const DB_URL = process.env.CR_TEST_DATABASE_URL;

if (!DB_URL) {
  // eslint-disable-next-line no-console
  console.error(
    '\n[CR-BOOK-PRICE-APPROVAL-001] CR_TEST_DATABASE_URL is not set — the real-Postgres ' +
      'concurrency / isolation suite did NOT run.\n',
  );
}

const maybeDescribe = DB_URL ? describe : describe.skip;

maybeDescribe('CR-BOOK-PRICE-APPROVAL-001 — real PostgreSQL', () => {
  let prisma: PrismaClient;
  let service: BookingService;

  // Fixture ids, recreated per test run.
  const ids = {
    mallA: 'cr-mall-a',
    mallB: 'cr-mall-b',
    catFnb: 'cr-cat-fnb',
    unitA: 'cr-unit-a',
    unitA2: 'cr-unit-a2',
    unitB: 'cr-unit-b',
    proposer: 'cr-user-proposer',
    manager: 'cr-user-manager',
    director: 'cr-user-director',
    admin: 'cr-user-admin',
    leadA: 'cr-lead-a',
    leadB: 'cr-lead-b',
  };

  const notifications: any = { create: jest.fn() };
  const emailService: any = { sendMail: jest.fn(), bookingPriceApprovalHtml: jest.fn(() => '<p/>') };
  const unitStatus: any = { isLockedForBooking: () => false, transition: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();

    const categories = new CategoriesService(prisma as any);
    const policy = new PriceApprovalPolicyService(prisma as any, categories);
    service = new BookingService(
      prisma as any,
      categories,
      unitStatus,
      policy,
      notifications,
      emailService,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function reset() {
    jest.clearAllMocks();
    await prisma.bookingActivity.deleteMany({});
    await prisma.bookingPriceApprovalStep.deleteMany({});
    await prisma.unitBooking.deleteMany({});
    await prisma.approvalPolicyRule.deleteMany({});
    await prisma.categoryMallPricing.deleteMany({});
    await prisma.lead.deleteMany({});
    await prisma.unit.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.userMallAccess.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.floor.deleteMany({});
    await prisma.mall.deleteMany({});

    for (const [id, name, code] of [
      [ids.mallA, 'Mall A', 'MA'],
      [ids.mallB, 'Mall B', 'MB'],
    ] as const) {
      await prisma.mall.create({ data: { id, name, code, address: 'x' } });
    }

    await prisma.category.create({
      data: { id: ids.catFnb, code: 'FNB', name: 'F&B', isActive: true },
    });

    for (const [id, fullName, email, role] of [
      [ids.proposer, 'Proposer', 'p@x.com', Role.LEASING_MANAGER],
      [ids.manager, 'Manager', 'm@x.com', Role.LEASING_MANAGER],
      [ids.director, 'Director', 'd@x.com', Role.MALL_DIRECTOR],
      [ids.admin, 'Admin', 'a@x.com', Role.ADMIN],
    ] as const) {
      await prisma.user.create({ data: { id, fullName, email, password: 'x', role } });
    }

    for (const [id, mallId, code] of [
      [ids.unitA, ids.mallA, 'A-101'],
      [ids.unitA2, ids.mallA, 'A-102'],
      [ids.unitB, ids.mallB, 'B-101'],
    ] as const) {
      await prisma.unit.create({
        data: {
          id,
          mallId,
          code,
          name: code,
          areaGFA: 100,
          areaNLA: 100,
          categoryId: ids.catFnb,
          status: UnitStatus.VACANT,
          isActive: true,
        },
      });
    }

    for (const mallId of [ids.mallA, ids.mallB]) {
      await prisma.categoryMallPricing.create({
        data: {
          mallId,
          categoryId: ids.catFnb,
          minRentPerSqm: 900_000,
          maxRentPerSqm: 1_500_000,
          isActive: true,
        },
      });
    }

    await prisma.lead.create({
      data: { id: ids.leadA, brandName: 'Lead A', contactName: 'A', mallId: ids.mallA, isActive: true },
    });
    await prisma.lead.create({
      data: { id: ids.leadB, brandName: 'Lead B', contactName: 'B', mallId: ids.mallB, isActive: true },
    });
  }

  async function addRule(over: Partial<any> = {}) {
    return prisma.approvalPolicyRule.create({
      data: {
        code: over.code ?? 'P1',
        mallId: over.mallId ?? ids.mallA,
        name: over.name ?? 'price',
        stepName: over.stepName ?? 'Manager Price Review',
        stepOrder: over.stepOrder ?? 10,
        approverRole: over.approverRole ?? Role.LEASING_MANAGER,
        approverId: over.approverId ?? ids.manager,
        conditionType: 'PRICE_BELOW_MIN',
        isRequired: false,
        isActive: true,
        ...('operator' in over ? { operator: over.operator } : {}),
        ...('threshold' in over ? { threshold: over.threshold } : {}),
      },
    });
  }

  /** A booking priced well below the floor, so approval is required. */
  async function makePendingBooking(opts: { unitId?: string; leadId?: string; rent?: number } = {}) {
    return service.create(
      {
        unitId: opts.unitId ?? ids.unitA,
        leadId: opts.leadId ?? ids.leadA,
        holdDays: 7,
        proposedRentPerSqm: opts.rent ?? 700_000,
        currencyCode: 'VND',
      } as any,
      ids.proposer,
    );
  }

  // ── 1. Unrouted ────────────────────────────────────────────────────────────

  describe('unrouted policy', () => {
    beforeEach(reset);

    it('holds the booking PENDING with no steps when no rule matches', async () => {
      const booking = await makePendingBooking();

      expect(booking.priceApprovalStatus).toBe(PriceApprovalStatus.PENDING);
      const steps = await prisma.bookingPriceApprovalStep.count({ where: { bookingId: booking.id } });
      expect(steps).toBe(0);
    });

    it('refuses ordinary staff and leaves zero side effects', async () => {
      const booking = await makePendingBooking();

      await expect(
        service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const after = await prisma.unitBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.priceApprovalStatus).toBe(PriceApprovalStatus.PENDING);
      expect(after.priceApprovedById).toBeNull();
    });

    it('lets ADMIN remediate, and records who did it in the activity log', async () => {
      const booking = await makePendingBooking();

      await service.approvePrice(booking.id, { note: 'remediate' } as any, {
        id: ids.admin,
        role: Role.ADMIN,
      });

      const after = await prisma.unitBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.priceApprovalStatus).toBe(PriceApprovalStatus.APPROVED);
      expect(after.priceApprovedById).toBe(ids.admin);

      const log = await prisma.bookingActivity.findMany({ where: { bookingId: booking.id } });
      const remediation = log.find((l) => (l.note ?? '').includes('chưa có chính sách'));
      expect(remediation).toBeDefined();
      expect(remediation!.performedById).toBe(ids.admin);
    });

    it('denies proposal conversion while unrouted', async () => {
      const booking = await makePendingBooking();

      await expect(
        service.convertToProposal(
          booking.id,
          { area: 100, term: 36, rentPerSqm: 700_000, startDate: new Date().toISOString() } as any,
          ids.proposer,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── 2. Multi-step ──────────────────────────────────────────────────────────

  describe('multi-step workflow', () => {
    beforeEach(async () => {
      await reset();
      await addRule({ code: 'S1', stepOrder: 10, approverId: ids.manager, approverRole: Role.LEASING_MANAGER });
      await addRule({ code: 'S2', stepOrder: 20, approverId: ids.director, approverRole: Role.MALL_DIRECTOR });
    });

    it('keeps the booking PENDING after step 1 and only APPROVES on the last step', async () => {
      const booking = await makePendingBooking();
      expect(await prisma.bookingPriceApprovalStep.count({ where: { bookingId: booking.id } })).toBe(2);

      await service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER });
      let after = await prisma.unitBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.priceApprovalStatus).toBe(PriceApprovalStatus.PENDING);

      await service.approvePrice(booking.id, {} as any, { id: ids.director, role: Role.MALL_DIRECTOR });
      after = await prisma.unitBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.priceApprovalStatus).toBe(PriceApprovalStatus.APPROVED);
      expect(after.priceApprovedById).toBe(ids.director);
    });

    it('refuses a future-step approver acting early', async () => {
      const booking = await makePendingBooking();

      await expect(
        service.approvePrice(booking.id, {} as any, { id: ids.director, role: Role.MALL_DIRECTOR }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a previous-step approver acting twice', async () => {
      const booking = await makePendingBooking();
      await service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER });

      await expect(
        service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const steps = await prisma.bookingPriceApprovalStep.findMany({
        where: { bookingId: booking.id },
        orderBy: { stepOrder: 'asc' },
      });
      expect(steps.map((s) => s.status)).toEqual([StepStatus.APPROVED, StepStatus.PENDING]);
    });
  });

  // ── 3. Snapshot invalidation ───────────────────────────────────────────────

  describe('snapshot invalidation', () => {
    beforeEach(async () => {
      await reset();
      await addRule({ code: 'S1', approverId: ids.manager });
      await addRule({ code: 'S2', stepOrder: 20, approverId: ids.director, approverRole: Role.MALL_DIRECTOR });
    });

    it('discards a chain already part-signed when the price changes', async () => {
      const booking = await makePendingBooking();
      await service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER });

      await service.update(booking.id, { proposedRentPerSqm: 600_000 } as any, ids.proposer);

      const steps = await prisma.bookingPriceApprovalStep.findMany({ where: { bookingId: booking.id } });
      expect(steps.every((s) => s.status === StepStatus.PENDING)).toBe(true);
      const after = await prisma.unitBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.priceApprovalStatus).toBe(PriceApprovalStatus.PENDING);
      expect(after.priceApprovedById).toBeNull();
      expect(after.priceApprovedAt).toBeNull();
    });

    it('re-evaluates when the booking moves to another unit, even at the same price', async () => {
      const booking = await makePendingBooking();
      await service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER });

      await service.update(
        booking.id,
        { unitId: ids.unitA2, proposedRentPerSqm: 700_000 } as any,
        ids.proposer,
      );

      const after = await prisma.unitBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.priceApprovedById).toBeNull();
      const steps = await prisma.bookingPriceApprovalStep.findMany({ where: { bookingId: booking.id } });
      expect(steps.every((s) => s.status === StepStatus.PENDING)).toBe(true);
    });

    it('an approved price still blocks conversion once it is re-priced', async () => {
      const booking = await makePendingBooking();
      await service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER });
      await service.approvePrice(booking.id, {} as any, { id: ids.director, role: Role.MALL_DIRECTOR });

      await service.update(booking.id, { proposedRentPerSqm: 500_000 } as any, ids.proposer);

      await expect(
        service.convertToProposal(
          booking.id,
          { area: 100, term: 36, rentPerSqm: 500_000, startDate: new Date().toISOString() } as any,
          ids.proposer,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    /**
     * KNOWN LIMITATION, pinned deliberately.
     *
     * Editing the UNIT's category (Spaces) moves the band the price was judged
     * against, but nothing recomputes the booking. The approval stays valid and
     * conversion is allowed. Re-validating on Category/CategoryMallPricing
     * writes is a fan-out this CR does not take on; the snapshot records what
     * the price was judged against so the staleness is at least auditable.
     */
    it('does NOT currently re-evaluate when the unit category changes underneath it', async () => {
      const booking = await makePendingBooking();
      await service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER });
      await service.approvePrice(booking.id, {} as any, { id: ids.director, role: Role.MALL_DIRECTOR });

      const other = await prisma.category.create({
        data: { code: 'LUX', name: 'Luxury', isActive: true },
      });
      await prisma.unit.update({ where: { id: ids.unitA }, data: { categoryId: other.id } });

      const after = await prisma.unitBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.priceApprovalStatus).toBe(PriceApprovalStatus.APPROVED);
    });
  });

  // ── 4. Concurrency ─────────────────────────────────────────────────────────

  describe('concurrency', () => {
    beforeEach(async () => {
      await reset();
      await addRule({ code: 'S1', approverId: ids.manager });
    });

    it('two concurrent approvals of the same step produce ONE outcome', async () => {
      const booking = await makePendingBooking();

      const results = await Promise.allSettled([
        service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER }),
        service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

      const steps = await prisma.bookingPriceApprovalStep.findMany({ where: { bookingId: booking.id } });
      expect(steps).toHaveLength(1);
      expect(steps[0].status).toBe(StepStatus.APPROVED);

      // One decision, one message to the requester.
      const decisions = notifications.create.mock.calls.filter((c: any[]) =>
        String(c[0].type).startsWith('PRICE_APPROVAL_APPROVED'),
      );
      expect(decisions).toHaveLength(1);
    });

    it('approve racing reject leaves one authoritative verdict, not a contradiction', async () => {
      const booking = await makePendingBooking();

      const results = await Promise.allSettled([
        service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER }),
        service.rejectPrice(booking.id, { reason: 'no' } as any, {
          id: ids.manager,
          role: Role.LEASING_MANAGER,
        }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

      const after = await prisma.unitBooking.findUniqueOrThrow({ where: { id: booking.id } });
      const step = await prisma.bookingPriceApprovalStep.findFirstOrThrow({
        where: { bookingId: booking.id },
      });
      // The booking verdict and the step decision must agree.
      const expected =
        step.status === StepStatus.APPROVED
          ? PriceApprovalStatus.APPROVED
          : PriceApprovalStatus.REJECTED;
      expect(after.priceApprovalStatus).toBe(expected);
      expect(after.priceApprovedById).toBe(step.decidedById);
    });

    it('a price edit racing an approval never leaves a signed step on the new price', async () => {
      const booking = await makePendingBooking();

      await Promise.allSettled([
        service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER }),
        service.update(booking.id, { proposedRentPerSqm: 550_000 } as any, ids.proposer),
      ]);

      const after = await prisma.unitBooking.findUniqueOrThrow({
        where: { id: booking.id },
        include: { priceApprovalSteps: true },
      });

      if (after.proposedRentPerSqm === 550_000) {
        // The re-price won: every step must belong to the new chain, unsigned.
        expect(after.priceApprovalStatus).toBe(PriceApprovalStatus.PENDING);
        expect(after.priceApprovedById).toBeNull();
        expect(after.priceApprovalSteps.every((s) => s.status === StepStatus.PENDING)).toBe(true);
      } else {
        // The approval won: the verdict must match the price it was given for.
        expect(after.priceApprovalStatus).toBe(PriceApprovalStatus.APPROVED);
      }
    });

    it('two concurrent bookings on the same unit do not both become ACTIVE', async () => {
      // The queue invariant must still hold now that create() writes steps too.
      const results = await Promise.allSettled([
        makePendingBooking(),
        makePendingBooking({ leadId: ids.leadA }),
      ]);
      const ok = results.filter((r) => r.status === 'fulfilled');
      const active = await prisma.unitBooking.count({
        where: { unitId: ids.unitA, status: BookingStatus.ACTIVE, isActive: true },
      });
      expect(active).toBeLessThanOrEqual(1);
      expect(ok.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 5. Separation of duties ────────────────────────────────────────────────

  describe('separation of duties', () => {
    beforeEach(reset);

    it('refuses even when the policy names the proposer as the approver', async () => {
      // The bypass this closes: pointing the rule at the salesperson.
      await addRule({ code: 'SELF', approverId: ids.proposer, approverRole: Role.LEASING_MANAGER });
      const booking = await makePendingBooking();

      await expect(
        service.approvePrice(booking.id, {} as any, { id: ids.proposer, role: Role.LEASING_MANAGER }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const after = await prisma.unitBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.priceApprovalStatus).toBe(PriceApprovalStatus.PENDING);
    });

    it('refuses an ADMIN approving a booking they created themselves', async () => {
      await addRule({ code: 'S1', approverId: ids.manager });
      const booking = await service.create(
        {
          unitId: ids.unitA,
          leadId: ids.leadA,
          holdDays: 7,
          proposedRentPerSqm: 700_000,
          currencyCode: 'VND',
        } as any,
        ids.admin,
      );

      await expect(
        service.approvePrice(booking.id, {} as any, { id: ids.admin, role: Role.ADMIN }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── 6. Mall isolation ──────────────────────────────────────────────────────

  describe('mall isolation', () => {
    beforeEach(async () => {
      await reset();
      // Mall B configures its own approver. A Mall A actor must not be able to
      // reach a Mall B booking by id.
      await addRule({ code: 'B1', mallId: ids.mallB, approverId: ids.director, approverRole: Role.MALL_DIRECTOR });
      await prisma.userMallAccess.create({
        data: { userId: ids.manager, mallId: ids.mallA, role: Role.LEASING_MANAGER, isActive: true },
      });
    });

    it('does not list another Mall pending approvals', async () => {
      await makePendingBooking({ unitId: ids.unitB, leadId: ids.leadB });

      const page = await service.getBookingsPendingPriceApproval({ mallIds: [ids.mallA] });
      expect(page.data).toHaveLength(0);

      const all = await service.getBookingsPendingPriceApproval({ mallIds: [ids.mallB] });
      expect(all.data).toHaveLength(1);
    });

    it('a Mall A step approver cannot decide a Mall B booking, with zero side effects', async () => {
      const booking = await makePendingBooking({ unitId: ids.unitB, leadId: ids.leadB });

      // The Mall B chain names the director; the Mall A manager is not on it.
      await expect(
        service.approvePrice(booking.id, {} as any, { id: ids.manager, role: Role.LEASING_MANAGER }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const after = await prisma.unitBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.priceApprovalStatus).toBe(PriceApprovalStatus.PENDING);
      expect(after.priceApprovedById).toBeNull();
      const steps = await prisma.bookingPriceApprovalStep.findMany({ where: { bookingId: booking.id } });
      expect(steps.every((s) => s.status === StepStatus.PENDING)).toBe(true);
    });

    it('a Mall A rule never routes a Mall B booking', async () => {
      await addRule({ code: 'A1', mallId: ids.mallA, approverId: ids.manager });
      const bookingB = await makePendingBooking({ unitId: ids.unitB, leadId: ids.leadB });

      const steps = await prisma.bookingPriceApprovalStep.findMany({
        where: { bookingId: bookingB.id },
      });
      expect(steps.map((s) => s.approverId)).toEqual([ids.director]);
    });
  });

  // ── 7. Approver resolution ─────────────────────────────────────────────────

  describe('approver resolution', () => {
    beforeEach(reset);

    it('binds the step to the named account, not merely to the role', async () => {
      await addRule({ code: 'S1', approverId: ids.manager, approverRole: Role.LEASING_MANAGER });
      const booking = await makePendingBooking();

      // Same role, different person.
      const peer = await prisma.user.create({
        data: { fullName: 'Peer', email: 'peer@x.com', password: 'x', role: Role.LEASING_MANAGER },
      });

      await expect(
        service.approvePrice(booking.id, {} as any, { id: peer.id, role: Role.LEASING_MANAGER }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ignores a deactivated rule, and falls closed when that leaves none', async () => {
      const rule = await addRule({ code: 'S1', approverId: ids.manager });
      await prisma.approvalPolicyRule.update({ where: { id: rule.id }, data: { isActive: false } });

      const booking = await makePendingBooking();
      const steps = await prisma.bookingPriceApprovalStep.count({ where: { bookingId: booking.id } });
      expect(steps).toBe(0);
      expect(booking.priceApprovalStatus).toBe(PriceApprovalStatus.PENDING);
    });

    it('creates one step per named approver when several rules match', async () => {
      await addRule({ code: 'S1', stepOrder: 10, approverId: ids.manager });
      await addRule({ code: 'S2', stepOrder: 10, approverId: ids.director, approverRole: Role.MALL_DIRECTOR });

      const booking = await makePendingBooking();
      const steps = await prisma.bookingPriceApprovalStep.findMany({
        where: { bookingId: booking.id },
        orderBy: { stepOrder: 'asc' },
      });
      expect(steps.map((s) => s.approverId)).toEqual([ids.manager, ids.director]);
      expect(steps.map((s) => s.stepOrder)).toEqual([1, 2]);
    });
  });
});

/**
 * Email ledger + idempotency, against the real EmailDelivery table.
 *
 * Separate suite because it uses the REAL EmailService (the workflow suite
 * above mocks it to keep the concurrency assertions about the booking tables).
 * SMTP stays unconfigured, so delivery lands as SKIPPED — the ledger row and
 * the unique eventKey are what is under test, not the transport.
 */
const maybeEmail = DB_URL ? describe : describe.skip;

maybeEmail('CR-BOOK-PRICE-APPROVAL-001 — email ledger', () => {
  let prisma: PrismaClient;
  let email: EmailService;

  beforeAll(async () => {
    // appUrl() refuses plain HTTP under a production APP_ENV; these tests are
    // about the ledger, so pin a dev-shaped environment explicitly.
    process.env.APP_ENV = 'development';
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_URL = 'http://localhost:8080';

    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();
    email = new EmailService(prisma as any, { decrypt: (v: string) => v } as any);
  });

  afterAll(async () => {
    await prisma.emailDelivery.deleteMany({ where: { eventType: 'BOOKING_PRICE_APPROVAL' } });
    await prisma.$disconnect();
  });

  function send(eventKey: string) {
    return email.sendMail({
      to: 'approver@example.com',
      delivery: {
        eventKey,
        eventType: 'BOOKING_PRICE_APPROVAL',
        entityType: 'UnitBooking',
        entityId: 'bk-x',
      },
      subject: '[THISO] test',
      html: email.bookingPriceApprovalHtml({
        approverName: 'Manager',
        stepName: 'Manager Price Review',
        bookingNumber: 'BK-X',
        bookingId: 'bk-x',
        partyName: 'Brand',
        unitCode: 'A-101',
        mallName: 'Mall A',
        proposedRentPerSqm: 700_000,
        deviationPercent: 22.2,
        proposedBy: 'Proposer',
        currencyCode: 'VND',
        snapshot: { minRentPerSqm: 900_000, maxRentPerSqm: 1_500_000 },
      }),
    });
  }

  it('writes one tracked EmailDelivery row for a price-approval send', async () => {
    const key = `booking-price-approval:bk-x:step-${Date.now()}`;
    await send(key);

    const rows = await prisma.emailDelivery.findMany({ where: { eventKey: key } });
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('BOOKING_PRICE_APPROVAL');
  });

  it('does not duplicate the delivery when the same step is retried', async () => {
    const key = `booking-price-approval:bk-x:step-retry-${Date.now()}`;
    const first = await send(key);
    const second = await send(key);

    expect((second as any).duplicate).toBe(true);
    expect((second as any).deliveryId).toBe((first as any).deliveryId);
    const rows = await prisma.emailDelivery.count({ where: { eventKey: key } });
    expect(rows).toBe(1);
  });

  it('gives a different chain its own key, so a re-priced booking is not swallowed', async () => {
    const a = `booking-price-approval:bk-x:step-A-${Date.now()}`;
    const b = `booking-price-approval:bk-x:step-B-${Date.now()}`;
    await send(a);
    const second = await send(b);

    expect((second as any).duplicate).toBeUndefined();
  });
});
