import { calculateDealScore } from './deal-scoring.util';

const criteria = [
  { code: 'RATING', name: 'Rating', fieldSource: 'CUSTOMER_RATING', weight: 1, minScore: 0, maxScore: 100 },
  { code: 'DISCOUNT', name: 'Discount risk', fieldSource: 'DISCOUNT_RISK', weight: 1, minScore: 0, maxScore: 100 },
];

describe('deal-scoring.util', () => {
  it('calculates weighted score and grade', () => {
    const result = calculateDealScore(criteria, {
      customerRating: 5,
      discountPct: 5,
      rentFreeDays: 30,
    });
    expect(result.totalScore).toBeGreaterThan(0);
    expect(['A', 'B', 'C', 'D']).toContain(result.grade);
    expect(result.breakdown).toHaveLength(2);
  });

  it('penalizes high discount', () => {
    const low = calculateDealScore(criteria, { discountPct: 5, rentFreeDays: 0 });
    const high = calculateDealScore(criteria, { discountPct: 20, rentFreeDays: 90 });
    expect(high.totalScore).toBeLessThan(low.totalScore);
  });
});
