import { ReportsService } from './reports.service';

// CR-101 Phase 3G (BC-013): proves the Mall-scope array the controller
// resolves is actually applied to the underlying Prisma query, not merely
// accepted and ignored.
describe('ReportsService — CR-101 Phase 3G Mall-scope filtering', () => {
  const prisma: any = {
    unit: { findMany: jest.fn().mockResolvedValue([]) },
    slotBooking: { findMany: jest.fn().mockResolvedValue([]) },
    lead: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
    proposal: { groupBy: jest.fn().mockResolvedValue([]) },
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    contract: { findMany: jest.fn().mockResolvedValue([]) },
    salesTurnover: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const billingService: any = { getArAging: jest.fn() };
  const auditLogService: any = {};
  const service = new ReportsService(prisma, billingService, auditLogService);

  beforeEach(() => jest.clearAllMocks());

  it('occupancyReport filters Unit by mallId IN the resolved scope when no explicit mallId is given', async () => {
    await service.occupancyReport(undefined, ['mall-1', 'mall-2']);
    expect(prisma.unit.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ mallId: { in: ['mall-1', 'mall-2'] } }),
    }));
  });

  it('occupancyReport does not filter by mallId when scope is unrestricted (null, e.g. CEO/ADMIN)', async () => {
    await service.occupancyReport(undefined, null);
    expect(prisma.unit.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ mallId: expect.anything() }),
    }));
  });

  it('pipelineReport filters Leads by direct mallId and Proposals by unit.mallId', async () => {
    await service.pipelineReport(['mall-1']);
    expect(prisma.lead.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ mallId: { in: ['mall-1'] } }),
    }));
    expect(prisma.proposal.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ unit: { mallId: { in: ['mall-1'] } } }),
    }));
  });

  it('revenueReport filters Invoice by direct mallId', async () => {
    await service.revenueReport({ year: 2026 }, ['mall-1']);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ mallId: { in: ['mall-1'] } }),
    }));
  });

  it('contractExpiryReport filters Contract by unit.mallId', async () => {
    await service.contractExpiryReport({}, ['mall-1']);
    expect(prisma.contract.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ unit: { mallId: { in: ['mall-1'] } } }),
    }));
  });

  it('tenantSalesReport filters SalesTurnover by unit.mallId', async () => {
    await service.tenantSalesReport({ period: '2026-08' }, ['mall-1']);
    expect(prisma.salesTurnover.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ unit: { mallId: { in: ['mall-1'] } } }),
    }));
  });

  it('arAgingReport forwards the resolved scope to BillingService.getArAging, undefined when unrestricted', async () => {
    await service.arAgingReport(['mall-1']);
    expect(billingService.getArAging).toHaveBeenCalledWith(['mall-1']);
    await service.arAgingReport(null);
    expect(billingService.getArAging).toHaveBeenCalledWith(undefined);
  });
});
