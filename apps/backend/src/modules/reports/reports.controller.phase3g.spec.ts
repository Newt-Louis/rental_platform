import { ForbiddenException } from '@nestjs/common';
import { ReportsController } from './reports.controller';

// CR-101 Phase 3G (BC-013): Reports had ZERO MallAccessService usage anywhere
// (CONTRA-008/AUTH-01) -- a missing mallId meant "show everything" for any
// role that could reach the module, not "show the caller's own scope". This
// proves every route now resolves scope via MallAccessService, with the
// approved policy: normal staff/MALL_DIRECTOR get their own accessible set,
// CEO gets unrestricted (crossMallRead), ADMIN unrestricted (bypass).
describe('ReportsController — CR-101 Phase 3G (BC-013)', () => {
  const reportsService: any = {
    occupancyReport: jest.fn(), pipelineReport: jest.fn(), revenueReport: jest.fn(),
    contractExpiryReport: jest.fn(), tenantSalesReport: jest.fn(), revenueReceivablesReport: jest.fn(),
    arAgingReport: jest.fn(), exportCsv: jest.fn(),
  };
  const mallAccess: any = { assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() };
  let controller: ReportsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ReportsController(reportsService, mallAccess);
  });

  it('normal staff (no explicit mallId) gets its own accessible-mall-set forwarded to the report, not an unscoped call', async () => {
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);
    await controller.occupancy(undefined, { id: 'u1', role: 'LEASING_MANAGER' });
    expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith('u1', 'LEASING_MANAGER', { crossMallRead: true });
    expect(reportsService.occupancyReport).toHaveBeenCalledWith(undefined, ['mall-1']);
  });

  it('MALL_DIRECTOR requesting a specific mallId gets it validated against their own access first', async () => {
    mallAccess.assertMallAccess.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.revenue({ year: 2026, mallId: 'mall-B' }, { id: 'u1', role: 'MALL_DIRECTOR' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(reportsService.revenueReport).not.toHaveBeenCalled();
  });

  it('CEO gets unrestricted (null) scope on every report via the crossMallRead grant', async () => {
    mallAccess.getAccessibleMallIds.mockResolvedValue(null);
    await controller.pipeline({ id: 'ceo-1', role: 'CEO' });
    expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith('ceo-1', 'CEO', { crossMallRead: true });
    expect(reportsService.pipelineReport).toHaveBeenCalledWith(null);
  });

  it('ar-aging forwards the resolved scope through to BillingService.getArAging via ReportsService', async () => {
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-2']);
    await controller.arAging({ id: 'u1', role: 'FINANCE' });
    expect(reportsService.arAgingReport).toHaveBeenCalledWith(['mall-2']);
  });

  it('exportCsv resolves and forwards scope identically to the on-screen reports (export mirrors read)', async () => {
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);
    reportsService.exportCsv.mockResolvedValue({ csv: 'csv-data', rowCount: 1, truncated: false, limit: 5000 });
    const res: any = { setHeader: jest.fn(), send: jest.fn() };
    await controller.exportCsv('revenue', {}, { id: 'u1', role: 'LEASING_MANAGER' }, res);
    expect(reportsService.exportCsv).toHaveBeenCalledWith('revenue', undefined, undefined, ['mall-1']);
    expect(res.setHeader).toHaveBeenCalledWith('X-Export-Row-Count', '1');
    expect(res.setHeader).toHaveBeenCalledWith('X-Export-Limit', '5000');
    expect(res.setHeader).toHaveBeenCalledWith('X-Export-Truncated', 'false');
  });
});
