import { describe, expect, it } from 'vitest';
import { getServiceContractExpiryPresentation } from './serviceContractExpiry';

describe('Service Contract expiry presentation', () => {
  const now = new Date('2026-09-05T01:00:00.000Z');

  it.each([
    ['2026-09-13', 8, 'Còn 8 ngày'],
    ['2026-09-12', 7, 'Còn 7 ngày · Sắp hết hạn'],
    ['2026-09-05', 0, 'Kết thúc hôm nay'],
    ['2026-09-04', -1, 'Đã hết hạn 1 ngày'],
  ] as const)('presents %s consistently', (endDate, daysRemaining, text) => {
    expect(getServiceContractExpiryPresentation(endDate, now)).toMatchObject({ daysRemaining, text });
  });

  it('reports a missing legacy end date instead of guessing', () => {
    expect(getServiceContractExpiryPresentation(null, now)).toMatchObject({
      daysRemaining: null,
      text: 'Chưa có ngày kết thúc',
    });
  });
});
