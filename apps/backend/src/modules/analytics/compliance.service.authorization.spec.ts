import { ComplianceService } from './compliance.service';

describe('ComplianceService Mall isolation', () => {
  const prisma: any = {
    complianceExport: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    contract: { findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    approvalWorkflow: { findMany: jest.fn() },
    contractEvent: { findMany: jest.fn() },
    sapIntegrationLog: { findMany: jest.fn() },
  };
  let service: ComplianceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ComplianceService(prisma);
    prisma.complianceExport.update.mockResolvedValue({});
  });

  it('filters export records to the caller accessible Mall set', async () => {
    await service.listExports({ status: 'PENDING', mallIds: ['mall-1'] });

    expect(prisma.complianceExport.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'PENDING', mallId: { in: ['mall-1'] } },
    }));
  });

  it('filters proposal and fitout approval payloads by authoritative Unit Mall', async () => {
    prisma.complianceExport.findUnique.mockResolvedValue({
      id: 'exp-1',
      exportType: 'APPROVALS',
      mallId: 'mall-1',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
    });
    prisma.approvalWorkflow.findMany.mockResolvedValue([]);

    await service.generateExport('exp-1');

    expect(prisma.approvalWorkflow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { proposal: { unit: { mallId: 'mall-1' } } },
          { fitoutSubmittal: { project: { unit: { mallId: 'mall-1' } } } },
        ],
      }),
    }));
  });

  it('omits SAP logs without Mall provenance from a Mall-scoped audit export', async () => {
    prisma.complianceExport.findUnique.mockResolvedValue({
      id: 'exp-2',
      exportType: 'AUDIT_TRAIL',
      mallId: 'mall-1',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
    });
    prisma.contractEvent.findMany.mockResolvedValue([]);

    const result = await service.generateExport('exp-2');

    expect(result).toEqual({ contractEvents: [], sapLogs: [] });
    expect(prisma.sapIntegrationLog.findMany).not.toHaveBeenCalled();
  });

  it('retains SAP logs in an ADMIN global audit export', async () => {
    prisma.complianceExport.findUnique.mockResolvedValue({
      id: 'exp-3',
      exportType: 'AUDIT_TRAIL',
      mallId: null,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
    });
    prisma.contractEvent.findMany.mockResolvedValue([]);
    prisma.sapIntegrationLog.findMany.mockResolvedValue([{ id: 'sap-1' }]);

    const result = await service.generateExport('exp-3');

    expect(result).toEqual({ contractEvents: [], sapLogs: [{ id: 'sap-1' }] });
  });
});
