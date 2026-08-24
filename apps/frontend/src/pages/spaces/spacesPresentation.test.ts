import { describe, expect, it } from 'vitest';
import {
  formatVndAmount,
  formatVndRate,
  getUnitStatusLabel,
  humanizeWorkflowValue,
  UNIT_STATUSES,
} from './spacesPresentation';

const labels: Record<string, string> = {
  VACANT: 'Trống',
  BOOKING: 'Đang giữ chỗ',
  NEGOTIATING: 'Đang thương thảo',
  CONTRACTED: 'Đã ký hợp đồng',
  UNDER_FITOUT: 'Đang thi công',
  OCCUPIED: 'Đang thuê',
  MERGED: 'Đã gộp',
  unknownValue: 'Không xác định',
};

describe('space presentation', () => {
  it('maps every authoritative Unit status to a localized presentation label', () => {
    const t = (key: string, options?: { defaultValue?: string }) => labels[key.replace('status.', '')] ?? options?.defaultValue ?? key;
    expect(UNIT_STATUSES.map((status) => getUnitStatusLabel(t, status))).toEqual(
      UNIT_STATUSES.map((status) => labels[status]),
    );
  });

  it('humanizes an unknown workflow value rather than exposing a raw enum', () => {
    expect(humanizeWorkflowValue('PENDING_REVIEW')).toBe('Pending Review');
  });

  it('uses a neutral localized fallback for an unknown Unit status', () => {
    const t = (key: string, options?: { defaultValue?: string }) => labels[key.replace('common:', '').replace('status.', '')] ?? options?.defaultValue ?? key;
    expect(getUnitStatusLabel(t, 'FUTURE_STATUS')).toBe('Không xác định');
  });

  it('shows exact, unscaled VND amounts and rates with an explicit ISO code', () => {
    expect(formatVndAmount(3_165_855_000)).toBe('3.165.855.000 VND');
    expect(formatVndRate(3_165_855_000)).toBe('3.165.855.000 VND/m²');
    expect(formatVndAmount(3_165_855_000)).not.toMatch(/tỷ|tr|[KMB]/i);
  });
});
