import { ServiceContractsService } from './service-contracts.service';

// Money Domain Consolidation (INV-CUR-001): stats() must never sum
// ServiceContract.totalValue across differing currency values -- same bug
// class as CR-110 (reports/renewal-risk) and CR-102 (billing invoices).
describe('ServiceContractsService — stats() mixed-currency aggregation', () => {
  const prisma: any = {
    serviceContract: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn(),
    },
  };
  const storage: any = {};
  const service = new ServiceContractsService(prisma, storage);

  beforeEach(() => jest.clearAllMocks());

  it('buckets totalValue by currency instead of summing VND and USD together', async () => {
    prisma.serviceContract.groupBy.mockImplementation(({ by }: { by: string[] }) => {
      if (by[0] === 'status') return Promise.resolve([{ status: 'ACTIVE', _count: 3 }]);
      if (by[0] === 'serviceCategory') return Promise.resolve([{ serviceCategory: 'CLEANING', _count: 3 }]);
      if (by[0] === 'valueBasis') return Promise.resolve([{ valueBasis: 'MONTHLY', _count: 3 }]);
      if (by[0] === 'currency') {
        return Promise.resolve([
          { currency: 'VND', _sum: { totalValue: 500_000_000 } },
          { currency: 'USD', _sum: { totalValue: 20_000 } },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await service.stats();

    expect(result.totalValueByCurrency).toEqual({ VND: 500_000_000, USD: 20_000 });
    expect(Object.values(result.totalValueByCurrency).reduce((a: number, b: number) => a + b, 0)).not.toBe(
      result.totalValueByCurrency.VND,
    );
    expect((result as any).totalValue).toBeUndefined();
  });

  it('returns an empty currency map when there are no contracts', async () => {
    prisma.serviceContract.groupBy.mockResolvedValue([]);

    const result = await service.stats();

    expect(result.totalValueByCurrency).toEqual({});
  });
});
