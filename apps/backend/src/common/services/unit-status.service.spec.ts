import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UnitStatus } from '@prisma/client';
import { UnitStatusService } from './unit-status.service';

describe('UnitStatusService lifecycle integrity', () => {
  const prisma: any = {
    unit: { findUnique: jest.fn(), update: jest.fn() },
    contract: { findFirst: jest.fn() },
    unitBooking: { findFirst: jest.fn() },
    unitHistory: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new UnitStatusService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.contract.findFirst.mockResolvedValue(null);
    prisma.unitBooking.findFirst.mockResolvedValue(null);
    prisma.unit.update.mockResolvedValue({ id: 'unit-1' });
    prisma.unitHistory.create.mockResolvedValue({ id: 'history-1' });
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it('does not downgrade a unit that has a live contract', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', status: UnitStatus.CONTRACTED });
    prisma.contract.findFirst.mockResolvedValue({ contractNumber: 'CTR-001' });

    await expect(service.transition('unit-1', UnitStatus.BOOKING, { force: true }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.unit.update).not.toHaveBeenCalled();
  });

  it('requires a real active booking before entering BOOKING', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', status: UnitStatus.VACANT });

    await expect(service.transition('unit-1', UnitStatus.BOOKING))
      .rejects.toThrow('Cannot set BOOKING without an active booking');
  });

  it('updates BOOKING and records history when an active booking exists', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', status: UnitStatus.VACANT });
    prisma.unitBooking.findFirst.mockResolvedValue({ id: 'booking-1' });

    await service.transition('unit-1', UnitStatus.BOOKING, { userId: 'user-1' });

    expect(prisma.unit.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: UnitStatus.BOOKING, vacantSince: null }),
    }));
    expect(prisma.unitHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ oldValue: UnitStatus.VACANT, newValue: UnitStatus.BOOKING }),
    }));
  });
});

// Business-lifecycle audit: OFFERING and LIQUIDATED eligibility/lock predicates and the
// transition graph edges a live Contract's lifecycle actually depends on (a Contract goes
// ACTIVE — and is therefore terminable — as soon as the Unit reaches CONTRACTED, well before
// fit-out finishes, so LIQUIDATED must be reachable from CONTRACTED and UNDER_FITOUT too, not
// only OCCUPIED).
describe('UnitStatusService — OFFERING and LIQUIDATED invariants', () => {
  const service = new UnitStatusService({} as any);

  it('OFFERING is bookable: not committed to a tenant and not locked for booking', () => {
    expect(service.isCommittedToTenant(UnitStatus.OFFERING)).toBe(false);
    expect(service.isLockedForBooking(UnitStatus.OFFERING)).toBe(false);
  });

  it('LIQUIDATED is committed and fully locked for booking — the Contract is still live (TERMINATING)', () => {
    expect(service.isCommittedToTenant(UnitStatus.LIQUIDATED)).toBe(true);
    expect(service.isLockedForBooking(UnitStatus.LIQUIDATED)).toBe(true);
  });

  it.each([UnitStatus.CONTRACTED, UnitStatus.UNDER_FITOUT, UnitStatus.OCCUPIED])(
    '%s can transition to LIQUIDATED — each is a state a live, terminable Contract can be in',
    (from) => {
      expect(service.canTransition(from, UnitStatus.LIQUIDATED)).toBe(true);
    },
  );

  it.each([UnitStatus.CONTRACTED, UnitStatus.UNDER_FITOUT, UnitStatus.OCCUPIED, UnitStatus.VACANT])(
    'LIQUIDATED can resolve to %s — cancel restores the captured prior state, complete moves to VACANT',
    (to) => {
      expect(service.canTransition(UnitStatus.LIQUIDATED, to)).toBe(true);
    },
  );

  it.each([UnitStatus.VACANT, UnitStatus.OFFERING, UnitStatus.BOOKING, UnitStatus.NEGOTIATING, UnitStatus.MERGED])(
    '%s cannot transition directly to LIQUIDATED — there is no live contract to terminate yet',
    (from) => {
      expect(service.canTransition(from, UnitStatus.LIQUIDATED)).toBe(false);
    },
  );

  it('OFFERING behaves like VACANT for pre-commitment transitions (both directions)', () => {
    expect(service.canTransition(UnitStatus.VACANT, UnitStatus.OFFERING)).toBe(true);
    expect(service.canTransition(UnitStatus.OFFERING, UnitStatus.VACANT)).toBe(true);
    expect(service.canTransition(UnitStatus.OFFERING, UnitStatus.BOOKING)).toBe(true);
    expect(service.canTransition(UnitStatus.OFFERING, UnitStatus.NEGOTIATING)).toBe(true);
  });

  it('MERGED remains a terminal state — no outbound transitions at all, including to LIQUIDATED or VACANT', () => {
    expect(service.canTransition(UnitStatus.MERGED, UnitStatus.VACANT)).toBe(false);
    expect(service.canTransition(UnitStatus.MERGED, UnitStatus.LIQUIDATED)).toBe(false);
  });
});

// CR-101 Phase 3E — INV-AUTH-006: the initiating business entity's Mall (when the
// caller supplies one) must match the target Unit's actual Mall before any mutation.
describe('UnitStatusService — INV-AUTH-006 expectedMallId', () => {
  const prisma: any = {
    unit: { findUnique: jest.fn(), update: jest.fn() },
    contract: { findFirst: jest.fn() },
    unitBooking: { findFirst: jest.fn() },
    unitHistory: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new UnitStatusService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.contract.findFirst.mockResolvedValue(null);
    prisma.unitBooking.findFirst.mockResolvedValue(null);
    prisma.unit.update.mockResolvedValue({ id: 'unit-1' });
    prisma.unitHistory.create.mockResolvedValue({ id: 'history-1' });
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it('proceeds when expectedMallId matches the Unit\'s actual mall', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', mallId: 'mall-1', status: UnitStatus.VACANT });
    prisma.unitBooking.findFirst.mockResolvedValue({ id: 'booking-1' });

    await service.transition('unit-1', UnitStatus.BOOKING, { userId: 'user-1', expectedMallId: 'mall-1' });

    expect(prisma.unit.update).toHaveBeenCalled();
  });

  it('denies before any write when expectedMallId does not match the Unit\'s actual mall', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-99', mallId: 'mall-B', status: UnitStatus.VACANT });
    prisma.unitBooking.findFirst.mockResolvedValue({ id: 'booking-1' });

    await expect(
      service.transition('unit-99', UnitStatus.BOOKING, { userId: 'user-1', expectedMallId: 'mall-A' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.unit.update).not.toHaveBeenCalled();
    expect(prisma.unitHistory.create).not.toHaveBeenCalled();
    // No side-effect reads/writes past the initial unit lookup either — the
    // mismatch is caught before any of the other business-rule queries run.
    expect(prisma.contract.findFirst).not.toHaveBeenCalled();
    expect(prisma.unitBooking.findFirst).not.toHaveBeenCalled();
  });

  it('is unaffected when the caller omits expectedMallId (backward compatible)', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', mallId: 'mall-1', status: UnitStatus.VACANT });
    prisma.unitBooking.findFirst.mockResolvedValue({ id: 'booking-1' });

    await service.transition('unit-1', UnitStatus.BOOKING, { userId: 'user-1' });

    expect(prisma.unit.update).toHaveBeenCalled();
  });

  it('still throws NotFoundException for an unknown unit regardless of expectedMallId', async () => {
    prisma.unit.findUnique.mockResolvedValue(null);

    await expect(
      service.transition('missing-unit', UnitStatus.BOOKING, { expectedMallId: 'mall-A' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a retry after a Mall mismatch denial still produces no side effects', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-99', mallId: 'mall-B', status: UnitStatus.VACANT });

    await expect(
      service.transition('unit-99', UnitStatus.BOOKING, { expectedMallId: 'mall-A' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.transition('unit-99', UnitStatus.BOOKING, { expectedMallId: 'mall-A' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.unit.update).not.toHaveBeenCalled();
    expect(prisma.unitHistory.create).not.toHaveBeenCalled();
  });
});
