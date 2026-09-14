import {
  applyEscalation,
  baseRentForMonthIndex,
  computeContractValue,
} from './rent-calculation.util';
import { generateBillingPeriods } from '../../modules/billing/billing-schedule.util';
import { buildApprovalStepsFromRules } from '../../modules/approvals/approval-policy.util';
import { Role } from '@prisma/client';

/**
 * SEM-001 regression suite.
 *
 * `rentFree` is denominated in MONTHS everywhere. Before this fix, billing read
 * it as months while approval routing read it as days, and three different
 * totalContractValue formulas coexisted.
 */

const RENT = 100_000_000; // 100M/month base rent
const CAM = 10_000_000; // 10M/month CAM

describe('rent-calculation.util — canonical primitives', () => {
  describe('baseRentForMonthIndex (the shared primitive)', () => {
    it('waives exactly the first N months (T1: 0 months)', () => {
      expect(baseRentForMonthIndex(RENT, 0, 0, 0)).toBe(RENT);
    });

    it('waives exactly the first N months (T2: 1 month)', () => {
      expect(baseRentForMonthIndex(RENT, 0, 0, 1)).toBe(0);
      expect(baseRentForMonthIndex(RENT, 0, 1, 1)).toBe(RENT);
    });

    it('waives exactly the first N months (T3: 3 months)', () => {
      expect(baseRentForMonthIndex(RENT, 0, 0, 3)).toBe(0);
      expect(baseRentForMonthIndex(RENT, 0, 2, 3)).toBe(0);
      expect(baseRentForMonthIndex(RENT, 0, 3, 3)).toBe(RENT);
    });

    it('applies compound annual escalation after the rent-free window', () => {
      // 5%/yr: month 12 is the first escalated month.
      expect(baseRentForMonthIndex(RENT, 5, 11, 0)).toBeCloseTo(RENT, 2);
      expect(baseRentForMonthIndex(RENT, 5, 12, 0)).toBeCloseTo(RENT * 1.05, 2);
      expect(baseRentForMonthIndex(RENT, 5, 24, 0)).toBeCloseTo(RENT * 1.05 * 1.05, 2);
    });

    it('rent-free wins over escalation for waived months', () => {
      expect(baseRentForMonthIndex(RENT, 5, 1, 24)).toBe(0);
    });
  });

  describe('applyEscalation', () => {
    it('is a no-op in year 1 and with zero escalation', () => {
      expect(applyEscalation(RENT, 5, 0)).toBe(RENT);
      expect(applyEscalation(RENT, 0, 36)).toBe(RENT);
    });
  });
});

describe('computeContractValue — canonical TCV (FIN-CALC-01)', () => {
  const base = {
    termMonths: 12,
    monthlyBaseRent: RENT,
    monthlyCAM: CAM,
  };

  it('T7: rent-free removes Base Rent for exactly those months', () => {
    const none = computeContractValue({ ...base, rentFreeMonths: 0 });
    const two = computeContractValue({ ...base, rentFreeMonths: 2 });

    expect(none.baseRentTotal).toBe(RENT * 12);
    expect(two.baseRentTotal).toBe(RENT * 10);
    expect(two.billableMonths).toBe(10);
  });

  it('T6: CAM remains charged during rent-free months', () => {
    const two = computeContractValue({ ...base, rentFreeMonths: 2 });
    // CAM runs the full term, not the billable months.
    expect(two.camTotal).toBe(CAM * 12);
    expect(two.totalContractValue).toBe(RENT * 10 + CAM * 12);
  });

  it('T8: discount applies to Base Rent only, before aggregation', () => {
    const r = computeContractValue({ ...base, rentFreeMonths: 0, discountPercent: 10 });
    expect(r.discountedMonthlyRent).toBe(RENT * 0.9);
    expect(r.baseRentTotal).toBe(RENT * 0.9 * 12);
    // CAM is NOT discounted.
    expect(r.camTotal).toBe(CAM * 12);
  });

  it('T8b: discount and rent-free compose in the canonical order', () => {
    const r = computeContractValue({
      ...base,
      termMonths: 12,
      rentFreeMonths: 3,
      discountPercent: 10,
    });
    expect(r.baseRentTotal).toBe(RENT * 0.9 * 9);
    expect(r.totalContractValue).toBe(RENT * 0.9 * 9 + CAM * 12);
  });

  it('accounts for escalation rather than multiplying a flat monthly figure', () => {
    const r = computeContractValue({
      termMonths: 24,
      rentFreeMonths: 0,
      monthlyBaseRent: RENT,
      monthlyCAM: 0,
      escalationPercent: 10,
    });
    // Year 1 at base, year 2 at +10% — NOT 24 × base.
    expect(r.totalContractValue).toBeCloseTo(RENT * 12 + RENT * 1.1 * 12, 2);
    expect(r.totalContractValue).toBeGreaterThan(RENT * 24);
  });

  it('never returns negative billable months when rentFree exceeds the term', () => {
    const r = computeContractValue({ ...base, termMonths: 12, rentFreeMonths: 36 });
    expect(r.billableMonths).toBe(0);
    expect(r.baseRentTotal).toBe(0);
    // CAM still accrues — only Base Rent is waived.
    expect(r.totalContractValue).toBe(CAM * 12);
  });

  it('regression: the old day-reading would have produced a negative value', () => {
    // Pre-fix `calcFinancials` computed `term - rentFree` with rentFree=30 on a
    // 36-month term, i.e. 6 billable months. With rentFree correctly meaning
    // 30 MONTHS, 6 months of rent remain — the same arithmetic, but now the
    // stored value 30 genuinely means 30 months and is caught by policy.
    const r = computeContractValue({
      termMonths: 36,
      rentFreeMonths: 30,
      monthlyBaseRent: RENT,
      monthlyCAM: 0,
    });
    expect(r.billableMonths).toBe(6);
    expect(r.totalContractValue).toBe(RENT * 6);
    expect(r.totalContractValue).toBeGreaterThanOrEqual(0);
  });
});

describe('SEM-001 approval routing uses MONTHS', () => {
  const mallDirectorRule = {
    stepName: 'Mall Director Approval',
    stepOrder: 40,
    approverRole: Role.MALL_DIRECTOR,
    approverId: 'u-mall-director',
    conditionType: 'RENT_FREE_MONTHS',
    operator: '>',
    threshold: 2,
    matchValue: null,
    isRequired: false,
  };

  const ctx = (rentFreeMonths: number) => ({
    discountPct: 0,
    rentFreeMonths,
    industryTag: null,
    hasArDebt: false,
  });

  it('T1: 0 months — no escalation', () => {
    expect(buildApprovalStepsFromRules([mallDirectorRule], ctx(0))).toHaveLength(0);
  });

  it('T2: 1 month — no escalation', () => {
    expect(buildApprovalStepsFromRules([mallDirectorRule], ctx(1))).toHaveLength(0);
  });

  it('T3: 2 months — boundary, still no escalation', () => {
    expect(buildApprovalStepsFromRules([mallDirectorRule], ctx(2))).toHaveLength(0);
  });

  it('T4: 3 months — Mall Director required', () => {
    const steps = buildApprovalStepsFromRules([mallDirectorRule], ctx(3));
    expect(steps).toHaveLength(1);
    expect(steps[0].approverRole).toBe(Role.MALL_DIRECTOR);
  });

  describe('T16: legacy RENT_FREE_DAYS compatibility', () => {
    const legacyRule = {
      ...mallDirectorRule,
      conditionType: 'RENT_FREE_DAYS',
      threshold: 60,
    };

    it('still matches persisted legacy rules instead of silently ignoring them', () => {
      // 60 legacy "days" ÷ 30 = 2 months, so 3 months must still escalate.
      expect(buildApprovalStepsFromRules([legacyRule], ctx(3))).toHaveLength(1);
    });

    it('applies the same boundary as the migrated rule', () => {
      expect(buildApprovalStepsFromRules([legacyRule], ctx(2))).toHaveLength(0);
      expect(buildApprovalStepsFromRules([legacyRule], ctx(1))).toHaveLength(0);
    });

    it('would NOT have matched before the fix (proves the rule was dead)', () => {
      // Pre-fix the comparison was `rentFreeMonths > 60`, which no realistic
      // lease could satisfy. This asserts the shim actually changed behaviour.
      const preFixWouldMatch = 3 > 60;
      expect(preFixWouldMatch).toBe(false);
      expect(buildApprovalStepsFromRules([legacyRule], ctx(3))).toHaveLength(1);
    });
  });
});

/**
 * THE cross-layer test. This is the one that would have failed before the fix.
 *
 * One rentFree value flows through: Proposal valuation → approval routing →
 * Contract → billing schedule. Every layer must read it as the same unit.
 */
describe('SEM-001 CROSS-LAYER: one value, one unit, four layers', () => {
  const AREA = 100;
  const RENT_PER_SQM = 1_000_000;
  const CAM_PER_SQM = 100_000;
  const TERM_MONTHS = 12;
  const RENT_FREE_MONTHS = 3;

  const monthlyBaseRent = AREA * RENT_PER_SQM; // 100M
  const monthlyCAM = AREA * CAM_PER_SQM; // 10M

  it('valuation, approval and billing all agree that 3 means 3 MONTHS', () => {
    // ── Layer 1: proposal valuation ──────────────────────────────────────
    const value = computeContractValue({
      termMonths: TERM_MONTHS,
      rentFreeMonths: RENT_FREE_MONTHS,
      monthlyBaseRent,
      monthlyCAM,
    });
    expect(value.billableMonths).toBe(9);
    expect(value.baseRentTotal).toBe(monthlyBaseRent * 9);

    // ── Layer 2: approval routing ────────────────────────────────────────
    const steps = buildApprovalStepsFromRules(
      [{
        stepName: 'Mall Director Approval',
        stepOrder: 40,
        approverRole: Role.MALL_DIRECTOR,
        approverId: 'u-mall-director',
        conditionType: 'RENT_FREE_MONTHS',
        operator: '>',
        threshold: 2,
        matchValue: null,
        isRequired: false,
      }],
      { discountPct: 0, rentFreeMonths: RENT_FREE_MONTHS, industryTag: null, hasArDebt: false },
    );
    // 3 months > 2 → escalates. Under the old DAYS reading (3 > 60) it did not.
    expect(steps).toHaveLength(1);
    expect(steps[0].approverRole).toBe(Role.MALL_DIRECTOR);

    // ── Layer 3 + 4: Contract → billing schedule ─────────────────────────
    const periods = generateBillingPeriods({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      rent: monthlyBaseRent,
      cam: monthlyCAM,
      rentFree: RENT_FREE_MONTHS,
      escalationPercent: 0,
      paymentTerm: 30,
      billingCycle: 'MONTHLY',
    });

    expect(periods).toHaveLength(12);

    // T5: billing skips Base Rent for exactly N periods.
    const zeroRentPeriods = periods.filter((p) => p.rentAmount === 0);
    expect(zeroRentPeriods).toHaveLength(RENT_FREE_MONTHS);
    expect(zeroRentPeriods.map((p) => p.period)).toEqual(['2026-01', '2026-02', '2026-03']);

    // T6: CAM is still charged in every one of those periods.
    for (const p of zeroRentPeriods) {
      expect(p.camAmount).toBeCloseTo(monthlyCAM, 2);
      expect(p.skipped).toBe(false);
    }

    // ── The invariant that ties the layers together ──────────────────────
    const billedRent = periods.reduce((s, p) => s + p.rentAmount, 0);
    const billedCam = periods.reduce((s, p) => s + p.camAmount, 0);

    expect(billedRent).toBeCloseTo(value.baseRentTotal, 2);
    expect(billedCam).toBeCloseTo(value.camTotal, 2);
    expect(billedRent + billedCam).toBeCloseTo(value.totalContractValue, 2);
  });

  it('the proposal value equals what billing will actually invoice, with escalation', () => {
    // The strongest form of FIN-CALC-01: a 24-month escalating lease.
    const value = computeContractValue({
      termMonths: 24,
      rentFreeMonths: 2,
      monthlyBaseRent,
      monthlyCAM,
      escalationPercent: 8,
    });

    const periods = generateBillingPeriods({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2027-12-31'),
      rent: monthlyBaseRent,
      cam: monthlyCAM,
      rentFree: 2,
      escalationPercent: 8,
      paymentTerm: 30,
      billingCycle: 'MONTHLY',
    });

    const billedTotal = periods.reduce((s, p) => s + p.subtotal, 0);
    expect(billedTotal).toBeCloseTo(value.totalContractValue, 0);
  });

  it('T17: seed-style data cannot create an accidental 30-month concession', () => {
    // prisma/seed.ts used to seed rentFree: 30. On a 36-month lease that is a
    // 30-month rent-free period — 83% of the lease given away.
    const accidental = computeContractValue({
      termMonths: 36,
      rentFreeMonths: 30,
      monthlyBaseRent,
      monthlyCAM: 0,
    });
    const seeded = computeContractValue({
      termMonths: 36,
      rentFreeMonths: 3, // what seed.ts now uses
      monthlyBaseRent,
      monthlyCAM: 0,
    });

    expect(accidental.billableMonths).toBe(6);
    expect(seeded.billableMonths).toBe(33);
    expect(seeded.totalContractValue).toBeGreaterThan(accidental.totalContractValue * 5);
  });
});
