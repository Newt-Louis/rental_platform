import { buildRevenueCsv } from './reports-export.util';

describe('ReportsService revenue export compliance', () => {
  it('exports raw Amount and separate Currency without decimal rounding', async () => {
    const exported = buildRevenueCsv([{
      contract: { contractNumber: 'CTR-1' },
      tenant: { brandName: 'Brand A' },
      period: '2026-08',
      type: 'MONTHLY_RENT',
      totalAmount: 1250.25,
      currencyCode: 'USD',
      status: 'ISSUED',
      createdAt: new Date('2026-08-01T00:00:00Z'),
    }], 5000);

    expect(exported).toMatchObject({ rowCount: 1, truncated: false, limit: 5000 });
    expect(exported.csv.split('\n')[0]).toContain('Số tiền,Tiền tệ');
    expect(exported.csv).toContain('"1250.25","USD"');
    expect(exported.csv).not.toContain('"1250","USD"');
  });

  it('detects the sentinel row and excludes it from the capped export', async () => {
    const rows = Array.from({ length: 5001 }, (_, index) => ({
      contract: null,
      tenant: null,
      period: '2026-08',
      type: 'MONTHLY_RENT',
      totalAmount: index + 0.5,
      currencyCode: 'VND',
      status: 'ISSUED',
      createdAt: new Date('2026-08-01T00:00:00Z'),
    }));
    const exported = buildRevenueCsv(rows, 5000);

    expect(exported).toMatchObject({ rowCount: 5000, truncated: true, limit: 5000 });
    expect(exported.csv).not.toContain('"5000.5","VND"');
  });
});
