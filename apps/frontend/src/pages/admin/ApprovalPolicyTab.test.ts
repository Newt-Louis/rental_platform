import { describe, expect, it } from 'vitest';
import { CONDITION_LABELS, DEPRECATED_CONDITIONS, ruleCondition } from './ApprovalPolicyTab';

const rule = (overrides: Record<string, unknown>) => ({
  id: 'rule-1',
  code: 'RULE_1',
  name: 'Quy tắc',
  stepName: 'Bước duyệt',
  stepOrder: 1,
  mallId: 'mall-1',
  approverRole: 'LEASING_MANAGER',
  approverId: 'u-manager',
  conditionType: 'DISCOUNT_PCT',
  operator: '>',
  threshold: 5,
  matchValue: null,
  isRequired: false,
  isActive: true,
  ...overrides,
});

describe('Approval Policy condition display', () => {
  it('keeps the condition choices aligned with every backend condition type', () => {
    expect(Object.keys(CONDITION_LABELS)).toEqual([
      'DISCOUNT_PCT',
      'RENT_FREE_MONTHS',
      // SEM-001 — retained for DISPLAY of legacy persisted rows only; excluded
      // from the create dropdown and rejected by the backend DTO.
      'RENT_FREE_DAYS',
      'INDUSTRY_TAG',
      'HAS_AR_DEBT',
      'PRICE_BELOW_MIN',
      'PRICE_DEVIATION_PCT',
    ]);
  });

  it('SEM-001: RENT_FREE_DAYS cannot be chosen for a new rule', () => {
    expect(DEPRECATED_CONDITIONS.has('RENT_FREE_DAYS')).toBe(true);
    expect(DEPRECATED_CONDITIONS.has('RENT_FREE_MONTHS')).toBe(false);
  });

  it('formats boolean conditions without showing a missing value', () => {
    expect(ruleCondition(rule({ conditionType: 'HAS_AR_DEBT', operator: null, threshold: null }))).toBe('Có công nợ quá hạn');
    expect(ruleCondition(rule({ conditionType: 'PRICE_BELOW_MIN', operator: null, threshold: null }))).toBe('Giá thuê thấp hơn giá tối thiểu');
  });

  it('formats range and unconditional rules consistently', () => {
    expect(ruleCondition(rule({ conditionType: 'PRICE_DEVIATION_PCT', operator: 'BETWEEN', threshold: 5, matchValue: '10' })))
      .toBe('Mức giá thấp hơn giá tối thiểu: từ 5% đến 10%');
    expect(ruleCondition(rule({ isRequired: true }))).toBe('Áp dụng cho mọi hồ sơ');
  });

  it('shows numeric operators and units in business-readable form', () => {
    expect(ruleCondition(rule({ conditionType: 'DISCOUNT_PCT', operator: '>', threshold: 5 })))
      .toBe('Tỷ lệ chiết khấu lớn hơn (>) 5%');
    // SEM-001 — the canonical rule is denominated in months.
    expect(ruleCondition(rule({ conditionType: 'RENT_FREE_MONTHS', operator: '>', threshold: 2 })))
      .toBe('Thời gian miễn tiền thuê (tháng) lớn hơn (>) 2 tháng');
    // A legacy row still renders with the unit it was actually stored in, so an
    // admin can see why it needs migrating rather than seeing a silently
    // relabelled threshold.
    expect(ruleCondition(rule({ conditionType: 'RENT_FREE_DAYS', operator: '>=', threshold: 30 })))
      .toBe('Thời gian miễn tiền thuê (ngày — đã ngừng dùng) lớn hơn hoặc bằng (>=) 30 ngày');
  });
});
