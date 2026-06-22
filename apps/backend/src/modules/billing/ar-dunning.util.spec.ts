import { daysOverdue, matchDunningPolicy, policiesToApply } from './ar-dunning.util';

describe('ar-dunning.util', () => {
  const policies = [
    { id: 'p1', code: 'L1', level: 1, minDaysOverdue: 1, maxDaysOverdue: 7, isActive: true },
    { id: 'p2', code: 'L2', level: 2, minDaysOverdue: 8, maxDaysOverdue: 30, isActive: true },
    { id: 'p3', code: 'L3', level: 3, minDaysOverdue: 31, maxDaysOverdue: null, isActive: true },
  ];

  it('calculates days overdue', () => {
    const due = new Date('2026-06-01');
    const asOf = new Date('2026-06-10');
    expect(daysOverdue(due, asOf)).toBe(9);
  });

  it('matches policy by overdue window', () => {
    expect(matchDunningPolicy(policies, 5)?.code).toBe('L1');
    expect(matchDunningPolicy(policies, 15)?.code).toBe('L2');
    expect(matchDunningPolicy(policies, 45)?.code).toBe('L3');
  });

  it('returns policies not yet sent', () => {
    const sent = new Set(['p1']);
    const next = policiesToApply(policies, 10, sent);
    expect(next.map((p) => p.code)).toEqual(['L2']);
  });
});
