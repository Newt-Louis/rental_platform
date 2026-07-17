import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApprovalsService } from './approvals.service';
import { ApprovalPolicyConditionType, ApprovalPolicyOperator } from './dto/create-approval-policy-rule.dto';

describe('ApprovalsService approval policy validation', () => {
  const policy = {
    findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(),
  };
  const prisma = { approvalPolicyRule: policy };
  let service: ApprovalsService;

  const validRule = {
    code: ' discount-manager ', name: ' Manager discount ', stepName: ' Manager ',
    stepOrder: 1, approverRole: Role.LEASING_MANAGER,
    conditionType: ApprovalPolicyConditionType.DISCOUNT_PCT,
    operator: ApprovalPolicyOperator.GREATER_THAN, threshold: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    policy.findMany.mockResolvedValue([]);
    policy.create.mockImplementation(({ data }) => data);
    policy.update.mockImplementation(({ data }) => data);
    service = new ApprovalsService(prisma as any, { emit: jest.fn() } as any, { enqueue: jest.fn() } as any);
  });

  it('normalizes code and human-readable fields before create', async () => {
    await service.createPolicyRule(validRule);
    expect(policy.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      code: 'DISCOUNT-MANAGER', name: 'Manager discount', stepName: 'Manager',
      operator: '>', threshold: 10, matchValue: null, isActive: true,
    }) });
  });

  it.each([
    [{ ...validRule, operator: undefined }, 'operator'],
    [{ ...validRule, threshold: undefined }, 'threshold'],
    [{ ...validRule, conditionType: ApprovalPolicyConditionType.INDUSTRY_TAG, operator: undefined, threshold: undefined }, 'matchValue'],
    [{ ...validRule, conditionType: ApprovalPolicyConditionType.HAS_AR_DEBT }, 'does not accept'],
    [{ ...validRule, conditionType: ApprovalPolicyConditionType.PRICE_DEVIATION_PCT, operator: ApprovalPolicyOperator.BETWEEN, threshold: 10, matchValue: '5' }, 'BETWEEN'],
  ])('rejects invalid condition semantics', async (rule, message) => {
    await expect(service.createPolicyRule(rule as any)).rejects.toThrow(message);
    expect(policy.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate codes case-insensitively', async () => {
    policy.findMany.mockResolvedValue([{ ...validRule, code: 'DISCOUNT-MANAGER' }]);
    await expect(service.createPolicyRule(validRule)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an exact duplicate active predicate for the same approval step', async () => {
    policy.findMany.mockResolvedValue([{ ...validRule, code: 'OTHER', name: 'Other', stepName: 'Manager', isActive: true }]);
    await expect(service.createPolicyRule(validRule)).rejects.toThrow('duplicates active rule');
  });

  it('rejects overlapping BETWEEN ranges for the same approval step', async () => {
    const range = { ...validRule, conditionType: ApprovalPolicyConditionType.PRICE_DEVIATION_PCT,
      operator: ApprovalPolicyOperator.BETWEEN, threshold: 10, matchValue: '20' };
    policy.findMany.mockResolvedValue([{ ...range, code: 'EXISTING', threshold: 15, matchValue: '25', stepName: 'Manager', isActive: true }]);
    await expect(service.createPolicyRule(range)).rejects.toThrow('overlaps active rule');
  });

  it('merges existing data on update and excludes the current record from duplicate checks', async () => {
    policy.findUnique.mockResolvedValue({ id: 'rule-1', ...validRule, code: 'CURRENT', name: 'Old', stepName: 'Manager', isActive: true, isRequired: false });
    await service.updatePolicyRule('rule-1', { name: ' Updated ' });
    expect(policy.findMany).toHaveBeenCalledWith({ where: { id: { not: 'rule-1' } } });
    expect(policy.update).toHaveBeenCalledWith({ where: { id: 'rule-1' }, data: expect.objectContaining({ name: 'Updated', code: 'CURRENT' }) });
  });
});
