/**
 * REMEDIATION WAVE 7 — SAP-004.
 *
 * `SapReconciliationRecord` compared `ourAmount` against `sapAmount` with no
 * currency on either side and marked MATCHED on `|difference| < 1`. That means
 * **100 VND and 100 USD reconciled as equal**, and the record was stamped
 * `reconciledAt` on the strength of it.
 *
 * Our side's currency is provable (Invoice.currencyCode). The SAP side's is NOT:
 * `log.response` is raw text from the external endpoint, no verified field
 * carries a currency, and no verified meaning exists for one (document /
 * transaction / local / company-code / group currency are different things in
 * SAP). So SAP-004 stays BLOCKED on the external contract — but the harmful
 * half, comparing incomparable numbers, is closed here: UNKNOWN can never become
 * MATCHED.
 */
import {
  SapReconciliationService,
  assessComparability,
  SAP_RECONCILIATION_TOLERANCE,
} from './sap-reconciliation.service';

describe('assessComparability (SAP-004)', () => {
  const base = {
    ourAmount: 100,
    ourCurrencyCode: 'VND' as const,
    sapAmount: 100,
    sapCurrencyCode: 'VND' as const,
  };

  it('VND/VND, USD/USD, MMK/MMK are comparable', () => {
    for (const ccy of ['VND', 'USD', 'MMK'] as const) {
      expect(assessComparability({ ...base, ourCurrencyCode: ccy, sapCurrencyCode: ccy }))
        .toEqual({ comparable: true, reason: null });
    }
  });

  // The defining defect: equal numbers, different units.
  it('VND vs USD is NOT comparable, however equal the numbers look', () => {
    const verdict = assessComparability({
      ourAmount: 100, ourCurrencyCode: 'VND',
      sapAmount: 100, sapCurrencyCode: 'USD',
    });
    expect(verdict).toEqual({ comparable: false, reason: 'CURRENCY_MISMATCH' });
  });

  it('our known / SAP unknown is not comparable', () => {
    expect(assessComparability({ ...base, sapCurrencyCode: null }))
      .toEqual({ comparable: false, reason: 'SAP_CURRENCY_UNKNOWN' });
  });

  it('our unknown / SAP known is not comparable', () => {
    expect(assessComparability({ ...base, ourCurrencyCode: null }))
      .toEqual({ comparable: false, reason: 'OUR_CURRENCY_UNKNOWN' });
  });

  it('both unknown is not comparable', () => {
    expect(assessComparability({ ...base, ourCurrencyCode: null, sapCurrencyCode: null })
      .comparable).toBe(false);
  });

  it('an unsourced our-side is reported as such, not treated as zero', () => {
    expect(assessComparability({ ...base, ourAmount: null }))
      .toEqual({ comparable: false, reason: 'OUR_AMOUNT_NOT_SOURCED' });
  });

  it('a missing SAP amount is reported as such', () => {
    expect(assessComparability({ ...base, sapAmount: null }))
      .toEqual({ comparable: false, reason: 'SAP_AMOUNT_MISSING' });
  });

  // REGRESSION PROOF: the pre-fix rule, reconstructed.
  it('the old rule would have MATCHED 100 VND against 100 USD', () => {
    const oldStatus = Math.abs(100 - 100) < 1 ? 'MATCHED' : 'MISMATCH';
    expect(oldStatus).toBe('MATCHED');

    expect(assessComparability({
      ourAmount: 100, ourCurrencyCode: 'VND',
      sapAmount: 100, sapCurrencyCode: 'USD',
    }).comparable).toBe(false);
  });
});

describe('reconcilePending (SAP-004)', () => {
  function build(log: any, invoice: any = null) {
    const prisma: any = {
      sapIntegrationLog: { findMany: jest.fn().mockResolvedValue([log]) },
      sapReconciliationRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => data),
      },
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
    };
    return { service: new SapReconciliationService(prisma as any), prisma };
  }

  const invoiceLog = (amount: number | null) => ({
    id: 'log-abcdef12',
    entityType: 'INVOICE',
    entityId: 'inv-1',
    endpoint: '/Invoice',
    idempotencyKey: 'INVOICE:inv-1:/Invoice',
    response: amount === null ? '{}' : JSON.stringify({ amount }),
  });

  const written = (prisma: any) => prisma.sapReconciliationRecord.create.mock.calls[0][0].data;

  it('records our currency from the invoice, and never invents one for SAP', async () => {
    const { service, prisma } = build(invoiceLog(1000), { totalAmount: 1000, currencyCode: 'USD' });
    await service.reconcilePending();

    const row = written(prisma);
    expect(row.ourAmount).toBe(1000);
    expect(row.ourCurrencyCode).toBe('USD');
    expect(row.sapCurrencyCode).toBeNull();
    // The one thing that must never happen on this boundary.
    expect(row.sapCurrencyCode).not.toBe(row.ourCurrencyCode);
  });

  // The whole point: identical amounts no longer auto-match, because nothing
  // proves the SAP figure is in the same unit.
  it('does not MATCH even when the amounts are identical, while SAP currency is unknown', async () => {
    const { service, prisma } = build(invoiceLog(1000), { totalAmount: 1000, currencyCode: 'VND' });
    const result = await service.reconcilePending();

    const row = written(prisma);
    expect(row.status).toBe('NEEDS_REVIEW');
    expect(row.notes).toContain('SAP_CURRENCY_UNKNOWN');
    expect(row.reconciledAt).toBeNull();
    expect(result).toMatchObject({ matched: 0, needsReview: 1 });
  });

  it('a missing SAP amount is NEEDS_REVIEW with its own reason', async () => {
    const { service, prisma } = build(invoiceLog(null), { totalAmount: 1000, currencyCode: 'VND' });
    await service.reconcilePending();

    const row = written(prisma);
    expect(row.status).toBe('NEEDS_REVIEW');
    expect(row.notes).toContain('SAP_AMOUNT_MISSING');
  });

  // A non-INVOICE log used to persist ourAmount 0 and could MATCH a SAP zero.
  it('a non-INVOICE entity records a null our-side, not a fabricated zero', async () => {
    const { service, prisma } = build({
      id: 'log-1', entityType: 'TENANT', entityId: 't-1', endpoint: '/CustomerMaster',
      idempotencyKey: 'TENANT:t-1:/CustomerMaster',
      response: JSON.stringify({ amount: 0 }),
    });
    await service.reconcilePending();

    const row = written(prisma);
    expect(row.ourAmount).toBeNull();
    expect(row.ourAmount).not.toBe(0);
    expect(row.status).toBe('NEEDS_REVIEW');
    expect(row.notes).toContain('OUR_AMOUNT_NOT_SOURCED');
  });

  it('an unparseable SAP response is NEEDS_REVIEW, never MISMATCH on a guess', async () => {
    const { service, prisma } = build({
      ...invoiceLog(1), response: 'not json at all',
    }, { totalAmount: 1000, currencyCode: 'VND' });
    await service.reconcilePending();

    const row = written(prisma);
    expect(row.status).toBe('NEEDS_REVIEW');
    expect(row.notes).toContain('could not be parsed');
  });

  it('an already-reconciled log is skipped (idempotent)', async () => {
    const { service, prisma } = build(invoiceLog(1000), { totalAmount: 1000, currencyCode: 'VND' });
    prisma.sapReconciliationRecord.findUnique.mockResolvedValue({ id: 'existing' });

    const result = await service.reconcilePending();
    expect(prisma.sapReconciliationRecord.create).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
  });

  it('the tolerance is named, and unreachable while SAP currency is unknown', () => {
    expect(SAP_RECONCILIATION_TOLERANCE).toBe(1);
    // SAP-REC-TOL-001: 1 is not currency-neutral. It is deliberately not guessed
    // per currency; today nothing can reach it because nothing is comparable.
    expect(assessComparability({
      ourAmount: 1, ourCurrencyCode: 'VND', sapAmount: 1, sapCurrencyCode: null,
    }).comparable).toBe(false);
  });
});

/**
 * REGRESSION PROOF (structure) — the SAP side must never be filled from our own
 * data. A behavioural test cannot catch someone writing
 * `sapCurrencyCode: invoice.currencyCode`, because the amounts would then match
 * and every other test would go green.
 */
describe('SAP-004 — the SAP currency is never sourced from our side', () => {
  const readCode = () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('fs');
    return readFileSync(require.resolve('./sap-reconciliation.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
  };

  it('sapCurrencyCode is never assigned from an invoice or from our currency', () => {
    const code = readCode();
    expect(code).not.toMatch(/sapCurrencyCode\s*[:=][^;,\n]*invoice/i);
    expect(code).not.toMatch(/sapCurrencyCode\s*[:=][^;,\n]*ourCurrencyCode/);
    expect(code).not.toMatch(/sapCurrencyCode\s*[:=]\s*['"](VND|USD|MMK)['"]/);
  });

  it('the comparison still runs through assessComparability', () => {
    expect(readCode()).toContain('assessComparability(');
  });
});
