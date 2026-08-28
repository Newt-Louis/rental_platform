import { UnitStatus } from '@prisma/client';
import { UnitStatusService } from './unit-status.service';

/**
 * Business-lifecycle audit (Unit VACANT → OFFERING → NEGOTIATING → CONTRACTED → FITOUT →
 * OCCUPIED → EXPIRING(derived) → liquidation → VACANT). Every other unit-status spec mocks
 * `transition()`'s Prisma calls per-assertion; this one runs the *real* UnitStatusService
 * against a small stateful fake that actually tracks Unit/Contract/Booking rows across
 * sequential calls, so it proves the whole chain of transitions — including the
 * termination-during-fitout path the transition graph used to reject — is mechanically
 * reachable end-to-end, not just correct pairwise.
 */
class FakeStore {
  unit: {
    id: string;
    mallId: string;
    status: UnitStatus;
    tenantId: string | null;
    leaseStartDate: Date | null;
    leaseEndDate: Date | null;
    vacantSince: Date | null;
  };
  contracts: Array<{ id: string; isActive: boolean; deletedAt: Date | null; status: string }> = [];
  bookings: Array<{ id: string; isActive: boolean; status: string }> = [];
  history: Array<{ oldValue: string; newValue: string }> = [];

  constructor() {
    this.unit = {
      id: 'unit-1',
      mallId: 'mall-1',
      status: UnitStatus.VACANT,
      tenantId: null,
      leaseStartDate: null,
      leaseEndDate: null,
      vacantSince: null,
    };
  }
}

function fakePrisma(store: FakeStore) {
  const hasLiveContract = () =>
    store.contracts.some((c) => c.isActive && !c.deletedAt && !['EXPIRED', 'TERMINATED'].includes(c.status));
  const hasActiveBooking = () => store.bookings.some((b) => b.isActive && ['ACTIVE', 'PENDING'].includes(b.status));

  return {
    unit: {
      findUnique: jest.fn(async () => ({ ...store.unit })),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(store.unit, data);
        return { ...store.unit };
      }),
    },
    contract: {
      findFirst: jest.fn(async () => (hasLiveContract() ? { contractNumber: 'CTR-1', id: 'contract-1' } : null)),
    },
    unitBooking: {
      findFirst: jest.fn(async () => (hasActiveBooking() ? { id: 'booking-1' } : null)),
    },
    unitHistory: {
      create: jest.fn(async ({ data }: any) => {
        store.history.push({ oldValue: data.oldValue, newValue: data.newValue });
        return data;
      }),
    },
    $transaction: jest.fn(async (ops: any) => Promise.all(ops)),
  } as any;
}

describe('UnitStatusService — full lifecycle integration (VACANT..VACANT)', () => {
  it('walks the entire real-world path, including terminate-during-fitout, cancel-restore, and terminate-from-OCCUPIED', async () => {
    const store = new FakeStore();
    const prisma = fakePrisma(store);
    const service = new UnitStatusService(prisma);

    // Trống → Chào thuê: pure marketing flag, no contract/booking involved yet.
    await service.transition('unit-1', UnitStatus.OFFERING);
    expect(store.unit.status).toBe(UnitStatus.OFFERING);

    // Chào thuê → Booking: a Lead puts a hold on it (requires a real active UnitBooking row —
    // this is BookingService.create()'s own invariant, mirrored here).
    store.bookings.push({ id: 'booking-1', isActive: true, status: 'ACTIVE' });
    await service.transition('unit-1', UnitStatus.BOOKING);
    expect(store.unit.status).toBe(UnitStatus.BOOKING);

    // Booking → Thương thảo (NEGOTIATING): serious negotiation, locks out other bookers.
    await service.transition('unit-1', UnitStatus.NEGOTIATING);
    expect(store.unit.status).toBe(UnitStatus.NEGOTIATING);

    // Thương thảo → Ký Hợp đồng (CONTRACTED): requires a live Contract to exist first —
    // ContractsService.create() writes the Contract row (DRAFT) before this transition.
    store.contracts.push({ id: 'contract-1', isActive: true, deletedAt: null, status: 'DRAFT' });
    await service.transition('unit-1', UnitStatus.CONTRACTED, { tenantId: 'tenant-1' });
    expect(store.unit.status).toBe(UnitStatus.CONTRACTED);

    // Contract activates (Contract.status DRAFT → ACTIVE) — independent of Unit.status, per
    // ContractsService.getActivationReadiness requiring Unit === CONTRACTED first.
    store.contracts[0].status = 'ACTIVE';

    // Ký Hợp đồng → Thi Công (UNDER_FITOUT): fit-out begins, contract already live.
    await service.transition('unit-1', UnitStatus.UNDER_FITOUT, {
      leaseStartDate: new Date('2026-01-01'),
      leaseEndDate: new Date('2027-01-01'),
    });
    expect(store.unit.status).toBe(UnitStatus.UNDER_FITOUT);

    // --- Regression coverage for the fixed bug: terminating mid-fitout ---
    // Tenant defaults before ever opening. ContractTerminationService.initiate() moves the
    // Contract to TERMINATING (still "live" — not EXPIRED/TERMINATED) and the Unit straight
    // from UNDER_FITOUT to LIQUIDATED. Before the fix, ALLOWED_TRANSITIONS only permitted
    // OCCUPIED → LIQUIDATED, so this call threw and blocked a real business operation.
    store.contracts[0].status = 'TERMINATING';
    await service.transition('unit-1', UnitStatus.LIQUIDATED);
    expect(store.unit.status).toBe(UnitStatus.LIQUIDATED);

    // Termination is cancelled — restores to the *captured* prior state (UNDER_FITOUT here),
    // per ContractTerminationService.cancel()'s preTerminationUnitStatus, not a hardcoded
    // OCCUPIED which would have wrongly fast-forwarded past an unfinished fit-out.
    store.contracts[0].status = 'ACTIVE';
    await service.transition('unit-1', UnitStatus.UNDER_FITOUT);
    expect(store.unit.status).toBe(UnitStatus.UNDER_FITOUT);

    // Fit-out actually finishes this time: Thi Công → Vận hành (OCCUPIED).
    await service.transition('unit-1', UnitStatus.OCCUPIED, { tenantId: 'tenant-1' });
    expect(store.unit.status).toBe(UnitStatus.OCCUPIED);
    expect(store.unit.tenantId).toBe('tenant-1');

    // EXPIRING is derived (Contract.status / Unit.leaseEndDate), never a persisted UnitStatus —
    // confirm the enum genuinely has no such member share of ALLOWED_TRANSITIONS keys.
    expect(Object.values(UnitStatus)).not.toContain('EXPIRING');

    // Steady-state termination, this time from OCCUPIED: Vận hành → (Thanh lý) LIQUIDATED.
    store.contracts[0].status = 'TERMINATING';
    await service.transition('unit-1', UnitStatus.LIQUIDATED);
    expect(store.unit.status).toBe(UnitStatus.LIQUIDATED);

    // Termination completes: handover checklist done, Contract → TERMINATED, Unit → VACANT.
    store.contracts[0].status = 'TERMINATED';
    store.bookings[0].status = 'CANCELLED'; // no longer an active hold either
    await service.transition('unit-1', UnitStatus.VACANT);
    expect(store.unit.status).toBe(UnitStatus.VACANT);

    // VACANT invariant: no residual commitment left on the Unit row itself.
    expect(store.unit.tenantId).toBeNull();
    expect(store.unit.leaseStartDate).toBeNull();
    expect(store.unit.leaseEndDate).toBeNull();
    expect(store.unit.vacantSince).not.toBeNull();

    // The full, exact hop-by-hop audit trail — every transition left a UnitHistory row.
    expect(store.history.map((h) => `${h.oldValue}->${h.newValue}`)).toEqual([
      'VACANT->OFFERING',
      'OFFERING->BOOKING',
      'BOOKING->NEGOTIATING',
      'NEGOTIATING->CONTRACTED',
      'CONTRACTED->UNDER_FITOUT',
      'UNDER_FITOUT->LIQUIDATED',
      'LIQUIDATED->UNDER_FITOUT',
      'UNDER_FITOUT->OCCUPIED',
      'OCCUPIED->LIQUIDATED',
      'LIQUIDATED->VACANT',
    ]);
  });

  it('never allows VACANT to jump straight to LIQUIDATED, even with a live contract present', async () => {
    const store = new FakeStore();
    // A live contract alone isn't sufficient — this isolates the transition-graph rejection
    // (there is no realistic path for a Contract to be live while the Unit is still VACANT)
    // from the separate "no live contract" guard tested below.
    store.contracts.push({ id: 'contract-1', isActive: true, deletedAt: null, status: 'ACTIVE' });
    const prisma = fakePrisma(store);
    const service = new UnitStatusService(prisma);

    await expect(service.transition('unit-1', UnitStatus.LIQUIDATED)).rejects.toThrow(
      'Invalid unit status transition: VACANT → LIQUIDATED',
    );
    expect(store.unit.status).toBe(UnitStatus.VACANT);
  });

  it('never allows OCCUPIED → LIQUIDATED without an actual live contract backing it', async () => {
    const store = new FakeStore();
    store.unit.status = UnitStatus.OCCUPIED;
    const prisma = fakePrisma(store);
    const service = new UnitStatusService(prisma);

    // No contract in store.contracts at all — simulates data drift / a manual override attempt.
    await expect(service.transition('unit-1', UnitStatus.LIQUIDATED)).rejects.toThrow(
      'Cannot set LIQUIDATED without a live contract',
    );
  });
});
