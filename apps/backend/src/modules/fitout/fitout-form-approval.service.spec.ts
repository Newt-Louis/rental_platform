import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FitoutFormApprovalService } from './fitout-form-approval.service';

describe('FitoutFormApprovalService', () => {
  const prisma: any = {
    fitoutFormType: { findUnique: jest.fn() },
    mall: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    fitoutFormApprovalLevel: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      groupBy: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: FitoutFormApprovalService;

  const operation = { id: 'u-op', fullName: 'Nguyễn Vận Hành', role: 'OPERATION', isActive: true, mallAccess: [{ id: 'a1' }] };
  const director = { id: 'u-dir', fullName: 'Trần Giám Đốc', role: 'MALL_DIRECTOR', isActive: true, mallAccess: [{ id: 'a2' }] };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: any) => cb(prisma));
    prisma.fitoutFormType.findUnique.mockResolvedValue({ id: 'form-1', code: 'DESIGN_DRAWING', name: 'Bản vẽ thiết kế' });
    prisma.mall.findUnique.mockResolvedValue({ id: 'mall-1' });
    prisma.fitoutFormApprovalLevel.findMany.mockResolvedValue([]);
    service = new FitoutFormApprovalService(prisma);
  });

  describe('replaceLevels()', () => {
    it('numbers levels 1..n in the submitted order and stamps each approver role', async () => {
      prisma.user.findMany.mockResolvedValue([operation, director]);

      await service.replaceLevels('DESIGN_DRAWING', 'mall-1', [
        { approverId: 'u-op' },
        { stepName: 'Giám đốc TTTM duyệt', approverId: 'u-dir' },
      ]);

      expect(prisma.fitoutFormApprovalLevel.createMany).toHaveBeenCalledWith({
        data: [
          { formTypeId: 'form-1', mallId: 'mall-1', level: 1, stepName: 'Bản vẽ thiết kế — Cấp 1', approverRole: 'OPERATION', approverId: 'u-op' },
          { formTypeId: 'form-1', mallId: 'mall-1', level: 2, stepName: 'Giám đốc TTTM duyệt', approverRole: 'MALL_DIRECTOR', approverId: 'u-dir' },
        ],
      });
    });

    it('replaces the whole chain of that Mall so no stale level survives', async () => {
      prisma.user.findMany.mockResolvedValue([operation]);
      await service.replaceLevels('DESIGN_DRAWING', 'mall-1', [{ approverId: 'u-op' }]);
      expect(prisma.fitoutFormApprovalLevel.deleteMany).toHaveBeenCalledWith({
        where: { formTypeId: 'form-1', mallId: 'mall-1' },
      });
    });

    it('clears the chain when given an empty list, without touching other Malls', async () => {
      const result = await service.replaceLevels('DESIGN_DRAWING', 'mall-1', []);
      expect(result).toEqual([]);
      expect(prisma.fitoutFormApprovalLevel.deleteMany).toHaveBeenCalledWith({
        where: { formTypeId: 'form-1', mallId: 'mall-1' },
      });
      expect(prisma.fitoutFormApprovalLevel.createMany).not.toHaveBeenCalled();
    });

    it('rejects an approver without access to the Mall being configured', async () => {
      prisma.user.findMany.mockResolvedValue([{ ...operation, mallAccess: [] }]);
      await expect(service.replaceLevels('DESIGN_DRAWING', 'mall-1', [{ approverId: 'u-op' }]))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.fitoutFormApprovalLevel.createMany).not.toHaveBeenCalled();
    });

    it('accepts an ADMIN approver even without an explicit Mall access row', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u-admin', fullName: 'Quản trị', role: 'ADMIN', isActive: true, mallAccess: [] }]);
      await expect(service.replaceLevels('DESIGN_DRAWING', 'mall-1', [{ approverId: 'u-admin' }])).resolves.toBeDefined();
    });

    it.each([
      ['locked', { ...operation, isActive: false }],
      ['not a fitout-approver role', { ...operation, role: 'TENANT' }],
    ])('rejects an approver that is %s', async (_label, user) => {
      prisma.user.findMany.mockResolvedValue([user]);
      await expect(service.replaceLevels('DESIGN_DRAWING', 'mall-1', [{ approverId: 'u-op' }]))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects the same account appearing at two levels', async () => {
      prisma.user.findMany.mockResolvedValue([operation]);
      await expect(service.replaceLevels('DESIGN_DRAWING', 'mall-1', [{ approverId: 'u-op' }, { approverId: 'u-op' }]))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('rejects an unknown form type before writing anything', async () => {
      prisma.fitoutFormType.findUnique.mockResolvedValue(null);
      await expect(service.replaceLevels('NOPE', 'mall-1', [{ approverId: 'u-op' }]))
        .rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.fitoutFormApprovalLevel.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('buildApprovalSteps()', () => {
    it('maps the configured chain onto ApprovalStep input, carrying the assigned account', async () => {
      prisma.fitoutFormApprovalLevel.findMany.mockResolvedValue([
        { level: 1, stepName: 'Cấp 1', approverRole: 'OPERATION', approverId: 'u-op', approver: { id: 'u-op', role: 'OPERATION', isActive: true } },
        { level: 2, stepName: 'Cấp 2', approverRole: 'MALL_DIRECTOR', approverId: 'u-dir', approver: { id: 'u-dir', role: 'MALL_DIRECTOR', isActive: true } },
      ]);

      await expect(service.buildApprovalSteps('form-1', 'mall-1', 'Bản vẽ thiết kế')).resolves.toEqual([
        { stepName: 'Cấp 1', stepOrder: 1, approverRole: 'OPERATION', approverId: 'u-op' },
        { stepName: 'Cấp 2', stepOrder: 2, approverRole: 'MALL_DIRECTOR', approverId: 'u-dir' },
      ]);
    });

    it('refuses when the Mall has no chain configured, instead of silently defaulting to OPERATION', async () => {
      prisma.fitoutFormApprovalLevel.findMany.mockResolvedValue([]);
      await expect(service.buildApprovalSteps('form-1', 'mall-1', 'Bản vẽ thiết kế'))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses when a configured approver has since been locked', async () => {
      prisma.fitoutFormApprovalLevel.findMany.mockResolvedValue([
        { level: 1, stepName: 'Cấp 1', approverRole: 'OPERATION', approverId: 'u-op', approver: { id: 'u-op', role: 'OPERATION', isActive: false } },
      ]);
      await expect(service.buildApprovalSteps('form-1', 'mall-1', 'Bản vẽ thiết kế'))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listEligibleApprovers()', () => {
    it('limits candidates to active fitout-approver roles scoped to the Mall (ADMIN exempt)', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.listEligibleApprovers('mall-1');
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          isActive: true,
          role: { in: ['ADMIN', 'OPERATION', 'LEASING_MANAGER', 'MALL_DIRECTOR'] },
          OR: [{ role: 'ADMIN' }, { mallAccess: { some: { mallId: 'mall-1', isActive: true } } }],
        },
      }));
    });
  });
});
