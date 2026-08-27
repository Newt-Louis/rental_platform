import { ForbiddenException } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

// CR-101 Phase 3G (BC-013 + BC-CEO-SCOPE Option A):
// - upsertMallPolicy/updateMallRetention are confirmed operational-write
//   contradictions -- CEO could change Mall-wide policy/retention config,
//   not just view analytics. Narrowed to exclude CEO.
// - getMultiMallComparison was the confirmed CONTRA-008/AUTH-01 gap (zero
//   Mall check at all) -- now resolves scope via MallAccessService, with CEO
//   getting unrestricted read via crossMallRead (BC-CEO-SCOPE Option A).
describe('AnalyticsController — CR-101 Phase 3G (BC-013 / BC-CEO-SCOPE)', () => {
  it('upsertMallPolicy and updateMallRetention exclude CEO from their role metadata', () => {
    const policyRoles = Reflect.getMetadata(ROLES_KEY, AnalyticsController.prototype.upsertMallPolicy);
    const retentionRoles = Reflect.getMetadata(ROLES_KEY, AnalyticsController.prototype.updateMallRetention);
    expect(policyRoles).toBeDefined();
    expect(policyRoles).not.toContain('CEO');
    expect(retentionRoles).toBeDefined();
    expect(retentionRoles).not.toContain('CEO');
    // Still reachable by the roles that legitimately administer Mall config.
    expect(policyRoles).toEqual(expect.arrayContaining(['ADMIN', 'MALL_DIRECTOR']));
  });

  it('getMallPolicy/getMallRetention (read) carry no CEO-excluding override -- inherit the class default, which still includes CEO', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AnalyticsController.prototype.getMallPolicy)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, AnalyticsController.prototype.getMallRetention)).toBeUndefined();
  });

  describe('getMultiMallComparison scope resolution', () => {
    const compliance: any = { getMultiMallComparison: jest.fn() };
    const mallAccess: any = { assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() };
    let controller: AnalyticsController;

    beforeEach(() => {
      jest.clearAllMocks();
      controller = new AnalyticsController({} as any, {} as any, compliance, {} as any, mallAccess);
    });

    it('a normal staff role gets its own accessible-mall-set passed through, not an unfiltered call (closes CONTRA-008/AUTH-01)', async () => {
      mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);
      await controller.getMultiMallComparison({ id: 'u1', role: 'LEASING_MANAGER' });
      expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith('u1', 'LEASING_MANAGER', { crossMallRead: true });
      expect(compliance.getMultiMallComparison).toHaveBeenCalledWith(['mall-1']);
    });

    it('CEO gets unrestricted (null) scope via the crossMallRead grant', async () => {
      mallAccess.getAccessibleMallIds.mockResolvedValue(null);
      await controller.getMultiMallComparison({ id: 'ceo-1', role: 'CEO' });
      expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith('ceo-1', 'CEO', { crossMallRead: true });
      expect(compliance.getMultiMallComparison).toHaveBeenCalledWith(null);
    });
  });

  describe('upsertMallPolicy still validates Mall access for whoever can reach it', () => {
    const compliance: any = { upsertMallPolicy: jest.fn() };
    const mallAccess: any = { assertMallAccess: jest.fn() };
    let controller: AnalyticsController;

    beforeEach(() => {
      jest.clearAllMocks();
      controller = new AnalyticsController({} as any, {} as any, compliance, {} as any, mallAccess);
    });

    it('denies before calling the service when the caller lacks access to the target mall', async () => {
      mallAccess.assertMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.upsertMallPolicy('mall-1', { policies: {} }, { id: 'u1', role: 'MALL_DIRECTOR' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(compliance.upsertMallPolicy).not.toHaveBeenCalled();
    });
  });

  describe('compliance export scope', () => {
    const compliance: any = {
      listExports: jest.fn(),
      requestExport: jest.fn(),
      getExport: jest.fn(),
      generateExport: jest.fn(),
    };
    const mallAccess: any = { assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() };
    let controller: AnalyticsController;

    beforeEach(() => {
      jest.clearAllMocks();
      controller = new AnalyticsController({} as any, {} as any, compliance, {} as any, mallAccess);
    });

    it('scopes the export worklist to the caller accessible malls', async () => {
      mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);

      await controller.listExports(undefined, 'PENDING', { id: 'u1', role: 'MALL_DIRECTOR' });

      expect(compliance.listExports).toHaveBeenCalledWith({
        mallId: undefined,
        status: 'PENDING',
        mallIds: ['mall-1'],
      });
    });

    it('validates Mall write access before creating a scoped export', async () => {
      mallAccess.assertMallAccess.mockRejectedValue(new ForbiddenException());

      await expect(controller.requestExport({
        exportType: 'CONTRACTS',
        mallId: 'mall-2',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      }, { id: 'u1', role: 'MALL_DIRECTOR' })).rejects.toBeInstanceOf(ForbiddenException);

      expect(compliance.requestExport).not.toHaveBeenCalled();
    });

    it('rejects non-ADMIN global export requests', async () => {
      await expect(controller.requestExport({
        exportType: 'CONTRACTS',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      }, { id: 'ceo-1', role: 'CEO' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('validates the persisted export Mall before generation', async () => {
      compliance.getExport.mockResolvedValue({ id: 'exp-1', mallId: 'mall-2' });
      mallAccess.assertMallAccess.mockRejectedValue(new ForbiddenException());

      await expect(controller.generateExport('exp-1', {
        id: 'u1',
        role: 'MALL_DIRECTOR',
      })).rejects.toBeInstanceOf(ForbiddenException);

      expect(compliance.generateExport).not.toHaveBeenCalled();
    });

    it('limits the all-Mall manual scheduler trigger to ADMIN', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AnalyticsController.prototype.triggerMonthlyReports);
      expect(roles).toEqual(['ADMIN']);
    });
  });
});
