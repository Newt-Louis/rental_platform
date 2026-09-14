import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from './billing.service';

/**
 * BILL-001 — concurrent payments must never overpay an invoice.
 *
 * PAY-02  sum(non-reversed committed Payments) <= invoice payable amount
 * TX-03   every precondition approving a concurrent financial write is
 *         evaluated inside the same retryable Serializable transaction
 *
 * The defect: the balance check ran BEFORE `runSerializableTransaction`, and the
 * retry re-ran only the callback. Two concurrent payments each individually
 * within the balance therefore both committed.
 *
 * ── About this harness ───────────────────────────────────────────────────────
 * These tests model Postgres SERIALIZABLE for the one access pattern that
 * matters here: read invoice + payments, insert a payment, update the invoice
 * row. Each transaction reads a snapshot taken at its start; at commit time, if
 * another transaction has written the same invoice row since that snapshot, the
 * committer aborts with P2034 — exactly what Postgres does on a write-write
 * conflict, and what `runSerializableTransaction` retries on.
 *
 * A `snapshotBarrier` forces both transactions to take their snapshot before
 * either commits, so the race is deterministic rather than timing-dependent.
 *
 * VERIFIED AGAINST THE PRE-FIX CODE: with the balance check hoisted back out of
 * the callback, "60 + 60 against a 100 invoice" commits 120 and this suite fails.
 */

type PaymentRow = {
  id: string;
  invoiceId: string;
  amount: number;
  reversedAt: Date | null;
  idempotencyKey?: string | null;
  idempotencyHash?: string | null;
};

type InvoiceRow = {
  id: string;
  tenantId: string | null;
  billingPartyId: string | null;
  status: InvoiceStatus;
  currencyCode: 'VND';
  totalAmount: number;
  adjustmentAmount: number;
  refundedAmount: number;
  issuedAt: Date | null;
  dueDate: Date;
  sourceType: string | null;
  sourceId: string | null;
  paidAt: Date | null;
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

/** In-memory store modelling the committed state of one invoice + its payments. */
class Ledger {
  invoice: InvoiceRow;
  payments: PaymentRow[] = [];
  /** Bumped on every committed write to the invoice row. */
  version = 0;
  private seq = 0;

  constructor(overrides: Partial<InvoiceRow> = {}) {
    this.invoice = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      billingPartyId: null,
      status: InvoiceStatus.ISSUED,
      currencyCode: 'VND',
      totalAmount: 100,
      adjustmentAmount: 0,
      refundedAmount: 0,
      issuedAt: new Date('2026-01-01'),
      dueDate: new Date('2026-02-01'),
      sourceType: null,
      sourceId: null,
      paidAt: null,
      ...overrides,
    };
  }

  nextId() { return `payment-${++this.seq}`; }

  activeTotal() {
    return this.payments.filter((p) => !p.reversedAt).reduce((s, p) => s + p.amount, 0);
  }
}

const P2034 = () =>
  new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });

/**
 * Builds a prisma double whose `$transaction` gives each caller a snapshot and
 * aborts the loser of a write-write race on the invoice row.
 */
function buildPrisma(ledger: Ledger, opts: { barrier?: { promise: Promise<void>; arrive: () => void } } = {}) {
  const prisma: any = {
    invoice: {
      findUnique: jest.fn(async ({ include }: any) => ({
        ...ledger.invoice,
        ...(include?.payments
          ? { payments: ledger.payments.filter((p) => !p.reversedAt) }
          : { payments: ledger.payments }),
      })),
    },
    payment: {
      findUnique: jest.fn(async ({ where }: any) =>
        ledger.payments.find((p) => p.idempotencyKey === where.idempotencyKey) ?? null,
      ),
    },
    $transaction: jest.fn(async (callback: any) => {
      // ── snapshot ──
      const snapshotVersion = ledger.version;
      const snapshotInvoice = { ...ledger.invoice };
      const snapshotPayments = ledger.payments.map((p) => ({ ...p }));

      const buffered: { payments: PaymentRow[]; invoicePatch: Partial<InvoiceRow> | null } = {
        payments: [],
        invoicePatch: null,
      };

      const tx: any = {
        invoice: {
          findUnique: jest.fn(async ({ include }: any) => {
            const payments = [...snapshotPayments, ...buffered.payments];
            return {
              ...snapshotInvoice,
              ...(buffered.invoicePatch ?? {}),
              payments: include?.payments?.where?.reversedAt === null
                ? payments.filter((p) => !p.reversedAt)
                : payments,
            };
          }),
          update: jest.fn(async ({ data }: any) => {
            buffered.invoicePatch = { ...(buffered.invoicePatch ?? {}), ...data };
            return { ...snapshotInvoice, ...buffered.invoicePatch };
          }),
        },
        payment: {
          create: jest.fn(async ({ data }: any) => {
            const duplicateKey =
              data.idempotencyKey &&
              [...snapshotPayments, ...buffered.payments].some(
                (p) => p.idempotencyKey === data.idempotencyKey,
              );
            if (duplicateKey) {
              throw new Prisma.PrismaClientKnownRequestError('unique', {
                code: 'P2002',
                clientVersion: 'test',
              });
            }
            const row: PaymentRow = {
              id: ledger.nextId(),
              invoiceId: data.invoiceId,
              amount: data.amount,
              reversedAt: null,
              idempotencyKey: data.idempotencyKey ?? null,
              idempotencyHash: data.idempotencyHash ?? null,
            };
            buffered.payments.push(row);
            return row;
          }),
          findUnique: jest.fn(async ({ where }: any) =>
            [...snapshotPayments, ...buffered.payments].find(
              (p) => p.idempotencyKey === where.idempotencyKey,
            ) ?? null,
          ),
          findMany: jest.fn(async () =>
            [...snapshotPayments, ...buffered.payments].filter((p) => !p.reversedAt),
          ),
        },
        serviceContractPayment: { updateMany: jest.fn() },
        parkingMonthlyStatement: { findUnique: jest.fn(async () => null), update: jest.fn() },
      };

      const result = await callback(tx);

      // Both racers must have read before either commits.
      if (opts.barrier) {
        opts.barrier.arrive();
        await opts.barrier.promise;
      }

      // ── commit: abort if the invoice row moved under us ──
      if (ledger.version !== snapshotVersion) throw P2034();
      ledger.payments.push(...buffered.payments);
      if (buffered.invoicePatch) Object.assign(ledger.invoice, buffered.invoicePatch);
      ledger.version += 1;
      return result;
    }),
  };
  return prisma;
}

function buildService(prisma: any) {
  return new BillingService(
    prisma as unknown as PrismaService,
    undefined,
    { invoiceIssuedHtml: jest.fn() } as any,
    { enqueue: jest.fn() } as any,
    { increment: jest.fn() } as any,
  );
}

/** Two racers that both take their snapshot before either commits. */
function barrierFor(participants: number) {
  const gate = deferred();
  let arrived = 0;
  return {
    promise: gate.promise,
    arrive: () => {
      arrived += 1;
      if (arrived >= participants) gate.resolve();
    },
  };
}

const pay = (amount: number, extra: Record<string, unknown> = {}) => ({
  amount,
  method: PaymentMethod.BANK_TRANSFER,
  ...extra,
});

describe('BILL-001 — concurrent payments cannot overpay an invoice', () => {
  it('T1: 60 + 60 against a 100 invoice — exactly one succeeds, total stays <= 100', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger, { barrier: barrierFor(2) });
    const service = buildService(prisma);

    const results = await Promise.allSettled([
      service.recordPayment('invoice-1', pay(60)),
      service.recordPayment('invoice-1', pay(60)),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // PAY-02 — the invariant that used to break.
    expect(ledger.activeTotal()).toBe(60);
    expect(ledger.activeTotal()).toBeLessThanOrEqual(ledger.invoice.totalAmount);
    expect(ledger.payments).toHaveLength(1);

    // §9 — a deterministic business error, never a raw P2034.
    const error: any = rejected[0].reason;
    expect(error.response?.code ?? error.code).toBe('PAYMENT_EXCEEDS_REMAINING_BALANCE');
    expect(error.response?.invoiceId).toBe('invoice-1');
    expect(error.response?.attemptedAmount).toBe(60);
    expect(error.response?.remainingBalance).toBe(40);
  });

  it('T2: 40 + 60 against a 100 invoice — both succeed and total is exactly 100', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger, { barrier: barrierFor(2) });
    const service = buildService(prisma);

    const results = await Promise.allSettled([
      service.recordPayment('invoice-1', pay(40)),
      service.recordPayment('invoice-1', pay(60)),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(ledger.activeTotal()).toBe(100);
    expect(ledger.payments).toHaveLength(2);
    expect(ledger.invoice.status).toBe(InvoiceStatus.PAID);
  });

  it('T3: 100 + 1 against a 100 invoice — only the 100 may succeed', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger, { barrier: barrierFor(2) });
    const service = buildService(prisma);

    const results = await Promise.allSettled([
      service.recordPayment('invoice-1', pay(100)),
      service.recordPayment('invoice-1', pay(1)),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    expect(ledger.activeTotal()).toBe(100);
    expect(ledger.payments).toHaveLength(1);
    expect(ledger.payments[0].amount).toBe(100);
  });

  it('T7: the P2034 retry re-evaluates the balance rather than blindly re-inserting', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger, { barrier: barrierFor(2) });
    const service = buildService(prisma);

    const results = await Promise.allSettled([
      service.recordPayment('invoice-1', pay(60)),
      service.recordPayment('invoice-1', pay(60)),
    ]);

    // 3 transaction attempts: two racers + one retry by the loser.
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);

    // The retry re-read the invoice and rejected on the FRESH balance — the
    // pre-fix code would have re-run only the insert and committed 120.
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.response?.remainingBalance).toBe(40);
    expect(ledger.activeTotal()).toBe(60);
  });

  it('a losing racer that still fits is retried and committed, not rejected', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger, { barrier: barrierFor(2) });
    const service = buildService(prisma);

    const results = await Promise.allSettled([
      service.recordPayment('invoice-1', pay(30)),
      service.recordPayment('invoice-1', pay(30)),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(ledger.activeTotal()).toBe(60);
    expect(ledger.invoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);
  });
});

describe('BILL-001 — idempotency is not a substitute for the balance invariant', () => {
  it('T4: replaying the same idempotencyKey creates no second payment', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger);
    const service = buildService(prisma);

    const first = await service.recordPayment('invoice-1', pay(50, { idempotencyKey: 'key-1' }));
    const replay = await service.recordPayment('invoice-1', pay(50, { idempotencyKey: 'key-1' }));

    expect(replay.id).toBe(first.id);
    expect(ledger.payments).toHaveLength(1);
    expect(ledger.activeTotal()).toBe(50);
  });

  it('T4b: concurrent replays of one key settle on a single payment', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger, { barrier: barrierFor(2) });
    const service = buildService(prisma);

    const results = await Promise.allSettled([
      service.recordPayment('invoice-1', pay(50, { idempotencyKey: 'key-1' })),
      service.recordPayment('invoice-1', pay(50, { idempotencyKey: 'key-1' })),
    ]);

    expect(ledger.payments).toHaveLength(1);
    expect(ledger.activeTotal()).toBe(50);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
  });

  it('T5: DIFFERENT idempotency keys are still bound by the balance invariant', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger, { barrier: barrierFor(2) });
    const service = buildService(prisma);

    const results = await Promise.allSettled([
      service.recordPayment('invoice-1', pay(80, { idempotencyKey: 'key-a' })),
      service.recordPayment('invoice-1', pay(80, { idempotencyKey: 'key-b' })),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(ledger.activeTotal()).toBe(80);
    expect(ledger.activeTotal()).toBeLessThanOrEqual(100);
  });

  it('reuses a key with a different payload only as a conflict, never as a payment', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger);
    const service = buildService(prisma);

    await service.recordPayment('invoice-1', pay(50, { idempotencyKey: 'key-1' }));
    await expect(
      service.recordPayment('invoice-1', pay(20, { idempotencyKey: 'key-1' })),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(ledger.payments).toHaveLength(1);
    expect(ledger.activeTotal()).toBe(50);
  });
});

describe('BILL-001 — reversal interaction (existing semantics, verified not changed)', () => {
  it('T6: reversing a full payment frees the balance for a new full payment', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger);
    const service = buildService(prisma);

    await service.recordPayment('invoice-1', pay(100));
    expect(ledger.activeTotal()).toBe(100);

    // Reverse it the way ReversalService does — set reversedAt.
    ledger.payments[0].reversedAt = new Date();
    ledger.version += 1;
    ledger.invoice.status = InvoiceStatus.ISSUED;

    await expect(service.recordPayment('invoice-1', pay(100))).resolves.toBeDefined();

    expect(ledger.activeTotal()).toBe(100);
    expect(ledger.payments).toHaveLength(2);
    expect(ledger.payments.filter((p) => !p.reversedAt)).toHaveLength(1);
  });

  it('a reversed payment does not consume balance', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    ledger.payments.push({
      id: 'stale', invoiceId: 'invoice-1', amount: 100, reversedAt: new Date(),
    });
    const prisma = buildPrisma(ledger);
    const service = buildService(prisma);

    await expect(service.recordPayment('invoice-1', pay(100))).resolves.toBeDefined();
    expect(ledger.activeTotal()).toBe(100);
  });
});

describe('BILL-001 — invoice status derives from committed payments only', () => {
  it('paidAmount < total → PARTIALLY_PAID', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const service = buildService(buildPrisma(ledger));
    await service.recordPayment('invoice-1', pay(30));
    expect(ledger.invoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  it('paidAmount === total → PAID', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const service = buildService(buildPrisma(ledger));
    await service.recordPayment('invoice-1', pay(100));
    expect(ledger.invoice.status).toBe(InvoiceStatus.PAID);
    expect(ledger.invoice.paidAt).toBeInstanceOf(Date);
  });

  it('paidAmount > total is unreachable', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const service = buildService(buildPrisma(ledger));

    await service.recordPayment('invoice-1', pay(70));
    await expect(service.recordPayment('invoice-1', pay(70))).rejects.toMatchObject({
      response: { code: 'PAYMENT_EXCEEDS_REMAINING_BALANCE', remainingBalance: 30 },
    });

    expect(ledger.activeTotal()).toBeLessThanOrEqual(100);
  });

  it('an adjustment raising the payable amount is respected inside the transaction', async () => {
    const ledger = new Ledger({ totalAmount: 100, adjustmentAmount: 50 });
    const service = buildService(buildPrisma(ledger));

    await expect(service.recordPayment('invoice-1', pay(150))).resolves.toBeDefined();
    expect(ledger.invoice.status).toBe(InvoiceStatus.PAID);
  });
});

describe('BILL-001 — preconditions are re-evaluated inside the transaction (TX-03)', () => {
  it('rejects a payment against an invoice cancelled after the request started', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger);
    const service = buildService(prisma);

    // The authorization read sees ISSUED; the invoice is cancelled before the
    // transaction opens. The in-transaction re-read must catch it.
    prisma.invoice.findUnique.mockImplementationOnce(async () => ({
      ...ledger.invoice, status: InvoiceStatus.ISSUED, payments: [],
    }));
    ledger.invoice.status = InvoiceStatus.CANCELLED;

    await expect(service.recordPayment('invoice-1', pay(10))).rejects.toThrow(/đã bị hủy/);
    expect(ledger.payments).toHaveLength(0);
  });

  it('rejects a currency mismatch using the in-transaction invoice', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const service = buildService(buildPrisma(ledger));

    await expect(
      service.recordPayment('invoice-1', pay(10, { currencyCode: 'USD' })),
    ).rejects.toThrow(/ngoại tệ/);
    expect(ledger.payments).toHaveLength(0);
  });

  it('every balance-deciding read goes through the transaction client', async () => {
    const ledger = new Ledger({ totalAmount: 100 });
    const prisma = buildPrisma(ledger);
    const service = buildService(prisma);

    prisma.invoice.findUnique.mockClear();
    await service.recordPayment('invoice-1', pay(10));

    // Exactly one global read — the authorization lookup. Everything the
    // decision depends on is read via `tx` inside the transaction.
    expect(prisma.invoice.findUnique).toHaveBeenCalledTimes(1);
  });
});
