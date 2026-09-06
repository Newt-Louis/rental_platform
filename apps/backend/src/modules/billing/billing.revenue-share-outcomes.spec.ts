import { ContractStatus, CurrencyCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from './billing.service';
import { SalesService } from '../sales/sales.service';

/**
 * REVSHARE-02 — every turnover row the batch examines ends in exactly one
 * observable outcome. A financial batch that silently drops rows is
 * indistinguishable from one that lost them.
 *
 * Outcomes: INVOICE_CREATED · NO_AMOUNT_DUE · SKIPPED_WITH_REASON · REJECTED
 */

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

const contractRow = (over: Partial<any> = {}) => ({
  id: 'contract-1',
  contractNumber: 'CTR-0001',
  tenantId: 'tenant-1',
  unitId: 'unit-1',
  proposalId: 'proposal-1',
  currencyCode: 'VND' as CurrencyCode,
  rent: 1_000_000,
  status: ContractStatus.ACTIVE,
  startDate: D(2026, 0, 1),
  endDate: D(2026, 11, 31),
  termination: null,
  ...over,
});

const turnoverRow = (over: Partial<any> = {}) => ({
  id: 'turnover-1',
  tenantId: 'tenant-1',
  unitId: 'unit-1',
  period: '2026-09',
  grossSales: 100_000_000,
  netSales: 90_000_000,
  currencyCode: 'VND' as CurrencyCode | null,
  tenant: { id: 'tenant-1', brandName: 'Test Brand' },
  unit: { id: 'unit-1', code: 'GF-A01' },
  ...over,
});

function build(opts: {
  turnovers: any[];
  contractsByUnit?: Record<string, any[]>;
  revenueSharePercent?: number | null;
  existingInvoice?: any;
}) {
  const prisma: any = {
    salesTurnover: { findMany: jest.fn().mockResolvedValue(opts.turnovers) },
    contract: {
      findMany: jest.fn(async ({ where }: any) => opts.contractsByUnit?.[where.unitId] ?? []),
    },
    proposal: {
      findUnique: jest.fn().mockResolvedValue(
        opts.revenueSharePercent === null ? null : { revenueSharePercent: opts.revenueSharePercent ?? 10 },
      ),
    },
    invoice: {
      findFirst: jest.fn().mockResolvedValue(opts.existingInvoice ?? null),
      create: jest.fn(async ({ data }: any) => ({ id: 'inv-1', ...data })),
    },
  };
  const service = new BillingService(
    prisma as unknown as PrismaService, undefined,
    { invoiceIssuedHtml: jest.fn() } as any,
    { enqueue: jest.fn() } as any,
    { increment: jest.fn() } as any,
  );
  return { service, prisma };
}

const outcomeOf = (result: any, turnoverId: string) =>
  result.outcomes.find((o: any) => o.turnoverId === turnoverId);

describe('REVSHARE-02 — every row has exactly one observable outcome', () => {
  it('INVOICE_CREATED for a clean row', async () => {
    const { service } = build({
      turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
    });
    const result = await service.calculateRevenueShare('2026-09');

    expect(result.examined).toBe(1);
    expect(result.outcomes).toHaveLength(1);
    expect(outcomeOf(result, 'turnover-1')).toMatchObject({
      outcome: 'INVOICE_CREATED',
      currencyCode: 'VND',
      unitId: 'unit-1',
      tenantId: 'tenant-1',
      period: '2026-09',
    });
  });

  it('T11: NO_CONTRACT appears in the structured result rather than vanishing', async () => {
    const { service } = build({
      turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [] },
    });
    const result = await service.calculateRevenueShare('2026-09');

    expect(result.examined).toBe(1);
    expect(result.outcomes).toHaveLength(1);
    expect(outcomeOf(result, 'turnover-1')).toMatchObject({
      outcome: 'SKIPPED_WITH_REASON',
      code: 'NO_CONTRACT_FOR_TURNOVER_PERIOD',
      turnoverId: 'turnover-1',
      unitId: 'unit-1',
      tenantId: 'tenant-1',
      period: '2026-09',
    });
  });

  it('NO_AMOUNT_DUE when the contract has no revenue-share percentage', async () => {
    const { service } = build({
      turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
      revenueSharePercent: 0,
    });
    const result = await service.calculateRevenueShare('2026-09');
    expect(outcomeOf(result, 'turnover-1')).toMatchObject({
      outcome: 'NO_AMOUNT_DUE',
      code: 'NO_REVENUE_SHARE_PERCENT',
    });
  });

  it('NO_AMOUNT_DUE when the share does not exceed base rent', async () => {
    const { service } = build({
      // 10% of 5,000,000 = 500,000 < rent 1,000,000
      turnovers: [turnoverRow({ grossSales: 5_000_000 })],
      contractsByUnit: { 'unit-1': [contractRow()] },
    });
    const result = await service.calculateRevenueShare('2026-09');
    expect(outcomeOf(result, 'turnover-1')).toMatchObject({
      outcome: 'NO_AMOUNT_DUE',
      code: 'SHARE_BELOW_BASE_RENT',
    });
  });

  it('SKIPPED_WITH_REASON / ALREADY_BILLED when an invoice exists', async () => {
    const { service } = build({
      turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
      existingInvoice: { id: 'inv-old', invoiceNumber: 'RS-2026-00001' },
    });
    const result = await service.calculateRevenueShare('2026-09');
    expect(outcomeOf(result, 'turnover-1')).toMatchObject({
      outcome: 'SKIPPED_WITH_REASON',
      code: 'ALREADY_BILLED',
      invoiceNumber: 'RS-2026-00001',
    });
  });

  it('REJECTED for a currency mismatch', async () => {
    const { service } = build({
      turnovers: [turnoverRow({ currencyCode: 'VND' })],
      contractsByUnit: { 'unit-1': [contractRow({ currencyCode: 'USD', rent: 100 })] },
    });
    const result = await service.calculateRevenueShare('2026-09');
    expect(outcomeOf(result, 'turnover-1')).toMatchObject({
      outcome: 'REJECTED',
      code: 'REVENUE_SHARE_CURRENCY_MISMATCH',
    });
  });

  it('a mixed batch accounts for every single row exactly once', async () => {
    const turnovers = [
      turnoverRow({ id: 'ok', unitId: 'u-ok' }),
      turnoverRow({ id: 'nocontract', unitId: 'u-none' }),
      turnoverRow({ id: 'mismatch', unitId: 'u-usd' }),
      turnoverRow({ id: 'ambiguous', unitId: 'u-two' }),
      turnoverRow({ id: 'partial', unitId: 'u-split' }),
    ];
    const { service } = build({
      turnovers,
      contractsByUnit: {
        'u-ok': [contractRow({ unitId: 'u-ok' })],
        'u-none': [],
        'u-usd': [contractRow({ unitId: 'u-usd', currencyCode: 'USD', rent: 100 })],
        'u-two': [
          contractRow({ id: 'a', contractNumber: 'CTR-A', unitId: 'u-two' }),
          contractRow({ id: 'b', contractNumber: 'CTR-B', unitId: 'u-two' }),
        ],
        'u-split': [
          contractRow({ id: 'x', contractNumber: 'CTR-X', unitId: 'u-split',
            status: ContractStatus.TERMINATED,
            termination: { status: 'COMPLETED', effectiveDate: D(2026, 8, 15) } }),
        ],
      },
    });

    const result = await service.calculateRevenueShare('2026-09');

    expect(result.examined).toBe(5);
    expect(result.outcomes).toHaveLength(5);
    // Exactly one entry per turnover id — nothing lost, nothing duplicated.
    expect(new Set(result.outcomes.map((o: any) => o.turnoverId)).size).toBe(5);

    expect(outcomeOf(result, 'ok').outcome).toBe('INVOICE_CREATED');
    expect(outcomeOf(result, 'nocontract').code).toBe('NO_CONTRACT_FOR_TURNOVER_PERIOD');
    expect(outcomeOf(result, 'mismatch').code).toBe('REVENUE_SHARE_CURRENCY_MISMATCH');
    expect(outcomeOf(result, 'ambiguous').code).toBe('AMBIGUOUS_CONTRACT_FOR_TURNOVER_PERIOD');
    expect(outcomeOf(result, 'partial').code).toBe('AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED');

    // One bad row never blocks the others.
    expect(result.created).toBe(1);
  });
});

describe('RS-TERMINATED — end to end through revenue-share', () => {
  const terminatedMidSeptember = contractRow({
    status: ContractStatus.TERMINATED,
    termination: { status: 'COMPLETED', effectiveDate: D(2026, 8, 15) },
  });

  it('bills August, the month the terminated contract fully governed', async () => {
    const { service, prisma } = build({
      turnovers: [turnoverRow({ period: '2026-08' })],
      contractsByUnit: { 'unit-1': [terminatedMidSeptember] },
    });
    const result = await service.calculateRevenueShare('2026-08');
    expect(result.created).toBe(1);
    expect(prisma.invoice.create).toHaveBeenCalled();
  });

  it('refuses September, the month the termination fell inside', async () => {
    const { service, prisma } = build({
      turnovers: [turnoverRow({ period: '2026-09' })],
      contractsByUnit: { 'unit-1': [terminatedMidSeptember] },
    });
    const result = await service.calculateRevenueShare('2026-09');
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(outcomeOf(result, 'turnover-1').code).toBe('AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED');
  });

  it('refuses October, after the contract ended', async () => {
    const { service, prisma } = build({
      turnovers: [turnoverRow({ period: '2026-10' })],
      contractsByUnit: { 'unit-1': [terminatedMidSeptember] },
    });
    const result = await service.calculateRevenueShare('2026-10');
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(outcomeOf(result, 'turnover-1').code).toBe('NO_CONTRACT_FOR_TURNOVER_PERIOD');
  });
});

describe('T10: SalesService and BillingService resolve the same contract', () => {
  const candidates = [
    contractRow({
      status: ContractStatus.TERMINATED,
      currencyCode: 'USD' as CurrencyCode,
      // USD-scale rent, so 10% of 50,000 USD genuinely exceeds it.
      rent: 2_000,
      termination: { status: 'COMPLETED', effectiveDate: D(2026, 8, 15) },
    }),
  ];

  it('both accept August and both use the USD contract', async () => {
    // Billing: bills August against the terminated USD contract.
    const { service: billing, prisma: billingPrisma } = build({
      turnovers: [turnoverRow({ period: '2026-08', currencyCode: 'USD', grossSales: 50_000 })],
      contractsByUnit: { 'unit-1': candidates },
    });
    const result = await billing.calculateRevenueShare('2026-08');
    expect(result.created).toBe(1);
    expect(billingPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currencyCode: 'USD' }) }),
    );

    // Sales: validates a VND submission for the same period against the SAME
    // contract, and therefore rejects it.
    const salesPrisma: any = {
      salesTurnover: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      salesAuditTrail: { create: jest.fn() },
      contract: { findMany: jest.fn().mockResolvedValue(candidates) },
    };
    const sales = new SalesService(salesPrisma);
    await expect(
      sales.create({
        tenantId: 'tenant-1', unitId: 'unit-1', date: '2026-08-01', period: '2026-08',
        grossSales: 1, netSales: 1, currencyCode: 'VND' as CurrencyCode,
      }, 'user-1'),
    ).rejects.toMatchObject({ response: { code: 'TURNOVER_CURRENCY_MISMATCH', contractCurrency: 'USD' } });
  });

  it('both agree there is no governing contract for October', async () => {
    const { service: billing } = build({
      turnovers: [turnoverRow({ period: '2026-10' })],
      contractsByUnit: { 'unit-1': candidates },
    });
    const result = await billing.calculateRevenueShare('2026-10');
    expect(outcomeOf(result, 'turnover-1').code).toBe('NO_CONTRACT_FOR_TURNOVER_PERIOD');

    // Sales cannot validate currency either, so it records without blocking.
    const salesPrisma: any = {
      salesTurnover: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }: any) => ({ id: 's1', ...data })), update: jest.fn() },
      salesAuditTrail: { create: jest.fn() },
      contract: { findMany: jest.fn().mockResolvedValue(candidates) },
    };
    const sales = new SalesService(salesPrisma);
    await sales.create({
      tenantId: 'tenant-1', unitId: 'unit-1', date: '2026-10-01', period: '2026-10',
      grossSales: 1, netSales: 1, currencyCode: 'VND' as CurrencyCode,
    }, 'user-1');
    expect(salesPrisma.salesTurnover.create).toHaveBeenCalled();
  });
});
