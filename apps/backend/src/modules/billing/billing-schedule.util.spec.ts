import {
  generateBillingPeriods,
  generateMonthlyBillingPeriods,
  periodsDueForInvoicing,
} from './billing-schedule.util';

describe('billing-schedule.util', () => {
  it('generates monthly periods with rent-free months zeroed', () => {
    const entries = generateMonthlyBillingPeriods({
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-03-31'),
      rent: 100000000,
      cam: 10000000,
      rentFree: 1,
      escalationPercent: 0,
      paymentTerm: 15,
      billingCycle: 'MONTHLY',
    });

    expect(entries.length).toBeGreaterThanOrEqual(2);
    const jan = entries.find((e) => e.period === '2026-01');
    const feb = entries.find((e) => e.period === '2026-02');
    expect(jan?.rentAmount).toBe(0);
    expect(feb?.rentAmount).toBe(100000000);
    expect(feb?.subtotal).toBe(110000000);
  });

  it('applies escalation after 12 months', () => {
    const entries = generateMonthlyBillingPeriods({
      startDate: new Date('2025-01-01'),
      endDate: new Date('2026-01-31'),
      rent: 100,
      cam: 0,
      rentFree: 0,
      escalationPercent: 10,
      paymentTerm: 0,
      billingCycle: 'MONTHLY',
    });

    const month13 = entries.find((e) => e.period === '2026-01');
    expect(month13?.rentAmount).toBeCloseTo(110, 0);
  });

  it('filters periods due for invoicing', () => {
    const entries = generateMonthlyBillingPeriods({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-30'),
      rent: 50,
      cam: 10,
      rentFree: 0,
      escalationPercent: 0,
      paymentTerm: 0,
      billingCycle: 'MONTHLY',
    });

    const due = periodsDueForInvoicing(entries, new Date('2026-03-15'));
    expect(due.every((d) => d.periodStart <= new Date('2026-03-15'))).toBe(true);
    expect(due.some((d) => d.period === '2026-04')).toBe(false);
  });

  it('generates quarterly periods', () => {
    const entries = generateBillingPeriods({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      rent: 100,
      cam: 10,
      rentFree: 0,
      escalationPercent: 0,
      paymentTerm: 0,
      billingCycle: 'QUARTERLY',
    });
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(entries[0].rentAmount).toBe(300);
  });
});
