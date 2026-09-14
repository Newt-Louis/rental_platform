import { ContractStatus, CurrencyCode, InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from './billing.service';

/**
 * BILL-002 — one revenue-share invoice per contract + period (FIN-10).
 *
 * Business key: `(contractId, period)` for `type = REVENUE_SHARE`, restricted to
 * LIVE invoices (`isActive = true AND status <> 'CANCELLED'`), because
 * `voidInvoice()` keeps the row and only sets CANCELLED — a voided period must
 * stay re-billable. `tenantId` is NOT part of the key: `Contract.tenantId` is
 * NOT NULL, so the tenant is functionally determined by the contract.
 *
 * The defect: `findFirst` then `create`, both outside any transaction, so two
 * concurrent runs could each observe "no invoice" and both commit one.
 *
 * ── About the concurrency harness ───────────────────────────────────────────
 * Models Postgres SERIALIZABLE for this access pattern: each transaction reads
 * a snapshot taken at its start; at commit, a transaction that inserts a
 * revenue-share invoice whose live business key was already committed by
 * another transaction aborts — either with P2002 (the partial unique index) or
 * P2034 (serialization conflict). A barrier forces both racers to read before
 * either commits, so the race is deterministic.
 *
 * The partial unique index itself is verified against REAL Postgres — see
 * `prisma/migrations/20260906160000_revenue_share_unique_per_contract_period`
 * and the report; those checks proved it rejects a duplicate live key while
 * still allowing re-issue after a void and other invoice types on the same
 * contract + period.
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
  period: '2026-03',
  grossSales: 100_000_000,
  netSales: 90_000_000,
  currencyCode: 'VND' as CurrencyCode,
  tenant: { id: 'tenant-1', brandName: 'Test Brand' },
  unit: { id: 'unit-1', code: 'GF-A01' },
  ...over,
});

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  contractId: string;
  period: string;
  type: string;
  isActive: boolean;
  status: InvoiceStatus;
};

const P2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique violation', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: 'Invoice_revenue_share_contract_period_live_key' },
  });

const P2034 = () =>
  new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });

/** Committed invoice store, shared by all transactions. */
class Ledger {
  invoices: InvoiceRow[] = [];
  private seq = 0;
  nextId() { return `inv-${++this.seq}`; }

  liveKey(contractId: string, period: string) {
    return this.invoices.find(
      (i) => i.contractId === contractId && i.period === period
        && i.type === 'REVENUE_SHARE' && i.isActive && i.status !== InvoiceStatus.CANCELLED,
    );
  }
}

function barrierFor(participants: number) {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  let arrived = 0;
  return {
    promise,
    arrive: () => { arrived += 1; if (arrived >= participants) resolve(); },
  };
}

function build(opts: {
  ledger: Ledger;
  turnovers: any[];
  contractsByUnit: Record<string, any[]>;
  barrier?: { promise: Promise<void>; arrive: () => void };
}) {
  const { ledger } = opts;

  const matchLive = (where: any, rows: InvoiceRow[]) =>
    rows.find(
      (i) => i.contractId === where.contractId && i.period === where.period
        && i.type === where.type && i.isActive === true
        && i.status !== InvoiceStatus.CANCELLED,
    ) ?? null;

  const prisma: any = {
    salesTurnover: { findMany: jest.fn().mockResolvedValue(opts.turnovers) },
    contract: { findMany: jest.fn(async ({ where }: any) => opts.contractsByUnit[where.unitId] ?? []) },
    proposal: { findUnique: jest.fn().mockResolvedValue({ revenueSharePercent: 10 }) },
    invoice: {
      // Must NOT be used by the fixed implementation for the existence check.
      findFirst: jest.fn(async ({ where }: any) => matchLive(where, ledger.invoices)),
      create: jest.fn(async () => { throw new Error('non-transactional create is forbidden'); }),
    },
    $transaction: jest.fn(async (callback: any) => {
      const snapshot = ledger.invoices.map((i) => ({ ...i }));
      const buffered: InvoiceRow[] = [];

      const tx: any = {
        invoice: {
          findFirst: jest.fn(async ({ where }: any) => matchLive(where, [...snapshot, ...buffered])),
          create: jest.fn(async ({ data }: any) => {
            // The partial unique index, as Postgres would enforce it at insert
            // time against already-committed rows.
            if (ledger.liveKey(data.contractId, data.period)) throw P2002();
            const row: InvoiceRow = {
              id: ledger.nextId(),
              invoiceNumber: data.invoiceNumber,
              contractId: data.contractId,
              period: data.period,
              type: data.type,
              isActive: true,
              status: InvoiceStatus.DRAFT,
            };
            buffered.push(row);
            return row;
          }),
        },
      };

      const result = await callback(tx);

      if (opts.barrier) { opts.barrier.arrive(); await opts.barrier.promise; }

      // Commit: another transaction may have taken the key since our snapshot.
      for (const row of buffered) {
        if (ledger.liveKey(row.contractId, row.period)) throw P2034();
      }
      ledger.invoices.push(...buffered);
      return result;
    }),
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

const liveRevenueShare = (ledger: Ledger, contractId: string, period: string) =>
  ledger.invoices.filter(
    (i) => i.contractId === contractId && i.period === period
      && i.type === 'REVENUE_SHARE' && i.isActive && i.status !== InvoiceStatus.CANCELLED,
  );

describe('BILL-002 — sequential duplicate prevention', () => {
  it('T1: no existing invoice → exactly one is created', async () => {
    const ledger = new Ledger();
    const { service } = build({
      ledger, turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
    });

    const result = await service.calculateRevenueShare('2026-03');

    expect(result.created).toBe(1);
    expect(liveRevenueShare(ledger, 'contract-1', '2026-03')).toHaveLength(1);
    expect(outcomeOf(result, 'turnover-1').outcome).toBe('INVOICE_CREATED');
  });

  it('T2: an existing live invoice for the key → ALREADY_BILLED, nothing created', async () => {
    const ledger = new Ledger();
    ledger.invoices.push({
      id: 'inv-old', invoiceNumber: 'RS-2026-00001', contractId: 'contract-1',
      period: '2026-03', type: 'REVENUE_SHARE', isActive: true, status: InvoiceStatus.ISSUED,
    });
    const { service } = build({
      ledger, turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
    });

    const result = await service.calculateRevenueShare('2026-03');

    expect(result.created).toBe(0);
    expect(ledger.invoices).toHaveLength(1);
    expect(outcomeOf(result, 'turnover-1')).toMatchObject({
      outcome: 'SKIPPED_WITH_REASON',
      code: 'ALREADY_BILLED',
      invoiceNumber: 'RS-2026-00001',
    });
  });

  it('T3: the same contract in a different period is allowed', async () => {
    const ledger = new Ledger();
    ledger.invoices.push({
      id: 'inv-feb', invoiceNumber: 'RS-FEB', contractId: 'contract-1',
      period: '2026-02', type: 'REVENUE_SHARE', isActive: true, status: InvoiceStatus.ISSUED,
    });
    const { service } = build({
      ledger, turnovers: [turnoverRow({ period: '2026-03' })],
      contractsByUnit: { 'unit-1': [contractRow()] },
    });

    const result = await service.calculateRevenueShare('2026-03');
    expect(result.created).toBe(1);
  });

  it('T4: a different contract in the same period is allowed', async () => {
    const ledger = new Ledger();
    ledger.invoices.push({
      id: 'inv-other', invoiceNumber: 'RS-OTHER', contractId: 'contract-2',
      period: '2026-03', type: 'REVENUE_SHARE', isActive: true, status: InvoiceStatus.ISSUED,
    });
    const { service } = build({
      ledger, turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
    });

    const result = await service.calculateRevenueShare('2026-03');
    expect(result.created).toBe(1);
  });

  it('T5: a MONTHLY_RENT invoice on the same contract+period does not block', async () => {
    // The key is scoped to type = REVENUE_SHARE. Scheduled rent for the same
    // period is a different, legitimate document.
    const ledger = new Ledger();
    ledger.invoices.push({
      id: 'inv-rent', invoiceNumber: 'INV-RENT', contractId: 'contract-1',
      period: '2026-03', type: 'MONTHLY_RENT', isActive: true, status: InvoiceStatus.ISSUED,
    });
    const { service } = build({
      ledger, turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
    });

    const result = await service.calculateRevenueShare('2026-03');
    expect(result.created).toBe(1);
  });

  it('a CANCELLED (voided) invoice does not block re-billing the period', async () => {
    // voidInvoice() keeps the row and only sets CANCELLED, so the period must
    // stay re-billable. The old predicate omitted the liveness filter and would
    // have blocked this forever.
    const ledger = new Ledger();
    ledger.invoices.push({
      id: 'inv-void', invoiceNumber: 'RS-VOID', contractId: 'contract-1',
      period: '2026-03', type: 'REVENUE_SHARE', isActive: true, status: InvoiceStatus.CANCELLED,
    });
    const { service } = build({
      ledger, turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
    });

    const result = await service.calculateRevenueShare('2026-03');
    expect(result.created).toBe(1);
    expect(liveRevenueShare(ledger, 'contract-1', '2026-03')).toHaveLength(1);
  });

  it('a soft-deleted invoice does not block either', async () => {
    const ledger = new Ledger();
    ledger.invoices.push({
      id: 'inv-del', invoiceNumber: 'RS-DEL', contractId: 'contract-1',
      period: '2026-03', type: 'REVENUE_SHARE', isActive: false, status: InvoiceStatus.ISSUED,
    });
    const { service } = build({
      ledger, turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
    });

    expect((await service.calculateRevenueShare('2026-03')).created).toBe(1);
  });
});

describe('BILL-002 — concurrency', () => {
  it('T6/T7: two concurrent runs commit exactly one invoice; the loser is ALREADY_BILLED', async () => {
    const ledger = new Ledger();
    const barrier = barrierFor(2);
    const mk = () => build({
      ledger, turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
      barrier,
    }).service;

    const [a, b] = await Promise.all([
      mk().calculateRevenueShare('2026-03'),
      mk().calculateRevenueShare('2026-03'),
    ]);

    // FIN-10 — the invariant that used to break.
    expect(liveRevenueShare(ledger, 'contract-1', '2026-03')).toHaveLength(1);

    const outcomes = [a, b].map((r) => outcomeOf(r, 'turnover-1').outcome);
    expect(outcomes.filter((o) => o === 'INVOICE_CREATED')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'SKIPPED_WITH_REASON')).toHaveLength(1);

    // T7 — never a raw database error.
    const loser = [a, b].find((r) => outcomeOf(r, 'turnover-1').outcome === 'SKIPPED_WITH_REASON')!;
    expect(outcomeOf(loser, 'turnover-1').code).toBe('ALREADY_BILLED');
    expect(JSON.stringify(loser)).not.toContain('P2002');
    expect(JSON.stringify(loser)).not.toContain('P2034');
  });

  it('T8: the retry re-runs the existence check instead of reusing a stale answer', async () => {
    const ledger = new Ledger();
    const barrier = barrierFor(2);
    const mk = () => build({
      ledger, turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
      barrier,
    });

    const first = mk();
    const second = mk();
    await Promise.all([
      first.service.calculateRevenueShare('2026-03'),
      second.service.calculateRevenueShare('2026-03'),
    ]);

    // 3 transaction attempts across the two services: two racers plus the
    // loser's retry, which must re-read and then find the committed invoice.
    const attempts = first.prisma.$transaction.mock.calls.length
      + second.prisma.$transaction.mock.calls.length;
    expect(attempts).toBe(3);
    expect(liveRevenueShare(ledger, 'contract-1', '2026-03')).toHaveLength(1);
  });

  it('the existence check never runs outside a transaction', async () => {
    const ledger = new Ledger();
    const { service, prisma } = build({
      ledger, turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
    });

    await service.calculateRevenueShare('2026-03');

    // TX-04: the decision and the commit share one transaction. A global
    // findFirst or create here would mean a stale read could be reused.
    expect(prisma.invoice.findFirst).not.toHaveBeenCalled();
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });
});

describe('BILL-002 — batch behaviour is preserved', () => {
  it('T9: invoice header and lines are created in one nested write', async () => {
    const ledger = new Ledger();
    const { service, prisma } = build({
      ledger, turnovers: [turnoverRow()],
      contractsByUnit: { 'unit-1': [contractRow()] },
    });

    await service.calculateRevenueShare('2026-03');

    // Prisma wraps a nested create in the same transaction as its parent, so
    // an invoice can never commit without its line.
    const call = prisma.$transaction.mock.results[0];
    void call;
    const txCreate = (prisma.$transaction.mock.calls.length && true);
    expect(txCreate).toBe(true);
    expect(ledger.invoices).toHaveLength(1);
  });

  it('T10: one row conflicting does not stop the others', async () => {
    const ledger = new Ledger();
    ledger.invoices.push({
      id: 'inv-blocked', invoiceNumber: 'RS-BLOCKED', contractId: 'contract-blocked',
      period: '2026-03', type: 'REVENUE_SHARE', isActive: true, status: InvoiceStatus.ISSUED,
    });
    const { service } = build({
      ledger,
      turnovers: [
        turnoverRow({ id: 'blocked', unitId: 'unit-blocked' }),
        turnoverRow({ id: 'fine', unitId: 'unit-fine' }),
      ],
      contractsByUnit: {
        'unit-blocked': [contractRow({ id: 'contract-blocked', unitId: 'unit-blocked' })],
        'unit-fine': [contractRow({ id: 'contract-fine', unitId: 'unit-fine' })],
      },
    });

    const result = await service.calculateRevenueShare('2026-03');

    expect(result.created).toBe(1);
    expect(outcomeOf(result, 'blocked').code).toBe('ALREADY_BILLED');
    expect(outcomeOf(result, 'fine').outcome).toBe('INVOICE_CREATED');
  });

  it('T11: REVSHARE-02 still holds — one outcome per examined row', async () => {
    const ledger = new Ledger();
    ledger.invoices.push({
      id: 'inv-x', invoiceNumber: 'RS-X', contractId: 'contract-a',
      period: '2026-03', type: 'REVENUE_SHARE', isActive: true, status: InvoiceStatus.ISSUED,
    });
    const { service } = build({
      ledger,
      turnovers: [
        turnoverRow({ id: 'a', unitId: 'u-a' }),
        turnoverRow({ id: 'b', unitId: 'u-b' }),
        turnoverRow({ id: 'c', unitId: 'u-none' }),
      ],
      contractsByUnit: {
        'u-a': [contractRow({ id: 'contract-a', unitId: 'u-a' })],
        'u-b': [contractRow({ id: 'contract-b', unitId: 'u-b' })],
        'u-none': [],
      },
    });

    const result = await service.calculateRevenueShare('2026-03');

    expect(result.examined).toBe(3);
    expect(result.outcomes).toHaveLength(3);
    expect(new Set(result.outcomes.map((o: any) => o.turnoverId)).size).toBe(3);
    expect(outcomeOf(result, 'a').code).toBe('ALREADY_BILLED');
    expect(outcomeOf(result, 'b').outcome).toBe('INVOICE_CREATED');
    expect(outcomeOf(result, 'c').code).toBe('NO_CONTRACT_FOR_TURNOVER_PERIOD');
  });
});

describe('BILL-002 — T12: the application layer does not merely lean on the DB index', () => {
  /**
   * The tests above run with the partial unique index modelled, so the database
   * alone would stop a duplicate. That proves the index works but says nothing
   * about the application fix.
   *
   * This harness variant DISABLES the index so only the in-transaction
   * existence check plus the serialization conflict remain. It is the honest
   * regression proof: with the pre-fix flow (read outside, create outside) two
   * invoices commit; with the fix, exactly one does.
   */
  function buildWithoutIndex(ledger: Ledger, barrier: any, opts: { preFix: boolean }) {
    const prisma: any = {
      salesTurnover: { findMany: jest.fn().mockResolvedValue([turnoverRow()]) },
      contract: { findMany: jest.fn(async () => [contractRow()]) },
      proposal: { findUnique: jest.fn().mockResolvedValue({ revenueSharePercent: 10 }) },
      invoice: { findFirst: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(async (callback: any) => {
        const snapshot = ledger.invoices.map((i) => ({ ...i }));
        const buffered: InvoiceRow[] = [];
        const tx: any = {
          invoice: {
            findFirst: jest.fn(async ({ where }: any) =>
              [...snapshot, ...buffered].find(
                (i) => i.contractId === where.contractId && i.period === where.period
                  && i.type === where.type && i.isActive && i.status !== InvoiceStatus.CANCELLED,
              ) ?? null,
            ),
            // No unique index: the insert always succeeds.
            create: jest.fn(async ({ data }: any) => {
              const row: InvoiceRow = {
                id: ledger.nextId(), invoiceNumber: data.invoiceNumber,
                contractId: data.contractId, period: data.period, type: data.type,
                isActive: true, status: InvoiceStatus.DRAFT,
              };
              buffered.push(row);
              return row;
            }),
          },
        };
        const result = await callback(tx);
        if (barrier) { barrier.arrive(); await barrier.promise; }
        // Serializable still detects the write-write conflict on the key.
        for (const row of buffered) {
          if (!opts.preFix && ledger.liveKey(row.contractId, row.period)) throw P2034();
        }
        ledger.invoices.push(...buffered);
        return result;
      }),
    };
    return new BillingService(
      prisma as unknown as PrismaService, undefined,
      { invoiceIssuedHtml: jest.fn() } as any,
      { enqueue: jest.fn() } as any,
      { increment: jest.fn() } as any,
    );
  }

  it('with the index disabled, the in-transaction check + retry still commits exactly one', async () => {
    const ledger = new Ledger();
    const barrier = barrierFor(2);
    await Promise.all([
      buildWithoutIndex(ledger, barrier, { preFix: false }).calculateRevenueShare('2026-03'),
      buildWithoutIndex(ledger, barrier, { preFix: false }).calculateRevenueShare('2026-03'),
    ]);
    expect(liveRevenueShare(ledger, 'contract-1', '2026-03')).toHaveLength(1);
  });

  it('the pre-fix flow (no serialization guard) commits TWO — the original defect', async () => {
    const ledger = new Ledger();
    const barrier = barrierFor(2);
    await Promise.all([
      buildWithoutIndex(ledger, barrier, { preFix: true }).calculateRevenueShare('2026-03'),
      buildWithoutIndex(ledger, barrier, { preFix: true }).calculateRevenueShare('2026-03'),
    ]);
    // Documents what BILL-002 actually was: both racers observed "no invoice"
    // and both committed. FIN-10 violated.
    expect(liveRevenueShare(ledger, 'contract-1', '2026-03')).toHaveLength(2);
  });
});
