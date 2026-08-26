import {
  computeAfterHoursCoolingCharge,
  computeManagementFeeSurcharge,
  computeUtilityCharge,
  currentPeriod,
  periodBounds,
} from './billing-addin.util';

describe('billing-addin.util', () => {
  describe('computeManagementFeeSurcharge', () => {
    const rates = { normAreaPerPerson: 8, surchargePerPerson: 150000 };

    it('charges only the headcount over the norm', () => {
      // 420 m2 / 8 m2 per person = 52 max headcount; 61 registered -> 9 over
      const result = computeManagementFeeSurcharge({ headcount: 61 }, rates, 420, '2026-08');
      expect(result.subtotal).toBe(9 * 150000);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].qty).toBe(9);
      expect(result.lines[0].unitPrice).toBe(150000);
    });

    it('produces no line when headcount is within the norm', () => {
      const result = computeManagementFeeSurcharge({ headcount: 40 }, rates, 420, '2026-08');
      expect(result.subtotal).toBe(0);
      expect(result.lines).toHaveLength(0);
    });

    it('never goes negative when headcount is 0', () => {
      const result = computeManagementFeeSurcharge({ headcount: 0 }, rates, 420, '2026-08');
      expect(result.subtotal).toBe(0);
    });
  });

  describe('computeUtilityCharge', () => {
    const rates = { electricityUnitPrice: 3500, waterUnitPrice: 18000 };

    it('bills electricity and water consumption separately', () => {
      const result = computeUtilityCharge(
        { elecStart: 18240, elecEnd: 19015, waterStart: 210, waterEnd: 225 },
        rates,
        '2026-08',
      );
      expect(result.lines).toHaveLength(2);
      const elec = result.lines.find((l) => l.type === 'ELECTRICITY')!;
      const water = result.lines.find((l) => l.type === 'WATER')!;
      expect(elec.qty).toBe(775);
      expect(elec.amount).toBe(775 * 3500);
      expect(water.qty).toBe(15);
      expect(water.amount).toBe(15 * 18000);
      expect(result.subtotal).toBe(elec.amount + water.amount);
    });

    it('omits a line when its consumption is zero and clamps negative readings to zero', () => {
      const result = computeUtilityCharge(
        { elecStart: 100, elecEnd: 90, waterStart: 50, waterEnd: 65 },
        rates,
        '2026-08',
      );
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].type).toBe('WATER');
      expect(result.subtotal).toBe(15 * 18000);
    });
  });

  describe('computeAfterHoursCoolingCharge', () => {
    it('multiplies hours by the hourly rate', () => {
      const result = computeAfterHoursCoolingCharge({ hours: 12.5 }, { hourlyRate: 220000 }, '2026-08');
      expect(result.subtotal).toBe(12.5 * 220000);
      expect(result.lines[0].qty).toBe(12.5);
    });

    it('produces no line for zero hours', () => {
      const result = computeAfterHoursCoolingCharge({ hours: 0 }, { hourlyRate: 220000 }, '2026-08');
      expect(result.lines).toHaveLength(0);
      expect(result.subtotal).toBe(0);
    });
  });

  describe('periodBounds / currentPeriod', () => {
    it('computes the first and last day of the period month in UTC', () => {
      const { periodStart, periodEnd } = periodBounds('2026-02');
      expect(periodStart.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(periodEnd.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    });

    it('formats the current period as YYYY-MM', () => {
      expect(currentPeriod(new Date(Date.UTC(2026, 7, 24)))).toBe('2026-08');
    });

    // Regression: the scheduler's cron fires '0 5 1 * *' in Asia/Ho_Chi_Minh (UTC+7, no DST) —
    // that instant is 22:00 UTC on the LAST day of the PREVIOUS month. Reading it with plain UTC
    // getters used to compute the wrong (already-generated) period every single month, silently
    // no-opping the entire monthly auto-generation forever (generatePendingForPeriod would find
    // an "existing" entry for every contract and create nothing).
    it('computes the NEW month for the scheduler cron fire time, not the previous UTC-calendar-day month', () => {
      const cronFireInstant = new Date('2026-09-01T05:00:00+07:00');
      expect(cronFireInstant.toISOString()).toBe('2026-08-31T22:00:00.000Z'); // sanity: this instant IS the previous UTC day
      expect(currentPeriod(cronFireInstant)).toBe('2026-09');
    });

    it('rolls over correctly across a UTC year boundary (Dec 31 UTC -> Jan local)', () => {
      const cronFireInstant = new Date('2027-01-01T05:00:00+07:00');
      expect(currentPeriod(cronFireInstant)).toBe('2027-01');
    });
  });
});
