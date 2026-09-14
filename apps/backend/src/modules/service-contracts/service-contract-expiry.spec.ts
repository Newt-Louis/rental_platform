import {
  classifyServiceContractEndDate,
  getServiceContractDateWindow,
} from './service-contract-expiry';

describe('Service Contract calendar-day expiry policy', () => {
  const now = new Date('2026-09-05T01:00:00.000Z'); // 08:00 in Ho Chi Minh City

  it('uses Ho Chi Minh calendar-day boundaries', () => {
    expect(getServiceContractDateWindow(now)).toEqual({
      today: new Date('2026-09-05T00:00:00.000Z'),
      expiringThrough: new Date('2026-09-12T00:00:00.000Z'),
    });
  });

  it.each([
    ['2026-09-13', 'ACTIVE'],
    ['2026-09-12', 'EXPIRING'],
    ['2026-09-05', 'EXPIRING'],
    ['2026-09-04', 'EXPIRED'],
  ] as const)('classifies end date %s as %s', (endDate, expected) => {
    expect(classifyServiceContractEndDate(new Date(`${endDate}T00:00:00.000Z`), now)).toBe(expected);
  });
});
