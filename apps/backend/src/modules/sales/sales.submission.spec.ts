import { SalesService } from './sales.service';

describe('SalesService submission audit', () => {
  const prisma: any = {
    salesTurnover: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    salesAuditTrail: { create: jest.fn() },
    unit: { findMany: jest.fn() },
  };
  const service = new SalesService(prisma);
  const dto = { tenantId: 'tenant-1', unitId: 'unit-1', date: '2026-07-01', period: '2026-07', grossSales: 120, netSales: 100, transactions: 5 };

  beforeEach(() => jest.clearAllMocks());

  it('records SUBMITTED when a turnover report is first created', async () => {
    prisma.salesTurnover.findUnique.mockResolvedValue(null);
    prisma.salesTurnover.create.mockResolvedValue({ id: 'sales-1', ...dto });
    await service.create(dto, 'user-1', { id: 'user-1', role: 'TENANT', tenantId: 'tenant-1' });
    expect(prisma.salesAuditTrail.create).toHaveBeenCalledWith({ data: expect.objectContaining({ salesId: 'sales-1', action: 'SUBMITTED', oldValue: null, newValue: 120, performedById: 'user-1' }) });
  });

  it('records REVISED with old and new values when a report is updated', async () => {
    prisma.salesTurnover.findUnique.mockResolvedValue({ id: 'sales-1', grossSales: 90 });
    prisma.salesTurnover.update.mockResolvedValue({ id: 'sales-1', ...dto });
    await service.create(dto, 'user-1', { id: 'user-1', role: 'TENANT', tenantId: 'tenant-1' });
    expect(prisma.salesAuditTrail.create).toHaveBeenCalledWith({ data: expect.objectContaining({ salesId: 'sales-1', action: 'REVISED', oldValue: 90, newValue: 120 }) });
  });

  it('scopes submission units to the authenticated tenant', async () => {
    prisma.unit.findMany.mockResolvedValue([{ id: 'unit-1', code: 'A-01' }]);
    await service.getSubmissionUnits({ id: 'user-1', role: 'TENANT', tenantId: 'tenant-1' });
    expect(prisma.unit.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
  });
});
