import { ContractStatus, CurrencyCode, Prisma } from '@prisma/client';
import { periodBounds } from './period.util';

/**
 * CONTRACT-PERIOD-01 / REVSHARE-01 — deterministic "contract in force for a
 * period".
 *
 * The defect this replaces: revenue-share resolved its Contract with an
 * unordered `findFirst` on (tenantId, unitId, status IN (ACTIVE, EXPIRING)).
 * When a Unit had more than one live Contract — which the seed produced, and
 * which `ContractsService.create()` blocks but direct writes bypass — the
 * chosen Contract, and therefore the rent subtracted and the currency stamped
 * on the invoice, was non-deterministic.
 *
 * The rule (confirmed 2026-09-06): the applicable Contract is the one whose
 * effective dates cover the ENTIRE turnover period. Dates decide applicability;
 * status only decides membership of the eligible set. Nothing is ordered, and
 * nothing is picked when more than one matches.
 */

/**
 * Statuses of a Contract that actually ran, or is running, its course.
 *
 * EXPIRED is included deliberately: a turnover row for a past period must still
 * resolve to the Contract that governed that period, even though that Contract
 * has since ended.
 *
 * TERMINATING and TERMINATED are also included, but ONLY because
 * `effectiveContractEndDate` shortens them by the termination date. Early
 * termination stores the real end on `ContractTermination.effectiveDate` and
 * never writes it back to `Contract.endDate`, so the raw `endDate` over-claims
 * coverage. Do not add these statuses anywhere that reads `endDate` directly.
 *
 * DRAFT, PENDING_LEGAL and PENDING_SIGNATURE stay excluded: those contracts
 * were never executed and governed nothing.
 */
export const CONTRACT_PERIOD_ELIGIBLE_STATUSES: ContractStatus[] = [
  ContractStatus.ACTIVE,
  ContractStatus.EXPIRING,
  ContractStatus.EXPIRED,
  // RS-TERMINATED — a terminated contract is excluded from *current* operations
  // but is still the contract that legally governed its earlier periods. It is
  // eligible here, and its effective end date is shortened by the termination
  // (see `effectiveContractEndDate`) so it cannot claim periods after it ended.
  ContractStatus.TERMINATING,
  ContractStatus.TERMINATED,
];

/**
 * CONTRACT-PERIOD-02 — status vs. dates.
 *
 * `Contract.status` is CURRENT-STATE truth, not historical truth. A contract
 * that is TERMINATED today still governed August if it terminated in September.
 * Applicability is therefore decided by the effective date range; status only
 * decides whether the lifecycle data used to derive that range is trustworthy.
 * Never read `status` as "was this contract in force during period P".
 */

/**
 * ContractTermination lifecycle, as actually implemented in
 * `ContractTerminationService` (schema: a free-text `status` column, values
 * INITIATED | IN_PROGRESS | COMPLETED | CANCELLED — there is no approval,
 * withdrawal or rejection state in this platform).
 *
 * COMPLETED   `complete()` — gated on the handover checklist; moves the Contract
 *             to TERMINATED and the Unit to VACANT. A definitively effective
 *             termination.
 * CANCELLED   `cancel()` — restores the Contract and Unit status. Must NOT
 *             shorten the contract; the original endDate applies again.
 * INITIATED / IN_PROGRESS
 *             pending. `effectiveDate` is a planned date that may still be
 *             cancelled. Treated as a PROVISIONAL end — see below.
 */
export const TERMINATION_EFFECTIVE_STATUSES = ['COMPLETED'] as const;
export const TERMINATION_PENDING_STATUSES = ['INITIATED', 'IN_PROGRESS'] as const;
export const TERMINATION_VOID_STATUSES = ['CANCELLED'] as const;

export type TerminationForPeriod = {
  status: string;
  effectiveDate: Date;
} | null | undefined;

/**
 * The contract's real end date for applicability purposes.
 *
 * - COMPLETED termination → `min(endDate, effectiveDate)`. Definitive.
 * - INITIATED / IN_PROGRESS → also `min(...)`, deliberately. A pending
 *   termination might complete or might be cancelled; using its date as a
 *   provisional end is the fail-closed choice in both outcomes. A period that
 *   ends on or before the provisional date belongs to the contract either way
 *   (cancelling only ever extends coverage), while a period beyond it is
 *   genuinely undecidable and must not be billed.
 * - CANCELLED or no termination → the contract's own `endDate`.
 *
 * `effectiveDate` is written once at `initiate()` and is not editable
 * afterwards, so it is stable input.
 */
export function effectiveContractEndDate(
  endDate: Date,
  termination: TerminationForPeriod,
): Date {
  if (!termination) return endDate;
  if ((TERMINATION_VOID_STATUSES as readonly string[]).includes(termination.status)) {
    return endDate;
  }
  const shortens =
    (TERMINATION_EFFECTIVE_STATUSES as readonly string[]).includes(termination.status) ||
    (TERMINATION_PENDING_STATUSES as readonly string[]).includes(termination.status);
  if (!shortens) return endDate;
  return termination.effectiveDate < endDate ? termination.effectiveDate : endDate;
}

/** The shape the resolver needs. Keep the `select` in callers aligned with this. */
export type ContractForPeriod = {
  id: string;
  contractNumber: string;
  tenantId: string;
  unitId: string;
  currencyCode: CurrencyCode;
  rent: number;
  status: ContractStatus;
  startDate: Date;
  endDate: Date;
  /** Contract.termination back-relation. Absent/null when never terminated. */
  termination?: TerminationForPeriod;
};

export type ContractResolutionFailureCode =
  | 'NO_CONTRACT_FOR_TURNOVER_PERIOD'
  | 'AMBIGUOUS_CONTRACT_FOR_TURNOVER_PERIOD'
  | 'AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED'
  | 'CONTRACT_TENANT_MISMATCH';

export type ContractResolutionFailure = {
  ok: false;
  code: ContractResolutionFailureCode;
  message: string;
  period: string;
  unitId: string;
  tenantId: string;
  turnoverId?: string;
  matchingContractIds: string[];
  matchingContractNumbers: string[];
  currencies: CurrencyCode[];
  statuses: ContractStatus[];
  startDates: Date[];
  endDates: Date[];
  /** endDate after applying an effective/pending termination (CONTRACT-PERIOD-02). */
  effectiveEndDates: Date[];
  terminationStatuses: (string | null)[];
  terminationEffectiveDates: (Date | null)[];
};

/**
 * Generic over the candidate shape so a caller that selects extra columns
 * (revenue-share needs `proposalId`) gets them back on the resolved contract
 * without widening the shared select.
 */
export type ContractResolution<T extends ContractForPeriod = ContractForPeriod> =
  | { ok: true; contract: T }
  | ContractResolutionFailure;

/**
 * TypeScript does not reliably discriminate a union behind a generic type
 * alias, so callers narrow through this guard rather than `if (!r.ok)`.
 */
export function isContractResolutionFailure(
  resolution: ContractResolution<ContractForPeriod>,
): resolution is ContractResolutionFailure {
  return resolution.ok === false;
}

/**
 * The single `where` every caller must use when fetching candidates, so Sales
 * submission validation and Billing calculation cannot look at different sets.
 * Note it does NOT filter by date — coverage is decided in the resolver, which
 * needs to see partial overlaps in order to report them distinctly.
 */
export function contractPeriodCandidateWhere(params: {
  tenantId: string;
  unitId: string;
}): Prisma.ContractWhereInput {
  return {
    unitId: params.unitId,
    isActive: true,
    deletedAt: null,
    status: { in: CONTRACT_PERIOD_ELIGIBLE_STATUSES },
  };
}

/** Fields a caller's `select` must include for the resolver to work. */
export const CONTRACT_PERIOD_SELECT = {
  id: true,
  contractNumber: true,
  tenantId: true,
  unitId: true,
  currencyCode: true,
  rent: true,
  status: true,
  startDate: true,
  endDate: true,
  // RS-TERMINATED — needed to derive the effective end date. Must be selected
  // through the Contract relation so the termination always belongs to the
  // contract being resolved; never look it up by unit.
  termination: { select: { status: true, effectiveDate: true } },
} as const;

const describe = (contracts: ContractForPeriod[]): Pick<
  ContractResolutionFailure,
  'matchingContractIds' | 'matchingContractNumbers' | 'currencies' | 'statuses' | 'startDates'
  | 'endDates' | 'effectiveEndDates' | 'terminationStatuses' | 'terminationEffectiveDates'
> => ({
  matchingContractIds: contracts.map((c) => c.id),
  matchingContractNumbers: contracts.map((c) => c.contractNumber),
  currencies: contracts.map((c) => c.currencyCode),
  statuses: contracts.map((c) => c.status),
  startDates: contracts.map((c) => c.startDate),
  endDates: contracts.map((c) => c.endDate),
  effectiveEndDates: contracts.map((c) => effectiveContractEndDate(c.endDate, c.termination)),
  terminationStatuses: contracts.map((c) => c.termination?.status ?? null),
  terminationEffectiveDates: contracts.map((c) => c.termination?.effectiveDate ?? null),
});

/**
 * Resolve exactly one Contract for a turnover/billing period, or fail closed.
 *
 * @param candidates contracts fetched with `contractPeriodCandidateWhere`
 * @param context    the turnover row being resolved for
 */
export function resolveContractForPeriod<T extends ContractForPeriod>(
  candidates: T[],
  context: { period: string; tenantId: string; unitId: string; turnoverId?: string },
): ContractResolution<T> {
  const { periodStart, periodEnd } = periodBounds(context.period);
  const base = {
    period: context.period,
    unitId: context.unitId,
    tenantId: context.tenantId,
    turnoverId: context.turnoverId,
  };

  // Full coverage against the EFFECTIVE end date, so an early termination
  // correctly removes the periods after it without removing the earlier ones.
  const effectiveEnd = (c: T) => effectiveContractEndDate(c.endDate, c.termination);
  const covering = candidates.filter(
    (c) => c.startDate <= periodStart && effectiveEnd(c) >= periodEnd,
  );

  if (covering.length === 1) {
    const contract = covering[0];
    // Tenant consistency — turnover and contract must describe the same
    // commercial relationship. Resolving on unit alone would let a previous
    // tenant's contract bill the current tenant's turnover.
    if (contract.tenantId !== context.tenantId) {
      return {
        ok: false,
        code: 'CONTRACT_TENANT_MISMATCH',
        message:
          `Hợp đồng ${contract.contractNumber} thuộc khách thuê khác với báo cáo ` +
          `doanh thu kỳ ${context.period}.`,
        ...base,
        ...describe(covering),
      };
    }
    return { ok: true, contract };
  }

  if (covering.length > 1) {
    // Never pick one. Not by status, not by date, not by id.
    return {
      ok: false,
      code: 'AMBIGUOUS_CONTRACT_FOR_TURNOVER_PERIOD',
      message:
        `Có ${covering.length} hợp đồng cùng bao phủ kỳ ${context.period} cho mặt bằng này ` +
        `(${covering.map((c) => `${c.contractNumber}/${c.currencyCode}/${c.status}`).join(', ')}). ` +
        'Không thể xác định hợp đồng áp dụng.',
      ...base,
      ...describe(covering),
    };
  }

  // Nothing covers the whole period. Distinguish "no contract at all" from
  // "contracts exist but each covers only part of the period" — the second
  // needs a business rule for splitting turnover, which does not exist yet.
  const overlapping = candidates.filter(
    (c) => c.startDate <= periodEnd && effectiveEnd(c) >= periodStart,
  );

  if (overlapping.length > 0) {
    return {
      ok: false,
      code: 'AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED',
      message:
        `Kỳ ${context.period} bị chia giữa ${overlapping.length} hợp đồng ` +
        `(${overlapping.map((c) => c.contractNumber).join(', ')}); ` +
        'không hợp đồng nào bao phủ trọn kỳ. Hệ thống chưa hỗ trợ tách doanh thu theo ngày.',
      ...base,
      ...describe(overlapping),
    };
  }

  return {
    ok: false,
    code: 'NO_CONTRACT_FOR_TURNOVER_PERIOD',
    message: `Không có hợp đồng nào áp dụng cho kỳ ${context.period} của mặt bằng này.`,
    ...base,
    ...describe([]),
  };
}
