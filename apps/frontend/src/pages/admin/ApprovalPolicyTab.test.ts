import { describe, expect, it } from 'vitest';
import { CONDITION_LABELS, ruleCondition } from './ApprovalPolicyTab';

const rule = (overrides: Record<string, unknown>) => ({
  id: 'rule-1',
  code: 'RULE_1',
  name: 'Quy tắc',
  stepName: 'Bước duyệt',
  stepOrder: 1,
  approverRole: 'LEASING_MANAGER',
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
      'RENT_FREE_DAYS',
      'INDUSTRY_TAG',
      'HAS_AR_DEBT',
      'PRICE_BELOW_MIN',
      'PRICE_DEVIATION_PCT',
    ]);
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
    expect(ruleCondition(rule({ conditionType: 'RENT_FREE_DAYS', operator: '>=', threshold: 30 })))
      .toBe('Thời gian miễn tiền thuê lớn hơn hoặc bằng (>=) 30 ngày');
  });
});
