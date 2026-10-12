import { BadRequestException } from '@nestjs/common';
import {
  peakOccupiedArea, fitsCapacity, resolvePricingRange, dailyAmountWithWeekendHoliday, localDateKey,
} from './slot-allocation';

const d = (s: string) => new Date(s);

describe('slot-allocation', () => {
  describe('peakOccupiedArea / fitsCapacity', () => {
    it('does not add up bookings that do not overlap each other', () => {
      const existing = [
        { from: d('2026-09-01T00:00:00Z'), to: d('2026-09-03T00:00:00Z'), area: 60 },
        { from: d('2026-09-03T00:00:00Z'), to: d('2026-09-05T00:00:00Z'), area: 60 },
      ];
      expect(peakOccupiedArea(existing, d('2026-09-01T00:00:00Z'), d('2026-09-05T00:00:00Z'))).toBe(60);
      expect(fitsCapacity(existing, d('2026-09-01T00:00:00Z'), d('2026-09-05T00:00:00Z'), 40, 100)).toBe(true);
      expect(fitsCapacity(existing, d('2026-09-01T00:00:00Z'), d('2026-09-05T00:00:00Z'), 50, 100)).toBe(false);
    });

    it('adds up bookings that overlap each other', () => {
      const existing = [
        { from: d('2026-09-01T00:00:00Z'), to: d('2026-09-04T00:00:00Z'), area: 30 },
        { from: d('2026-09-02T00:00:00Z'), to: d('2026-09-05T00:00:00Z'), area: 50 },
      ];
      expect(peakOccupiedArea(existing, d('2026-09-01T00:00:00Z'), d('2026-09-05T00:00:00Z'))).toBe(80);
    });

    it('ignores bookings outside the window', () => {
      const existing = [{ from: d('2026-08-01T00:00:00Z'), to: d('2026-08-05T00:00:00Z'), area: 100 }];
      expect(fitsCapacity(existing, d('2026-09-01T00:00:00Z'), d('2026-09-02T00:00:00Z'), 100, 100)).toBe(true);
    });
  });

  describe('resolvePricingRange', () => {
    const base = {
      installationStart: d('2026-09-01T07:00:00Z'),
      start: d('2026-09-02T09:00:00Z'),
      end: d('2026-09-04T18:00:00Z'),
      dismantlingEnd: d('2026-09-05T20:00:00Z'),
    };
    it('PROGRAM_ONLY uses the program period', () => {
      expect(resolvePricingRange({ ...base, basis: 'PROGRAM_ONLY' })).toEqual({ from: base.start, to: base.end });
    });
    it('SETUP_TO_DISMANTLE uses the whole occupied period', () => {
      expect(resolvePricingRange({ ...base, basis: 'SETUP_TO_DISMANTLE' }))
        .toEqual({ from: base.installationStart, to: base.dismantlingEnd });
    });
    it('CUSTOM_RANGE needs a valid range inside setup..dismantling', () => {
      expect(() => resolvePricingRange({ ...base, basis: 'CUSTOM_RANGE' })).toThrow(BadRequestException);
      expect(() => resolvePricingRange({
        ...base, basis: 'CUSTOM_RANGE', pricingStart: d('2026-08-30T00:00:00Z'), pricingEnd: d('2026-09-03T00:00:00Z'),
      })).toThrow(BadRequestException);
      expect(resolvePricingRange({
        ...base, basis: 'CUSTOM_RANGE', pricingStart: d('2026-09-02T00:00:00Z'), pricingEnd: d('2026-09-03T00:00:00Z'),
      })).toEqual({ from: d('2026-09-02T00:00:00Z'), to: d('2026-09-03T00:00:00Z') });
    });
  });

  describe('dailyAmountWithWeekendHoliday', () => {
    it('charges weekend and holiday days at the special price', () => {
      // 2026-09-02 = Wednesday (holiday), 09-03 Thu, 09-05 Sat, 09-06 Sun
      const from = new Date(2026, 8, 2, 0, 0, 0);
      const to = new Date(2026, 8, 7, 0, 0, 0); // 5 days: Wed(holiday) Thu Fri Sat Sun
      const total = dailyAmountWithWeekendHoliday({
        from, to, area: 10, weekdayPrice: 100, weekendHolidayPrice: 200,
        holidayKeys: new Set([localDateKey(new Date(2026, 8, 2))]),
      });
      // holiday(200) + Thu(100) + Fri(100) + Sat(200) + Sun(200) = 800 per m2 * 10
      expect(total).toBe(8000);
    });
  });
});

describe('termMonthsForRange', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { termMonthsForRange } = require('./slot-allocation');
  it('is at least 1 month and rounds up', () => {
    expect(termMonthsForRange(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-03T00:00:00Z'))).toBe(1);
    expect(termMonthsForRange(new Date('2026-09-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'))).toBe(1);
    expect(termMonthsForRange(new Date('2026-09-01T00:00:00Z'), new Date('2026-10-05T00:00:00Z'))).toBe(2);
    expect(termMonthsForRange(new Date('2026-01-01T00:00:00Z'), new Date('2026-04-01T00:00:00Z'))).toBe(3);
  });
});
