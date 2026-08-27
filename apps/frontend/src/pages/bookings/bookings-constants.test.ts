import { describe, it, expect } from 'vitest';
import {
  fmt, fmtMoney, fmtDate, fmtDatetime, daysLeft,
  UNIT_STATUS_CONFIG, SLOT_STATUS_CONFIG, SLOT_TYPE_CONFIG,
} from './bookings-constants';

// ── fmt ───────────────────────────────────────────────────────────────────────

describe('fmt', () => {
  it('returns a string', () => expect(typeof fmt(1_000_000)).toBe('string'));
  it('formats 0 as "0"', () => expect(fmt(0)).toBe('0'));
  it('formats small numbers without suffix', () => expect(fmt(999)).toBe('999'));
});

// ── fmtMoney ─────────────────────────────────────────────────────────────────

describe('fmtMoney', () => {
  it('returns — for null', () => expect(fmtMoney(null)).toBe('—'));
  it('returns — for undefined', () => expect(fmtMoney(undefined)).toBe('—'));
  it('returns — for 0', () => expect(fmtMoney(0)).toBe('—'));
  it('appends ₫ for positive amount', () => {
    expect(fmtMoney(1_500_000)).toContain('₫');
  });
  it('result is not — for positive amount', () => {
    expect(fmtMoney(500_000)).not.toBe('—');
  });
  it('includes the numeric part in result', () => {
    const result = fmtMoney(1_000);
    expect(result).toContain('1');
  });
});

// ── fmtDate ───────────────────────────────────────────────────────────────────

describe('fmtDate', () => {
  it('returns — for null', () => expect(fmtDate(null)).toBe('—'));
  it('returns — for undefined', () => expect(fmtDate(undefined)).toBe('—'));
  it('returns non-empty string for valid ISO date', () => {
    expect(fmtDate('2024-06-15T12:00:00.000Z')).not.toBe('—');
  });
  it('result contains year 2024', () => {
    expect(fmtDate('2024-06-15T12:00:00.000Z')).toContain('2024');
  });
  it('result contains slash separator', () => {
    expect(fmtDate('2024-06-15T12:00:00.000Z')).toMatch(/\//);
  });
});

// ── fmtDatetime ──────────────────────────────────────────────────────────────

describe('fmtDatetime', () => {
  it('returns — for null', () => expect(fmtDatetime(null)).toBe('—'));
  it('returns — for undefined', () => expect(fmtDatetime(undefined)).toBe('—'));
  it('returns non-empty string for valid ISO datetime', () => {
    expect(fmtDatetime('2024-06-15T10:30:00.000Z')).not.toBe('—');
  });
  it('result contains digits', () => {
    expect(fmtDatetime('2024-06-15T10:30:00.000Z')).toMatch(/\d/);
  });
});

// ── daysLeft ─────────────────────────────────────────────────────────────────

describe('daysLeft', () => {
  it('returns null for undefined', () => expect(daysLeft(undefined)).toBeNull());

  it('returns 0 for past date', () => {
    expect(daysLeft('2020-01-01T00:00:00.000Z')).toBe(0);
  });

  it('never returns negative', () => {
    expect(daysLeft('2000-01-01T00:00:00.000Z')).toBe(0);
  });

  it('returns positive number for future date 5 days away', () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const result = daysLeft(future);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(5);
  });

  it('returns higher number for further future date', () => {
    const near = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const far = new Date(Date.now() + 10 * 86_400_000).toISOString();
    expect(daysLeft(far)!).toBeGreaterThan(daysLeft(near)!);
  });
});

// ── UNIT_STATUS_CONFIG ───────────────────────────────────────────────────────

describe('UNIT_STATUS_CONFIG', () => {
  const STATUSES = ['ACTIVE', 'PENDING', 'EXPIRED', 'CANCELLED', 'CONVERTED'] as const;

  it.each(STATUSES)('has status %s', (status) => {
    expect(UNIT_STATUS_CONFIG).toHaveProperty(status);
  });

  it('each entry has label and color strings', () => {
    Object.values(UNIT_STATUS_CONFIG).forEach((cfg) => {
      expect(typeof cfg.label).toBe('string');
      expect(typeof cfg.color).toBe('string');
      expect(cfg.label.length).toBeGreaterThan(0);
    });
  });

  it('ACTIVE label is "Đang giữ"', () => {
    expect(UNIT_STATUS_CONFIG.ACTIVE.label).toBe('Đang giữ');
  });

  it('CANCELLED label is "Đã hủy"', () => {
    expect(UNIT_STATUS_CONFIG.CANCELLED.label).toBe('Đã hủy');
  });

  it('CONVERTED label is "Đã lập đề xuất"', () => {
    expect(UNIT_STATUS_CONFIG.CONVERTED.label).toBe('Đã lập đề xuất');
  });
});

// ── SLOT_STATUS_CONFIG ───────────────────────────────────────────────────────

describe('SLOT_STATUS_CONFIG', () => {
  const STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] as const;

  it.each(STATUSES)('has status %s', (status) => {
    expect(SLOT_STATUS_CONFIG).toHaveProperty(status);
  });

  it('each entry has label, color, and icon', () => {
    Object.values(SLOT_STATUS_CONFIG).forEach((cfg) => {
      expect(typeof cfg.label).toBe('string');
      expect(typeof cfg.color).toBe('string');
      expect(cfg.icon).toBeDefined();
    });
  });

  it('PENDING label is "Chờ xác nhận"', () => {
    expect(SLOT_STATUS_CONFIG.PENDING.label).toBe('Chờ xác nhận');
  });
});

// ── SLOT_TYPE_CONFIG ─────────────────────────────────────────────────────────

describe('SLOT_TYPE_CONFIG', () => {
  const TYPES = ['DAILY', 'HOURLY', 'MONTHLY'] as const;

  it.each(TYPES)('has type %s', (type) => {
    expect(SLOT_TYPE_CONFIG).toHaveProperty(type);
  });

  it('each entry has label, icon, and color', () => {
    Object.values(SLOT_TYPE_CONFIG).forEach((cfg) => {
      expect(typeof cfg.label).toBe('string');
      expect(cfg.icon).toBeDefined();
      expect(typeof cfg.color).toBe('string');
    });
  });

  it('DAILY label is "Theo ngày"', () => {
    expect(SLOT_TYPE_CONFIG.DAILY.label).toBe('Theo ngày');
  });
});
