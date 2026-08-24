import { RenewalRiskService } from './renewal-risk.service';

// CR-110 (INV-CUR-001): getRiskDashboard() must never sum at-risk Contract.rent
// across differing currencyCode values -- each currency stays bucketed
// separately in atRiskMonthlyRevenueByCurrency.
describe('RenewalRiskService — CR-110 mixed-currency at-risk revenue aggregation', () => {
  const prisma: any = { renewalRiskScore: { findMany: jest.fn() } };
  const schedulerLock: any = {};
  const service = new RenewalRiskService(prisma, schedulerLock);

  const score = (overrides: Partial<{ riskLevel: string; rent: number; currencyCode: string | null }>) => ({
    riskScore: 80,
    riskLevel: overrides.riskLevel ?? 'CRITICAL',
    daysToExpiry: 20,
    recommendation: null,
    contract: {
      contractNumber: 'C-1',
      endDate: new Date(),
      rent: overrides.rent ?? 0,
      currencyCode: overrides.currencyCode ?? 'VND',
      tenant: { brandName: 'Tenant' },
      unit: { code: 'U1' },
    },
  });

  beforeEach(() => jest.clearAllMocks());

  it('buckets CRITICAL/HIGH at-risk rent by currency instead of summing VND and USD together', async () => {
    prisma.renewalRiskScore.findMany.mockResolvedValue([
      score({ riskLevel: 'CRITICAL', rent: 100_000_000, currencyCode: 'VND' }),
      score({ riskLevel: 'HIGH', rent: 5_000, currencyCode: 'USD' }),
      score({ riskLevel: 'LOW', rent: 999_999_999, currencyCode: 'VND' }),
    ]);

    const result = await service.getRiskDashboard();

    expect(result.summary.atRiskMonthlyRevenueByCurrency).toEqual({ VND: 100_000_000, USD: 5_000 });
    // LOW-risk contracts must not contribute to at-risk revenue at all.
    expect(result.summary.atRiskMonthlyRevenueByCurrency.VND).not.toBe(1_099_999_999);
  });

  it('defaults a missing currencyCode to VND rather than dropping the contract', async () => {
    prisma.renewalRiskScore.findMany.mockResolvedValue([
      score({ riskLevel: 'CRITICAL', rent: 1_000, currencyCode: null }),
    ]);

    const result = await service.getRiskDashboard();

    expect(result.summary.atRiskMonthlyRevenueByCurrency).toEqual({ VND: 1_000 });
  });

  it('returns an empty currency map when there are no at-risk contracts', async () => {
    prisma.renewalRiskScore.findMany.mockResolvedValue([
      score({ riskLevel: 'LOW', rent: 500, currencyCode: 'VND' }),
    ]);

    const result = await service.getRiskDashboard();

    expect(result.summary.atRiskMonthlyRevenueByCurrency).toEqual({});
  });
});
