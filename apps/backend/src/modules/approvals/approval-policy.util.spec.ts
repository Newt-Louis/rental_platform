import { Role } from '@prisma/client';
import { buildApprovalStepsFromRules } from './approval-policy.util';

describe('approval-policy.util', () => {
  it('builds required and conditional steps in order', () => {
    const rules = [
      {
        stepName: 'Leasing Manager Approval',
        stepOrder: 10,
        approverRole: Role.LEASING_MANAGER,
        conditionType: 'DISCOUNT_PCT',
        operator: '>=',
        threshold: 0,
        isRequired: true,
      },
      {
        stepName: 'Mall Director Approval',
        stepOrder: 20,
        approverRole: Role.MALL_DIRECTOR,
        conditionType: 'DISCOUNT_PCT',
        operator: '>',
        threshold: 5,
        isRequired: false,
      },
      {
        stepName: 'Finance Review',
        stepOrder: 30,
        approverRole: Role.FINANCE,
        conditionType: 'DISCOUNT_PCT',
        operator: '>=',
        threshold: 0,
        isRequired: true,
      },
    ];

    const steps = buildApprovalStepsFromRules(rules, {
      discountPct: 7,
      rentFreeDays: 0,
      industryTag: 'F&B',
      hasArDebt: false,
    });

    expect(steps).toHaveLength(3);
    expect(steps[0].approverRole).toBe(Role.LEASING_MANAGER);
    expect(steps[1].approverRole).toBe(Role.MALL_DIRECTOR);
    expect(steps[2].approverRole).toBe(Role.FINANCE);
    expect(steps[0].stepOrder).toBe(1);
    expect(steps[2].stepOrder).toBe(3);
  });

  it('skips non-matching conditional rules', () => {
    const rules = [
      {
        stepName: 'Leasing Manager Approval',
        stepOrder: 10,
        approverRole: Role.LEASING_MANAGER,
        conditionType: 'DISCOUNT_PCT',
        operator: '>=',
        threshold: 0,
        isRequired: true,
      },
      {
        stepName: 'CEO Approval',
        stepOrder: 20,
        approverRole: Role.CEO,
        conditionType: 'DISCOUNT_PCT',
        operator: '>',
        threshold: 10,
        isRequired: false,
      },
    ];

    const steps = buildApprovalStepsFromRules(rules, {
      discountPct: 3,
      rentFreeDays: 0,
      industryTag: 'F&B',
      hasArDebt: false,
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].approverRole).toBe(Role.LEASING_MANAGER);
  });
});

