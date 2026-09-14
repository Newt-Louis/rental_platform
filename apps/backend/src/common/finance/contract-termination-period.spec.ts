import { ContractStatus, CurrencyCode } from '@prisma/client';
import {
  CONTRACT_PERIOD_ELIGIBLE_STATUSES,
  effectiveContractEndDate,
  isContractResolutionFailure,
  resolveContractForPeriod,
  type ContractForPeriod,
} from './contract-period-resolver';

/**
 * RS-TERMINATED — a terminated Contract still governed its earlier periods.
 *
 * CONTRACT-PERIOD-02: applicability is decided by the effective date range,
 * including an effective early termination — not by current `Contract.status`.
 *
 * Termination lifecycle as implemented (`ContractTerminationService`):
 *   INITIATED | IN_PROGRESS | COMPLETED | CANCELLED
 * There is no approval, withdrawal or rejection state in this platform.
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
const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

describe('effectiveContractEndDate', () => {
  const endDate = D(2026, 11, 31);

  it('T7: a COMPLETED termination shortens the contract', () => {
    expect(effectiveContractEndDate(endDate, { status: 'COMPLETED', effectiveDate: D(2026, 8, 15) }))
      .toEqual(D(2026, 8, 15));
  });

  it('T5: a CANCELLED termination does NOT shorten it', () => {
    expect(effectiveContractEndDate(endDate, { status: 'CANCELLED', effectiveDate: D(2026, 8, 15) }))
      .toEqual(endDate);
  });

  it('a pending termination shortens provisionally — the fail-closed choice', () => {
    for (const status of ['INITIATED', 'IN_PROGRESS']) {
      expect(effectiveContractEndDate(endDate, { status, effectiveDate: D(2026, 8, 15) }))
        .toEqual(D(2026, 8, 15));
    }
  });

  it('never EXTENDS a contract past its own endDate', () => {
    expect(effectiveContractEndDate(endDate, { status: 'COMPLETED', effectiveDate: D(2027, 5, 1) }))
      .toEqual(endDate);
  });

  it('no termination leaves the endDate untouched', () => {
    expect(effectiveContractEndDate(endDate, null)).toEqual(endDate);
    expect(effectiveContractEndDate(endDate, undefined)).toEqual(endDate);
  });

  it('T6: an unrecognised status shortens nothing', () => {
    // No withdrawn/rejected/approved states exist here; if one is ever added it
    // must be classified explicitly rather than silently shortening a contract.
    for (const status of ['WITHDRAWN', 'REJECTED', 'APPROVED', '']) {
      expect(effectiveContractEndDate(endDate, { status, effectiveDate: D(2026, 0, 1) }))
        .toEqual(endDate);
    }
  });
});

describe('RS-TERMINATED — resolution across a termination', () => {
  const terminated = (effectiveDate: Date, status = 'COMPLETED') =>
    contract({
      status: ContractStatus.TERMINATED,
      termination: { status, effectiveDate },
    });

  it('T1: a contract TERMINATED today still governs a month before the termination', () => {
    const res = resolveContractForPeriod([terminated(D(2026, 8, 15))], { ...ctx, period: '2026-08' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.contract.status).toBe(ContractStatus.TERMINATED);
  });

  it('T2: a termination effective after the period end resolves normally', () => {
    const res = resolveContractForPeriod([terminated(D(2026, 10, 30))], ctx);
    expect(res.ok).toBe(true);
  });

  it('T3: a termination effective before the period start yields no contract', () => {
    const res = resolveContractForPeriod([terminated(D(2026, 7, 31))], ctx);
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) expect(res.code).toBe('NO_CONTRACT_FOR_TURNOVER_PERIOD');
  });

  it('T4/T12: a termination mid-month is PARTIAL and is never split automatically', () => {
    const res = resolveContractForPeriod([terminated(D(2026, 8, 15))], ctx);
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) {
      expect(res.code).toBe('AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED');
      // No 15/30 allocation is introduced anywhere.
      expect(res).not.toHaveProperty('allocatedAmount');
      expect(res).not.toHaveProperty('proration');
      expect(res).not.toHaveProperty('coveredDays');
    }
  });

  it('T5: a CANCELLED termination leaves the full period covered', () => {
    const res = resolveContractForPeriod([terminated(D(2026, 8, 15), 'CANCELLED')], ctx);
    expect(res.ok).toBe(true);
  });

  it('a pending termination mid-month is still PARTIAL, not billed', () => {
    const res = resolveContractForPeriod(
      [contract({
        status: ContractStatus.TERMINATING,
        termination: { status: 'INITIATED', effectiveDate: D(2026, 8, 15) },
      })],
      ctx,
    );
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) expect(res.code).toBe('AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED');
  });

  it('a pending termination still lets an earlier, fully-covered month resolve', () => {
    const res = resolveContractForPeriod(
      [contract({
        status: ContractStatus.TERMINATING,
        termination: { status: 'IN_PROGRESS', effectiveDate: D(2026, 8, 15) },
      })],
      { ...ctx, period: '2026-07' },
    );
    expect(res.ok).toBe(true);
  });

  it('T9: current status never overrides the effective dates', () => {
    // Same effective range, opposite current statuses — identical outcome.
    const asTerminated = resolveContractForPeriod([terminated(D(2026, 10, 30))], { ...ctx, period: '2026-08' });
    const asActive = resolveContractForPeriod([contract({ status: ContractStatus.ACTIVE })], { ...ctx, period: '2026-08' });
    expect(asTerminated.ok).toBe(true);
    expect(asActive.ok).toBe(true);
  });

  it('T8: an ordinary EXPIRED contract still resolves its historical month', () => {
    const res = resolveContractForPeriod([contract({ status: ContractStatus.EXPIRED })], { ...ctx, period: '2026-05' });
    expect(res.ok).toBe(true);
  });

  it('a termination on the last day of the month still covers that month', () => {
    // Date-grained boundary: periodEnd is the last day at 00:00 UTC.
    const res = resolveContractForPeriod([terminated(D(2026, 8, 30))], ctx);
    expect(res.ok).toBe(true);
  });

  it('diagnostics report the DERIVED end date alongside the raw one', () => {
    const res = resolveContractForPeriod([terminated(D(2026, 8, 15))], ctx);
    expect(isContractResolutionFailure(res)).toBe(true);
    if (isContractResolutionFailure(res)) {
      expect(res.endDates[0]).toEqual(D(2026, 11, 31));
      expect(res.effectiveEndDates[0]).toEqual(D(2026, 8, 15));
      expect(res.terminationStatuses[0]).toBe('COMPLETED');
      expect(res.terminationEffectiveDates[0]).toEqual(D(2026, 8, 15));
    }
  });

  it('two contracts, one terminated early, disambiguate instead of colliding', () => {
    // The old contract ended (by termination) in June; the new one starts July.
    // September belongs unambiguously to the new one.
    const res = resolveContractForPeriod(
      [
        contract({ id: 'old', contractNumber: 'CTR-OLD', status: ContractStatus.TERMINATED,
          termination: { status: 'COMPLETED', effectiveDate: D(2026, 5, 30) } }),
        contract({ id: 'new', contractNumber: 'CTR-NEW', startDate: D(2026, 6, 1) }),
      ],
      ctx,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.contract.id).toBe('new');
  });

  it('the eligible set admits terminated contracts but still not draft ones', () => {
    expect(CONTRACT_PERIOD_ELIGIBLE_STATUSES).toContain(ContractStatus.TERMINATED);
    expect(CONTRACT_PERIOD_ELIGIBLE_STATUSES).toContain(ContractStatus.TERMINATING);
    for (const status of [
      ContractStatus.DRAFT, ContractStatus.PENDING_LEGAL, ContractStatus.PENDING_SIGNATURE,
    ]) {
      expect(CONTRACT_PERIOD_ELIGIBLE_STATUSES).not.toContain(status);
    }
  });
});
