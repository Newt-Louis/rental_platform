import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApprovalsService } from './approvals.service';
import { ApprovalPolicyConditionType, ApprovalPolicyOperator } from './dto/create-approval-policy-rule.dto';

describe('ApprovalsService approval policy validation', () => {
  const policy = {
    findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(),
  };
  // Quy tắc duyệt giờ gắn mall + tài khoản đích danh, nên service phải tra Mall và User
  // trước khi ghi -- approverRole được suy ra từ chính người được chọn.
  const mall = { findUnique: jest.fn() };
  const user = { findUnique: jest.fn(), findMany: jest.fn() };
  const prisma = { approvalPolicyRule: policy, mall, user };
  let service: ApprovalsService;

  const validRule = {
    code: ' discount-manager ', name: ' Manager discount ', stepName: ' Manager ',
    stepOrder: 1, mallId: 'mall-1', approverId: 'u-manager',
    conditionType: ApprovalPolicyConditionType.DISCOUNT_PCT,
    operator: ApprovalPolicyOperator.GREATER_THAN, threshold: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mall.findUnique.mockResolvedValue({ id: 'mall-1' });
    user.findUnique.mockResolvedValue({
      id: 'u-manager', fullName: 'Tran Thi B', role: Role.LEASING_MANAGER,
      isActive: true, deletedAt: null, mallAccess: [{ id: 'access-1' }],
    });
    policy.findMany.mockResolvedValue([]);
    policy.create.mockImplementation(({ data }) => data);
    policy.update.mockImplementation(({ data }) => data);
    service = new ApprovalsService(prisma as any, { emit: jest.fn() } as any, { enqueue: jest.fn() } as any);
  });

  it('normalizes code and human-readable fields before create', async () => {
    await service.createPolicyRule(validRule);
    expect(policy.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      code: 'DISCOUNT-MANAGER', name: 'Manager discount', stepName: 'Manager',
      mallId: 'mall-1', approverId: 'u-manager', approverRole: Role.LEASING_MANAGER,
      operator: '>', threshold: 10, matchValue: null, isActive: true,
    }) });
  });

  it('clears predicate fields when the approval step is always required', async () => {
    await service.createPolicyRule({ ...validRule, isRequired: true, matchValue: 'stale-value' });
    expect(policy.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      isRequired: true, operator: null, threshold: null, matchValue: null,
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
    policy.findMany.mockResolvedValue([{ ...validRule, approverRole: Role.LEASING_MANAGER, code: 'OTHER', name: 'Other', stepName: 'Manager', isActive: true }]);
    await expect(service.createPolicyRule(validRule)).rejects.toThrow('duplicates active rule');
  });

  it('rejects overlapping BETWEEN ranges for the same approval step', async () => {
    const range = { ...validRule, conditionType: ApprovalPolicyConditionType.PRICE_DEVIATION_PCT,
      operator: ApprovalPolicyOperator.BETWEEN, threshold: 10, matchValue: '20' };
    policy.findMany.mockResolvedValue([{ ...range, approverRole: Role.LEASING_MANAGER, code: 'EXISTING', threshold: 15, matchValue: '25', stepName: 'Manager', isActive: true }]);
    await expect(service.createPolicyRule(range)).rejects.toThrow('overlaps active rule');
  });

  it('merges existing data on update and excludes the current record from duplicate checks', async () => {
    policy.findUnique.mockResolvedValue({ id: 'rule-1', ...validRule, code: 'CURRENT', name: 'Old', stepName: 'Manager', isActive: true, isRequired: false });
    await service.updatePolicyRule('rule-1', { name: ' Updated ' });
    expect(policy.findMany).toHaveBeenCalledWith({ where: { mallId: 'mall-1', id: { not: 'rule-1' } } });
    expect(policy.update).toHaveBeenCalledWith({ where: { id: 'rule-1' }, data: expect.objectContaining({ name: 'Updated', code: 'CURRENT' }) });
  });

  describe('ràng buộc mall + người duyệt đích danh', () => {
    it('từ chối quy tắc không chọn mall', async () => {
      await expect(service.createPolicyRule({ ...validRule, mallId: undefined } as any))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(policy.create).not.toHaveBeenCalled();
    });

    it('từ chối quy tắc không chỉ định người duyệt', async () => {
      await expect(service.createPolicyRule({ ...validRule, approverId: undefined } as any))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(policy.create).not.toHaveBeenCalled();
    });

    it('từ chối người duyệt không có quyền truy cập mall được chọn', async () => {
      user.findUnique.mockResolvedValue({
        id: 'u-manager', fullName: 'Tran Thi B', role: Role.LEASING_MANAGER,
        isActive: true, deletedAt: null, mallAccess: [],
      });
      await expect(service.createPolicyRule(validRule as any))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(policy.create).not.toHaveBeenCalled();
    });

    it('chấp nhận ADMIN dù không có dòng quyền mall riêng', async () => {
      user.findUnique.mockResolvedValue({
        id: 'u-admin', fullName: 'Quan tri', role: Role.ADMIN,
        isActive: true, deletedAt: null, mallAccess: [],
      });
      await service.createPolicyRule({ ...validRule, approverId: 'u-admin' } as any);
      expect(policy.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        approverId: 'u-admin', approverRole: Role.ADMIN,
      }) });
    });

    it('từ chối tài khoản bị khoá', async () => {
      user.findUnique.mockResolvedValue({
        id: 'u-manager', fullName: 'Tran Thi B', role: Role.LEASING_MANAGER,
        isActive: false, deletedAt: null, mallAccess: [{ id: 'access-1' }],
      });
      await expect(service.createPolicyRule(validRule as any))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối role không được duyệt đề xuất', async () => {
      user.findUnique.mockResolvedValue({
        id: 'u-ops', fullName: 'Vu Thi F', role: Role.OPERATION,
        isActive: true, deletedAt: null, mallAccess: [{ id: 'access-1' }],
      });
      await expect(service.createPolicyRule(validRule as any))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('so trùng code chỉ giới hạn trong cùng một mall', async () => {
      await service.createPolicyRule(validRule as any);
      expect(policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { mallId: 'mall-1' } }),
      );
    });
  });
});
