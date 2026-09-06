/**
 * Canonical rent / contract-value primitives.
 *
 * SEM-001: `rentFree` is expressed in **whole months** everywhere in this
 * platform. It is the number of leading billing months in which Base Rent is
 * waived. It is never days. See docs/audit/RENT_FREE_DATA_RISK.md.
 *
 * FIN-CALC-01: every screen, proposal, approval decision, contract conversion,
 * PDF and report derives totalContractValue from `computeContractValue()` in
 * this file. The billing schedule generator derives its per-month Base Rent from
 * `baseRentForMonthIndex()` in this file. Because both sit on the same
 * primitive, proposal valuation and actual billing cannot drift apart.
 */

/**
 * Compound annual escalation, applied on each completed 12-month anniversary.
 * Month 0-11 → base, 12-23 → base × (1+e), 24-35 → base × (1+e)², …
 */
export function applyEscalation(
  baseRent: number,
  escalationPercent: number,
  monthIndex: number,
): number {
  const yearsElapsed = Math.floor(monthIndex / 12);
  if (yearsElapsed <= 0 || escalationPercent <= 0) return baseRent;
  return baseRent * Math.pow(1 + escalationPercent / 100, yearsElapsed);
}

/**
 * THE shared primitive. Base Rent chargeable for a single month of the lease,
 * after rent-free waiver and escalation.
 *
 * `monthIndex` is 0-based from the contract start month.
 * `rentFreeMonths` waives months [0, rentFreeMonths).
 *
 * Callers that prorate a partial month multiply this result by their own
 * day-proportion — proration is a period concern, not a rent concern.
 */
export function baseRentForMonthIndex(
  monthlyBaseRent: number,
  escalationPercent: number,
  monthIndex: number,
  rentFreeMonths: number,
): number {
  if (monthIndex < rentFreeMonths) return 0;
  return applyEscalation(monthlyBaseRent, escalationPercent, monthIndex);
}

export type ContractValueInput = {
  /** Lease duration in whole months. */
  termMonths: number;
  /** Leading months with Base Rent waived. Months, never days. */
  rentFreeMonths: number;
  /** Monthly Base Rent BEFORE discount (area × rentPerSqm). */
  monthlyBaseRent: number;
  /** Monthly CAM / service charge. Not escalated, not waived during rent-free. */
  monthlyCAM: number;
  /** Percentage discount applied to Base Rent before aggregation. */
  discountPercent?: number;
  /** Compound annual escalation on Base Rent. */
  escalationPercent?: number;
};

export type ContractValueResult = {
  /** Base Rent per month after discount, before escalation and rent-free. */
  discountedMonthlyRent: number;
  /** Months actually carrying Base Rent. */
  billableMonths: number;
  /** Sum of escalated, discounted Base Rent across the whole term. */
  baseRentTotal: number;
  /** Sum of CAM across the whole term. */
  camTotal: number;
  /** baseRentTotal + camTotal. */
  totalContractValue: number;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Canonical Total Contract Value.
 *
 * Business definition (confirmed 2026-09-06):
 *   TCV = net Base Rent over billable months + CAM over the full applicable term.
 *   - Discount applies to Base Rent BEFORE aggregation.
 *   - Rent-free removes Base Rent for the rent-free billing periods.
 *   - CAM continues during rent-free periods.
 *   - Refundable deposits are NOT included.
 *   - VAT and usage-based utility / after-hours charges are NOT included.
 *
 * Escalation is summed month by month through `baseRentForMonthIndex`, the same
 * primitive the billing schedule uses, rather than multiplying a flat monthly
 * figure by a month count — a flat multiplication would understate any contract
 * with escalation, and would disagree with the invoices actually issued.
 */
export function computeContractValue(input: ContractValueInput): ContractValueResult {
  const termMonths = Math.max(0, Math.trunc(input.termMonths || 0));
  const rentFreeMonths = Math.max(0, Math.trunc(input.rentFreeMonths || 0));
  const escalationPercent = input.escalationPercent ?? 0;
  const discountPercent = input.discountPercent ?? 0;

  const discountedMonthlyRent = (input.monthlyBaseRent || 0) * (1 - discountPercent / 100);
  const billableMonths = Math.max(termMonths - rentFreeMonths, 0);

  let baseRentTotal = 0;
  for (let monthIndex = 0; monthIndex < termMonths; monthIndex++) {
    baseRentTotal += baseRentForMonthIndex(
      discountedMonthlyRent,
      escalationPercent,
      monthIndex,
      rentFreeMonths,
    );
  }

  const camTotal = (input.monthlyCAM || 0) * termMonths;

  return {
    discountedMonthlyRent: roundMoney(discountedMonthlyRent),
    billableMonths,
    baseRentTotal: roundMoney(baseRentTotal),
    camTotal: roundMoney(camTotal),
    totalContractValue: roundMoney(baseRentTotal + camTotal),
  };
}
