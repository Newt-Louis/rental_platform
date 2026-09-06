import { ContractStatus, CurrencyCode } from '@prisma/client';
import {
  CONTRACT_PERIOD_ELIGIBLE_STATUSES,
  contractPeriodCandidateWhere,
  isContractResolutionFailure,
  resolveContractForPeriod,
  type ContractForPeriod,
} from './contract-period-resolver';
import { periodBounds } from './period.util';

/**
 * CONTRACT-PERIOD-01 / REVSHARE-01 — deterministic contract-in-force.
 *
 * Replaces an unordered `findFirst` on (tenant, unit, ACTIVE|EXPIRING) that
 * picked arbitrarily whenever a unit had more than one live contract.
 */

const contract = (over: Partial<ContractForPeriod> = {}): ContractForPeriod => ({
  id: 'c1',
  contractNumber: 'CTR-0001',
  tenantId: 'tenant-1',
  unitId: 'unit-1',
  currencyCode: 'VND' as CurrencyCode,
  rent: 1_000_000,
  status: ContractStatus.ACTIVE,
  startDate: new Date(Date.UTC(2026, 0, 1)),
  endDate: new Date(Date.UTC(2026, 11, 31)),
  ...over,
});

const ctx = { period: '2026-09', tenantId: 'tenant-1', unitId: 'unit-1', turnoverId: 'st-1' };

describe('period boundaries', () => {
  it('spans the whole calendar month in UTC, date-grained', () => {
    const { periodStart, periodEnd } = periodBounds('2026-09');
    expect(periodStart.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('handles February in a leap year', () => {
    expect(periodBounds('2028-02').periodEnd.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('a contract ending on the last day of the month still covers it', () => {
    // Contract dates are stored midnight-UTC, so an end-of-day periodEnd would
    // wrongly exclude this contract. Guards the boundary convention.
    const res = resolveContractForPeriod(
      [contract({ startDate: new Date(Date.UTC(2026, 0, 1)), endDate: new Date(Date.UTC(2026, 8, 30)) })],
      ctx,
    );
    expect(res.ok).toBe(true);
  });
});

describe('T1-T3: date coverage decides applicability', () => {
  it('T1: exactly one contract covering the month is selected', () => {
    const res = resolveContractForPeriod([contract()], ctx);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.contract.contractNumber).toBe('CTR-0001');
  });

  it('T2: a contract ending before the period is not selected', () => {
    const res = resolveContractForPeriod(
      [contract({ endDate: new Date(Date.UTC(2026, 7, 31)) })], // ends 31 Aug
      ctx,
    );
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) expect(res.code).toBe('NO_CONTRACT_FOR_TURNOVER_PERIOD');
  });

  it('T3: a contract starting after the period is not selected', () => {
    const res = resolveContractForPeriod(
      [contract({ startDate: new Date(Date.UTC(2026, 9, 1)) })], // starts 1 Oct
      ctx,
    );
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) expect(res.code).toBe('NO_CONTRACT_FOR_TURNOVER_PERIOD');
  });

  it('a contract starting mid-period does not cover it', () => {
    const res = resolveContractForPeriod(
      [contract({ startDate: new Date(Date.UTC(2026, 8, 2)) })],
      ctx,
    );
    expect(isContractResolutionFailure(res)).toBe(true);
  });
});

describe('T4-T5: ambiguity is never resolved by guessing', () => {
  it('T4: two contracts both covering the full period → AMBIGUOUS, no pick', () => {
    const res = resolveContractForPeriod(
      [contract({ id: 'a', contractNumber: 'CTR-A' }), contract({ id: 'b', contractNumber: 'CTR-B' })],
      ctx,
    );
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) {
      expect(res.code).toBe('AMBIGUOUS_CONTRACT_FOR_TURNOVER_PERIOD');
      expect(res.matchingContractIds).toEqual(['a', 'b']);
      expect(res.matchingContractNumbers).toEqual(['CTR-A', 'CTR-B']);
    }
  });

  it('T5: ACTIVE + EXPIRING both covering → AMBIGUOUS; ACTIVE is NOT preferred', () => {
    // This is the seeded GF-A01 shape: a USD ACTIVE and a VND EXPIRING contract
    // on one unit. Preferring ACTIVE would look reasonable and be wrong — it is
    // still a guess, and it would silently pick a currency.
    const res = resolveContractForPeriod(
      [
        contract({ id: 'usd', contractNumber: 'CTR-USD', status: ContractStatus.ACTIVE, currencyCode: 'USD' as CurrencyCode }),
        contract({ id: 'vnd', contractNumber: 'CTR-VND', status: ContractStatus.EXPIRING, currencyCode: 'VND' as CurrencyCode }),
      ],
      ctx,
    );
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) {
      expect(res.code).toBe('AMBIGUOUS_CONTRACT_FOR_TURNOVER_PERIOD');
      expect(res.currencies).toEqual(['USD', 'VND']);
      expect(res.statuses).toEqual([ContractStatus.ACTIVE, ContractStatus.EXPIRING]);
    }
  });

  it('T12: order of the candidate list never changes the outcome', () => {
    // The regression guard against reintroducing "just pick the first".
    const a = contract({ id: 'a', contractNumber: 'CTR-A', currencyCode: 'USD' as CurrencyCode });
    const b = contract({ id: 'b', contractNumber: 'CTR-B', currencyCode: 'VND' as CurrencyCode });

    const forward = resolveContractForPeriod([a, b], ctx);
    const reverse = resolveContractForPeriod([b, a], ctx);

    // An unordered findFirst would have returned `a` one way and `b` the other.
    expect(forward.ok).toBe(false);
    expect(reverse.ok).toBe(false);
    expect(isContractResolutionFailure(forward) && forward.code).toBe(
      isContractResolutionFailure(reverse) && reverse.code,
    );
  });
});

describe('T6/T10: historical contracts resolve by date, not by status', () => {
  it('T6: an ACTIVE contract covering the period wins over a historical one that does not', () => {
    const res = resolveContractForPeriod(
      [
        contract({ id: 'old', contractNumber: 'CTR-OLD', status: ContractStatus.EXPIRED,
          startDate: new Date(Date.UTC(2023, 0, 1)), endDate: new Date(Date.UTC(2024, 4, 31)) }),
        contract({ id: 'cur', contractNumber: 'CTR-CUR', status: ContractStatus.ACTIVE }),
      ],
      ctx,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.contract.id).toBe('cur');
  });

  it('T10: turnover for a past period resolves to the EXPIRED contract that governed it', () => {
    // The whole point of date-based resolution: billing March 2024 must use the
    // contract that was in force in March 2024, not today's contract.
    const res = resolveContractForPeriod(
      [
        contract({ id: 'usd-old', contractNumber: 'CTR-USD-OLD', currencyCode: 'USD' as CurrencyCode,
          status: ContractStatus.EXPIRED,
          startDate: new Date(Date.UTC(2023, 0, 1)), endDate: new Date(Date.UTC(2024, 5, 30)) }),
        contract({ id: 'vnd-now', contractNumber: 'CTR-VND-NOW', currencyCode: 'VND' as CurrencyCode,
          status: ContractStatus.ACTIVE,
          startDate: new Date(Date.UTC(2024, 6, 1)), endDate: new Date(Date.UTC(2027, 5, 30)) }),
      ],
      { ...ctx, period: '2024-03' },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.contract.id).toBe('usd-old');
      expect(res.contract.currencyCode).toBe('USD');
    }
  });

  it('an MMK historical contract resolves for its own period', () => {
    const res = resolveContractForPeriod(
      [contract({ currencyCode: 'MMK' as CurrencyCode, status: ContractStatus.EXPIRED,
        startDate: new Date(Date.UTC(2025, 0, 1)), endDate: new Date(Date.UTC(2025, 11, 31)) })],
      { ...ctx, period: '2025-06' },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.contract.currencyCode).toBe('MMK');
  });
});

describe('T7: tenant consistency', () => {
  it('rejects a contract belonging to a different tenant on the same unit', () => {
    const res = resolveContractForPeriod(
      [contract({ tenantId: 'other-tenant' })],
      ctx,
    );
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) expect(res.code).toBe('CONTRACT_TENANT_MISMATCH');
  });
});

describe('T8/T9: no contract, and split periods', () => {
  it('T8: no candidates at all', () => {
    const res = resolveContractForPeriod([], ctx);
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) {
      expect(res.code).toBe('NO_CONTRACT_FOR_TURNOVER_PERIOD');
      expect(res.matchingContractIds).toEqual([]);
    }
  });

  it('T9: A ends mid-month and B starts mid-month → no automatic pick or split', () => {
    const res = resolveContractForPeriod(
      [
        contract({ id: 'a', contractNumber: 'CTR-A',
          startDate: new Date(Date.UTC(2026, 0, 1)), endDate: new Date(Date.UTC(2026, 8, 15)) }),
        contract({ id: 'b', contractNumber: 'CTR-B',
          startDate: new Date(Date.UTC(2026, 8, 16)), endDate: new Date(Date.UTC(2027, 8, 15)) }),
      ],
      ctx,
    );
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) {
      expect(res.code).toBe('AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED');
      expect(res.matchingContractIds).toEqual(['a', 'b']);
    }
  });

  it('a single contract covering only part of the period is not silently used', () => {
    const res = resolveContractForPeriod(
      [contract({ endDate: new Date(Date.UTC(2026, 8, 15)) })],
      ctx,
    );
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) expect(res.code).toBe('AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED');
  });
});

describe('eligible-status set', () => {
  it('includes every status a contract can hold while or after being in force', () => {
    // RS-TERMINATED: TERMINATING/TERMINATED were added because a terminated
    // contract still governed its earlier periods. They are safe here only
    // because `effectiveContractEndDate` shortens them by the termination date
    // — see contract-termination-period.spec.ts.
    expect(CONTRACT_PERIOD_ELIGIBLE_STATUSES).toEqual([
      ContractStatus.ACTIVE, ContractStatus.EXPIRING, ContractStatus.EXPIRED,
      ContractStatus.TERMINATING, ContractStatus.TERMINATED,
    ]);
  });

  it('excludes never-executed contracts', () => {
    for (const status of [
      ContractStatus.DRAFT, ContractStatus.PENDING_LEGAL, ContractStatus.PENDING_SIGNATURE,
    ]) {
      expect(CONTRACT_PERIOD_ELIGIBLE_STATUSES).not.toContain(status);
    }
  });

  it('the shared candidate filter carries that set and the soft-delete guards', () => {
    const where = contractPeriodCandidateWhere({ tenantId: 'tenant-1', unitId: 'unit-1' });
    expect(where).toMatchObject({
      unitId: 'unit-1',
      isActive: true,
      deletedAt: null,
      status: { in: CONTRACT_PERIOD_ELIGIBLE_STATUSES },
    });
  });
});
