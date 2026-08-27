import { ReportsService } from './reports.service';

// CR-110 (INV-CUR-001): pipelineReport() must never sum Proposal.totalContractValue
// across differing rentCurrency values -- each currency's total stays bucketed
// separately in valueByCurrency.
describe('ReportsService — CR-110 mixed-currency pipeline aggregation', () => {
  const prisma: any = {
    lead: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
    proposal: { groupBy: jest.fn() },
  };
  const billingService: any = {};
  const auditLogService: any = {};
  const service = new ReportsService(prisma, billingService, auditLogService);

  beforeEach(() => jest.clearAllMocks());

  it('buckets VND and USD proposal values separately for the same status instead of summing them', async () => {
    prisma.proposal.groupBy.mockResolvedValue([
      { status: 'NEGOTIATING', rentCurrency: 'VND', _count: { _all: 3 }, _sum: { totalContractValue: 900_000_000 } },
      { status: 'NEGOTIATING', rentCurrency: 'USD', _count: { _all: 2 }, _sum: { totalContractValue: 50_000 } },
    ]);

    const result = await service.pipelineReport(['mall-1']);

    expect(result.proposals).toHaveLength(1);
    const row = result.proposals[0];
    expect(row.status).toBe('NEGOTIATING');
    expect(row._count).toBe(5);
    expect(row.valueByCurrency).toEqual({ VND: 900_000_000, USD: 50_000 });
    // The bug this guards against: a blind sum would silently produce
    // 900_050_000 under a single currency-less field.
    expect(Object.values(row.valueByCurrency).reduce((a: number, b: number) => a + b, 0)).not.toBe(
      row.valueByCurrency.VND,
    );
  });

  it('keeps separate statuses separate and accumulates repeated currency groups for the same status', async () => {
    prisma.proposal.groupBy.mockResolvedValue([
      { status: 'DRAFT', rentCurrency: 'VND', _count: { _all: 1 }, _sum: { totalContractValue: 100 } },
      { status: 'SENT', rentCurrency: 'VND', _count: { _all: 1 }, _sum: { totalContractValue: 200 } },
    ]);

    const result = await service.pipelineReport(null);

    expect(result.proposals).toEqual(
      expect.arrayContaining([
        { status: 'DRAFT', _count: 1, valueByCurrency: { VND: 100 } },
        { status: 'SENT', _count: 1, valueByCurrency: { VND: 200 } },
      ]),
    );
  });

  it('handles an entirely empty pipeline without throwing', async () => {
    prisma.proposal.groupBy.mockResolvedValue([]);
    const result = await service.pipelineReport(null);
    expect(result.proposals).toEqual([]);
  });
});
