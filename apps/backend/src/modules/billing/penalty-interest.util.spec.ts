import { calculatePenaltyInterest } from './penalty-interest.util';

describe('penalty-interest.util', () => {
  it('returns zero within grace period', () => {
    const due = new Date('2026-01-01');
    const asOf = new Date('2026-01-05');
    const result = calculatePenaltyInterest({
      principal: 10_000_000,
      dueDate: due,
      asOf,
      policy: { annualRate: 12, graceDays: 7 },
    });
    expect(result.penaltyAmount).toBe(0);
  });

  it('calculates penalty after grace', () => {
    const due = new Date('2026-01-01');
    const asOf = new Date('2026-02-01');
    const result = calculatePenaltyInterest({
      principal: 10_000_000,
      dueDate: due,
      asOf,
      policy: { annualRate: 12, graceDays: 0 },
    });
    expect(result.daysOverdue).toBeGreaterThan(0);
    expect(result.penaltyAmount).toBeGreaterThan(0);
  });
});
