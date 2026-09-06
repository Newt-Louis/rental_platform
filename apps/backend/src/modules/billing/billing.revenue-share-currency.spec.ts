import { CurrencyCode } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from './billing.service';
import { SalesService } from '../sales/sales.service';

/**
 * CUR-001 — revenue-share currency integrity.
 *
 * MON-CUR-RS-01  every SalesTurnover amount has an explicit currency
 * MON-CUR-RS-02  revenue-share operands share one currency
 * MON-CUR-RS-03  no implicit FX conversion
 * MON-CUR-RS-04  the invoice carries the validated calculation currency
 *
 * The defect: `shareAmount = grossSales * pct - contract.rent` subtracted a
 * Contract-currency rent from a currency-less turnover figure, then stamped the
 * Contract's currency on the resulting invoice. The shipped seed made this
 * reachable — VND-scale turnover against USD and MMK contracts.
 */

const contractOf = (over: Partial<any> = {}) => ({
  id: 'contract-1',
  contractNumber: 'CTR-2026-0001',
  tenantId: 'tenant-1',
  unitId: 'unit-1',
  proposalId: 'proposal-1',
  currencyCode: 'VND' as CurrencyCode,
  rent: 1_000_000,
  isActive: true,
  status: 'ACTIVE',
  // Covers all of 2026 so the period resolver matches '2026-03' by default.
  startDate: new Date(Date.UTC(2026, 0, 1)),
  endDate: new Date(Date.UTC(2026, 11, 31)),
  unit: { id: 'unit-1', mallId: 'mall-1' },
  ...over,
});

const turnoverOf = (over: Partial<any> = {}) => ({
  id: 'turnover-1',
  tenantId: 'tenant-1',
  unitId: 'unit-1',
  period: '2026-03',
  grossSales: 100_000_000,
  netSales: 90_000_000,
  currencyCode: 'VND' as CurrencyCode | null,
  tenant: { id: 'tenant-1', brandName: 'Test Brand' },
  unit: { id: 'unit-1', code: 'GF-A01' },
  ...over,
});

function buildBilling(opts: { turnover: any; contract: any | null }) {
  const created: any[] = [];
  const prisma: any = {
    salesTurnover: { findMany: jest.fn().mockResolvedValue([opts.turnover]) },
    contract: { findMany: jest.fn().mockResolvedValue(opts.contract ? [opts.contract] : []) },
    proposal: { findUnique: jest.fn().mockResolvedValue({ revenueSharePercent: 10 }) },
    invoice: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `inv-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      }),
    },
    // BILL-002: creation runs inside runSerializableTransaction, so the mock
    // must hand the callback a tx client carrying the invoice methods.
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
  };
  const service = new BillingService(
    prisma as unknown as PrismaService,
    undefined,
    { invoiceIssuedHtml: jest.fn() } as any,
    { enqueue: jest.fn() } as any,
    { increment: jest.fn() } as any,
  );
  return { service, prisma, created };
}

describe('CUR-001 — matching currencies produce a valid revenue-share invoice', () => {
  it.each([
    ['VND', 100_000_000, 1_000_000],
    ['USD', 5_000, 100],
    ['MMK', 20_000_000, 200_000],
  ] as const)('T1-3: %s contract + %s turnover is billed', async (ccy, gross, rent) => {
    const { service, created } = buildBilling({
      turnover: turnoverOf({ grossSales: gross, currencyCode: ccy }),
      contract: contractOf({ currencyCode: ccy, rent }),
    });

    const result = await service.calculateRevenueShare('2026-03');

    expect(result.created).toBe(1);
    expect(result.rejectedCount).toBe(0);
    // MON-CUR-RS-04
    expect(created[0].currencyCode).toBe(ccy);
    // shareAmount = gross * 10% - rent, both operands in `ccy`.
    expect(created[0].subtotal).toBeCloseTo(gross * 0.1 - rent, 2);
  });

  it('T7: notes and line description carry the real currency, not a hardcoded VNĐ', async () => {
    const { service, created } = buildBilling({
      turnover: turnoverOf({ grossSales: 5_000, currencyCode: 'USD' }),
      contract: contractOf({ currencyCode: 'USD', rent: 100 }),
    });

    await service.calculateRevenueShare('2026-03');

    expect(created[0].notes).toContain('USD');
    expect(created[0].notes).not.toContain('VNĐ');
    const line = created[0].lines.create[0];
    expect(line.description).toContain('USD');
    expect(line.description).not.toContain('VNĐ');
  });
});

describe('CUR-001 — mismatched or missing currency fails closed', () => {
  it('T4/T10: a USD contract with VND-scale turnover produces NO invoice', async () => {
    // This is the pre-fix defect verbatim: seed-style VND turnover (363M)
    // against a USD contract. It used to compute 36,324,745 - 100 = a nonsense
    // figure and issue it as a USD invoice.
    const { service, created, prisma } = buildBilling({
      turnover: turnoverOf({ grossSales: 363_247_454, currencyCode: 'VND' }),
      contract: contractOf({ currencyCode: 'USD', rent: 100 }),
    });

    const result = await service.calculateRevenueShare('2026-03');

    expect(result.created).toBe(0);
    expect(created).toHaveLength(0);
    expect(prisma.invoice.create).not.toHaveBeenCalled();

    expect(result.rejectedCount).toBe(1);
    expect(result.rejected[0]).toMatchObject({
      code: 'REVENUE_SHARE_CURRENCY_MISMATCH',
      contractId: 'contract-1',
      turnoverId: 'turnover-1',
      turnoverCurrency: 'VND',
      contractCurrency: 'USD',
    });
  });

  it('rejects an MMK contract fed VND turnover', async () => {
    const { service, created } = buildBilling({
      turnover: turnoverOf({ grossSales: 537_160_954, currencyCode: 'VND' }),
      contract: contractOf({ currencyCode: 'MMK', rent: 200_000 }),
    });

    const result = await service.calculateRevenueShare('2026-03');
    expect(created).toHaveLength(0);
    expect(result.rejected[0].code).toBe('REVENUE_SHARE_CURRENCY_MISMATCH');
  });

  it('T5: turnover with NO currency is never billed', async () => {
    const { service, created } = buildBilling({
      turnover: turnoverOf({ currencyCode: null }),
      contract: contractOf({ currencyCode: 'VND' }),
    });

    const result = await service.calculateRevenueShare('2026-03');

    expect(created).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
    expect(result.rejected[0]).toMatchObject({
      code: 'REVENUE_SHARE_CURRENCY_MISSING',
      turnoverCurrency: null,
      contractCurrency: 'VND',
    });
  });

  it('T8: a rejected row is reported, not silently skipped, and does not block others', async () => {
    const good = turnoverOf({ id: 'turnover-good', unitId: 'unit-2', currencyCode: 'VND' });
    const bad = turnoverOf({ id: 'turnover-bad', unitId: 'unit-1', currencyCode: null });

    const prisma: any = {
      salesTurnover: { findMany: jest.fn().mockResolvedValue([bad, good]) },
      contract: {
        findMany: jest.fn(async ({ where }: any) => [
          contractOf({
            id: `contract-${where.unitId}`,
            unitId: where.unitId,
            currencyCode: 'VND',
          }),
        ]),
      },
      proposal: { findUnique: jest.fn().mockResolvedValue({ revenueSharePercent: 10 }) },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ id: 'inv-1', ...data })),
      },
    // BILL-002: creation runs inside runSerializableTransaction, so the mock
    // must hand the callback a tx client carrying the invoice methods.
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    const service = new BillingService(
      prisma as unknown as PrismaService, undefined,
      { invoiceIssuedHtml: jest.fn() } as any,
      { enqueue: jest.fn() } as any,
      { increment: jest.fn() } as any,
    );

    const result = await service.calculateRevenueShare('2026-03');

    expect(result.created).toBe(1);
    expect(result.rejectedCount).toBe(1);
    expect(result.rejected[0].turnoverId).toBe('turnover-bad');
  });

  it('MON-CUR-RS-03: no FX conversion is attempted anywhere on the reject path', async () => {
    const { service, created } = buildBilling({
      turnover: turnoverOf({ grossSales: 1_000_000, currencyCode: 'VND' }),
      contract: contractOf({ currencyCode: 'USD', rent: 10 }),
    });

    const result = await service.calculateRevenueShare('2026-03');

    // Not converted at any rate — simply not billed.
    expect(created).toHaveLength(0);
    expect(result.created).toBe(0);
  });
});

describe('CUR-001 — turnover write path requires and validates currency', () => {
  function buildSales(contract: any | null) {
    const prisma: any = {
      salesTurnover: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ id: 'sales-1', ...data })),
        update: jest.fn(),
      },
      salesAuditTrail: { create: jest.fn() },
      // SalesService validates through the same period resolver as billing.
      contract: { findMany: jest.fn().mockResolvedValue(contract ? [contract] : []) },
    };
    return { service: new SalesService(prisma), prisma };
  }

  const dto = {
    tenantId: 'tenant-1', unitId: 'unit-1', date: '2026-03-01', period: '2026-03',
    grossSales: 100_000_000, netSales: 90_000_000, currencyCode: 'VND' as CurrencyCode,
  };

  it('T9: persists the explicit currency on create', async () => {
    const { service, prisma } = buildSales(contractOf({ currencyCode: 'VND' }));
    await service.create(dto, 'user-1');
    expect(prisma.salesTurnover.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ currencyCode: 'VND' }),
    });
  });

  it('T9: rejects a turnover currency that differs from the live contract', async () => {
    const { service, prisma } = buildSales(contractOf({ currencyCode: 'USD' }));
    await expect(service.create(dto, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(dto, 'user-1')).rejects.toMatchObject({
      response: {
        code: 'TURNOVER_CURRENCY_MISMATCH',
        contractCurrency: 'USD',
        turnoverCurrency: 'VND',
      },
    });
    expect(prisma.salesTurnover.create).not.toHaveBeenCalled();
  });

  it('records turnover with no live contract, currency still explicit', async () => {
    const { service, prisma } = buildSales(null);
    await service.create({ ...dto, currencyCode: 'MMK' }, 'user-1');
    expect(prisma.salesTurnover.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ currencyCode: 'MMK' }),
    });
  });

  it('carries the currency through a revision of an existing period', async () => {
    const { service, prisma } = buildSales(contractOf({ currencyCode: 'VND' }));
    prisma.salesTurnover.findUnique.mockResolvedValue({ id: 'sales-1', grossSales: 50 });
    prisma.salesTurnover.update.mockResolvedValue({ id: 'sales-1' });

    await service.create(dto, 'user-1');

    expect(prisma.salesTurnover.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currencyCode: 'VND' }) }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INT-002-SEED — deterministic contract resolution by turnover period
// ═══════════════════════════════════════════════════════════════════════════

describe('REVSHARE-01 — revenue-share resolves exactly one contract by period', () => {
  const period = '2026-03';
  const covering = {
    startDate: new Date(Date.UTC(2026, 0, 1)),
    endDate: new Date(Date.UTC(2026, 11, 31)),
  };

  function buildWithCandidates(candidates: any[]) {
    const prisma: any = {
      salesTurnover: {
        findMany: jest.fn().mockResolvedValue([turnoverOf({ currencyCode: 'VND' })]),
      },
      contract: { findMany: jest.fn().mockResolvedValue(candidates) },
      proposal: { findUnique: jest.fn().mockResolvedValue({ revenueSharePercent: 10 }) },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ id: 'inv-1', ...data })),
      },
    // BILL-002: creation runs inside runSerializableTransaction, so the mock
    // must hand the callback a tx client carrying the invoice methods.
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    const service = new BillingService(
      prisma as unknown as PrismaService, undefined,
      { invoiceIssuedHtml: jest.fn() } as any,
      { enqueue: jest.fn() } as any,
      { increment: jest.fn() } as any,
    );
    return { service, prisma };
  }

  it('bills when exactly one contract covers the period', async () => {
    const { service, prisma } = buildWithCandidates([
      { ...contractOf({ currencyCode: 'VND' }), ...covering, proposalId: 'proposal-1' },
    ]);
    const result = await service.calculateRevenueShare(period);
    expect(result.created).toBe(1);
    expect(prisma.invoice.create).toHaveBeenCalled();
  });

  it('refuses to bill when two contracts cover the period (the seeded GF-A01 shape)', async () => {
    const { service, prisma } = buildWithCandidates([
      { ...contractOf({ id: 'usd', contractNumber: 'CTR-USD', currencyCode: 'USD' }), ...covering, proposalId: 'p1' },
      { ...contractOf({ id: 'vnd', contractNumber: 'CTR-VND', currencyCode: 'VND' }), ...covering, proposalId: 'p2' },
    ]);

    const result = await service.calculateRevenueShare(period);

    expect(result.created).toBe(0);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(result.rejectedCount).toBe(1);
    expect(result.rejected[0]).toMatchObject({
      code: 'AMBIGUOUS_CONTRACT_FOR_TURNOVER_PERIOD',
      matchingContractNumbers: ['CTR-USD', 'CTR-VND'],
      currencies: ['USD', 'VND'],
      period,
    });
  });

  it('reports a split period rather than picking a half-covering contract', async () => {
    const { service, prisma } = buildWithCandidates([
      { ...contractOf({ id: 'a', contractNumber: 'CTR-A' }),
        startDate: new Date(Date.UTC(2026, 0, 1)), endDate: new Date(Date.UTC(2026, 2, 15)), proposalId: 'p1' },
      { ...contractOf({ id: 'b', contractNumber: 'CTR-B' }),
        startDate: new Date(Date.UTC(2026, 2, 16)), endDate: new Date(Date.UTC(2027, 2, 15)), proposalId: 'p2' },
    ]);

    const result = await service.calculateRevenueShare(period);

    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(result.rejected[0].code).toBe('AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED');
  });

  it('reports a no-contract unit as SKIPPED, never as a rejection and never silently', async () => {
    const { service } = buildWithCandidates([]);
    const result = await service.calculateRevenueShare(period);
    expect(result.created).toBe(0);
    // REVSHARE-02: visible in the ledger...
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]).toMatchObject({
      outcome: 'SKIPPED_WITH_REASON',
      code: 'NO_CONTRACT_FOR_TURNOVER_PERIOD',
    });
    expect(result.skippedCount).toBe(1);
    // ...but an uncontracted unit is an ordinary case, so it must not pollute
    // the operator's action list.
    expect(result.rejectedCount).toBe(0);
  });

  it('rejects when the covering contract belongs to a different tenant', async () => {
    const { service, prisma } = buildWithCandidates([
      { ...contractOf({ tenantId: 'someone-else' }), ...covering, proposalId: 'p1' },
    ]);
    const result = await service.calculateRevenueShare(period);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(result.rejected[0].code).toBe('CONTRACT_TENANT_MISMATCH');
  });

  it('never queries with an unordered findFirst', async () => {
    const { service, prisma } = buildWithCandidates([
      { ...contractOf(), ...covering, proposalId: 'p1' },
    ]);
    await service.calculateRevenueShare(period);
    // findMany + in-memory deterministic resolution, never findFirst.
    expect(prisma.contract.findMany).toHaveBeenCalled();
    expect((prisma.contract as any).findFirst).toBeUndefined();
  });
});
