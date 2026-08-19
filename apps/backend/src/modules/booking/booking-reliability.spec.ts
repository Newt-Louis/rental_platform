import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { CategoriesService } from '../categories/categories.service';
import { BookingStatus, UnitStatus } from '@prisma/client';

/**
 * Phase 6 hardening (docs/program/RELIABILITY_BACKLOG.md items 1-3,
 * docs/program/07-CRM-BOOKING-COMPLETION.md): create/update/cancel used to run as several
 * unwrapped writes, and create()/update()'s queue-position computation (aggregate MAX + 1 /
 * count-then-write) was race-prone under concurrent requests for the same unit. These tests
 * cover the Serializable-transaction + P2034-retry hardening added this phase, mirroring the
 * pattern already proven in contract-activation.spec.ts / proposals.service.spec.ts.
 */
describe('BookingService reliability — create/update/cancel atomicity, idempotency, concurrency', () => {
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
    // Explicit, complete baseline every test starts from — clearAllMocks() only clears call
    // history, not mockResolvedValue/mockImplementation setups, so every mock touched by any
    // test anywhere in this file is reset here rather than relying on clearAllMocks alone
    // (a prior test's persistent mock value otherwise leaks into the next test).
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
    const dto = { unitId: 'unit-1', leadId: 'lead-1', holdDays: 7 } as any;

    beforeEach(() => {
      prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', mallId: 'mall-1', status: UnitStatus.VACANT, isActive: true });
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', isActive: true });
    });

    it('resolves a lost concurrent-same-unit race by retrying with fresh data instead of erroring', async () => {
      // Attempt 1's whole transaction (Postgres detects the conflict at COMMIT time, after the
      // callback body already ran) is modeled as $transaction itself rejecting — the callback
      // never gets to return a value on that attempt. Attempt 2 runs for real and sees the
      // winner's booking already occupying priority 1.
      prisma.unitBooking.aggregate.mockResolvedValue({ _max: { priority: 1 } });
      prisma.$transaction
        .mockImplementationOnce(() => Promise.reject({ code: 'P2034' })) // lost the race
        .mockImplementationOnce((fn: any) => fn(prisma)); // retry succeeds

      const result = await service.create(dto, 'user-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(result.priority).toBe(2); // correctly queued behind the winner, not erroring
      expect(result.status).toBe(BookingStatus.PENDING);
    });

    it('propagates a genuine (non-race) transaction failure without retrying', async () => {
      prisma.unitBooking.aggregate.mockResolvedValue({ _max: { priority: 0 } });
      prisma.$transaction.mockRejectedValueOnce(new Error('db unavailable'));

      await expect(service.create(dto, 'user-1')).rejects.toThrow('db unavailable');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('re-checks for an existing active booking inside the transaction, not just before it', async () => {
      prisma.unitBooking.aggregate.mockResolvedValue({ _max: { priority: 0 } });
      prisma.unitBooking.count.mockResolvedValue(0);
      // Simulates another request creating a conflicting booking between the pre-transaction
      // read (implicitly none, since findFirst is only ever called inside the tx in this
      // implementation) and this attempt.
      prisma.unitBooking.findFirst.mockResolvedValue({ id: 'existing-1' });

      await expect(service.create(dto, 'user-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.unitBooking.create).not.toHaveBeenCalled();
    });

    it('commits the unit-status transition and lead update inside the same transaction as the booking create', async () => {
      prisma.unitBooking.aggregate.mockResolvedValue({ _max: { priority: 0 } });
      prisma.unitBooking.count.mockResolvedValue(0);

      await service.create(dto, 'user-1');

      expect(unitStatus.transition).toHaveBeenCalledWith(
        'unit-1',
        UnitStatus.BOOKING,
        expect.objectContaining({ userId: 'user-1' }),
        prisma, // the tx client (== prisma in this mock harness)
      );
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lead-1' }, data: { status: 'PROPOSAL' } }),
      );
    });
  });

  describe('cancel()', () => {
    it('treats an already-CANCELLED booking as an idempotent replay, not an error, without opening a transaction', async () => {
      prisma.unitBooking.findUnique.mockResolvedValue({ id: 'b1', unitId: 'unit-1', isActive: true, status: BookingStatus.CANCELLED });

      const result = await service.cancel('b1', { reason: 'test' } as any, 'user-1');

      expect(result).toEqual({ message: 'Booking đã được hủy' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('cancels atomically and promotes the next queued booking inside the same transaction', async () => {
      prisma.unitBooking.findUnique.mockResolvedValue({ id: 'b1', unitId: 'unit-1', isActive: true, status: BookingStatus.ACTIVE });
      prisma.unitBooking.findUniqueOrThrow.mockResolvedValue({ id: 'b1', status: BookingStatus.ACTIVE });
      prisma.unitBooking.update.mockResolvedValue({ id: 'b1', status: BookingStatus.CANCELLED });
      prisma.unitBooking.findFirst.mockResolvedValue(null); // no one queued behind it

      const result = await service.cancel('b1', { reason: 'khách đổi ý' } as any, 'user-1');

      expect(result).toEqual({ message: 'Booking đã được hủy' });
      expect(prisma.unitBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'b1' }, data: expect.objectContaining({ status: BookingStatus.CANCELLED }) }),
      );
      // No one left in queue → unit released back to VACANT (promoteNextInQueue's else-branch).
      expect(unitStatus.transition).toHaveBeenCalledWith('unit-1', UnitStatus.VACANT, expect.anything(), prisma);
    });

    it('treats a lost race (booking already cancelled by the time the transaction opens) as a safe no-op', async () => {
      prisma.unitBooking.findUnique.mockResolvedValue({ id: 'b1', unitId: 'unit-1', isActive: true, status: BookingStatus.ACTIVE });
      prisma.unitBooking.findUniqueOrThrow.mockResolvedValue({ id: 'b1', status: BookingStatus.CANCELLED });

      const result = await service.cancel('b1', { reason: 'test' } as any, 'user-1');

      expect(result).toEqual({ message: 'Booking đã được hủy' });
      expect(prisma.unitBooking.update).not.toHaveBeenCalled();
    });
  });

  describe('reinstate()', () => {
    it('recomputes priority atomically and is not vulnerable to the same-unit race', async () => {
      prisma.unitBooking.findUnique.mockResolvedValue({
        id: 'b1', unitId: 'unit-1', status: BookingStatus.CANCELLED, isActive: true, holdDays: 7, bookingNumber: 'BK-1',
      });
      prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', status: UnitStatus.VACANT, isActive: true });
      prisma.unitBooking.aggregate.mockResolvedValue({ _max: { priority: 0 } });
      // service.findOne() is called at the end — stub it directly to avoid mocking its full include shape.
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'b1', status: BookingStatus.ACTIVE, priority: 1 } as any);

      const result = await service.reinstate('b1', 'user-1');

      expect(prisma.unitBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: BookingStatus.ACTIVE, priority: 1 }) }),
      );
      expect(unitStatus.transition).toHaveBeenCalledWith('unit-1', UnitStatus.BOOKING, expect.anything(), prisma);
      expect(result.status).toBe(BookingStatus.ACTIVE);
    });
  });

  describe('expireOverdueBookings()', () => {
    it('skips a booking that was already changed by someone else instead of blindly forcing EXPIRED', async () => {
      const overdue = { id: 'b1', unitId: 'unit-1', createdById: 'user-1', expiresAt: new Date('2020-01-01') };
      prisma.unitBooking.findMany.mockResolvedValue([overdue]);
      // Inside the transaction, the booking has since been cancelled by its owner — no longer
      // an eligible expiry candidate.
      prisma.unitBooking.findUniqueOrThrow.mockResolvedValue({ ...overdue, status: BookingStatus.CANCELLED, expiresAt: overdue.expiresAt });

      const result = await service.expireOverdueBookings();

      expect(result.expiredCount).toBe(0);
      expect(prisma.unitBooking.update).not.toHaveBeenCalled();
    });

    it('expires an eligible booking and promotes the next in queue atomically', async () => {
      const overdue = { id: 'b1', unitId: 'unit-1', createdById: 'user-1', expiresAt: new Date('2020-01-01') };
      prisma.unitBooking.findMany.mockResolvedValue([overdue]);
      prisma.unitBooking.findUniqueOrThrow.mockResolvedValue({ ...overdue, status: BookingStatus.ACTIVE });
      prisma.unitBooking.findFirst.mockResolvedValue(null); // nothing queued behind it

      const result = await service.expireOverdueBookings();

      expect(result.expiredCount).toBe(1);
      expect(prisma.unitBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'b1' }, data: { status: BookingStatus.EXPIRED } }),
      );
      expect(unitStatus.transition).toHaveBeenCalledWith('unit-1', UnitStatus.VACANT, expect.anything(), prisma);
    });

    it("one booking's failure does not abort the batch for the rest", async () => {
      const bad = { id: 'bad', unitId: 'unit-bad', createdById: 'user-1', expiresAt: new Date('2020-01-01') };
      const good = { id: 'good', unitId: 'unit-good', createdById: 'user-1', expiresAt: new Date('2020-01-01') };
      prisma.unitBooking.findMany.mockResolvedValue([bad, good]);
      prisma.unitBooking.findUniqueOrThrow
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ ...good, status: BookingStatus.ACTIVE });
      prisma.unitBooking.findFirst.mockResolvedValue(null);

      const result = await service.expireOverdueBookings();

      expect(result.expiredCount).toBe(1); // only "good" counted
      expect(prisma.unitBooking.update).toHaveBeenCalledTimes(1);
      expect(prisma.unitBooking.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'good' } }));
    });
  });

  describe('update() — unit-change path', () => {
    const existingBooking = {
      id: 'b1', unitId: 'unit-old', leadId: null, status: BookingStatus.ACTIVE, isActive: true,
      proposedRentPerSqm: null,
    };

    beforeEach(() => {
      prisma.unitBooking.findUnique.mockResolvedValue(existingBooking);
      prisma.unit.findUnique.mockResolvedValue({ id: 'unit-new', mallId: 'mall-1', status: UnitStatus.VACANT, isActive: true, categoryId: null });
      prisma.unitBooking.update.mockResolvedValue({ id: 'b1', unitId: 'unit-new', status: BookingStatus.ACTIVE });
    });

    it('computes the new unit queue position inside the transaction and promotes the old unit queue atomically', async () => {
      prisma.unitBooking.count.mockResolvedValue(0); // new unit is empty → becomes ACTIVE, priority 1
      prisma.unitBooking.findFirst.mockResolvedValue(null); // old unit's queue is empty after this booking leaves

      const result = await service.update('b1', { unitId: 'unit-new' } as any, 'user-1');

      expect(result.unitId).toBe('unit-new');
      expect(prisma.unitBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unitId: 'unit-new', priority: 1, status: BookingStatus.ACTIVE }),
        }),
      );
      // Old unit released (no one queued) and new unit reserved — both inside the same tx.
      expect(unitStatus.transition).toHaveBeenCalledWith('unit-old', UnitStatus.VACANT, expect.anything(), prisma);
      expect(unitStatus.transition).toHaveBeenCalledWith('unit-new', UnitStatus.BOOKING, expect.anything(), prisma);
    });
  });
});
