import { CurrencyCode } from '@prisma/client';
import {
  SAP_SUPPORTED_CURRENCIES,
  buildSapInvoicePayload,
  isSapContextFailure,
  resolveSapInvoiceContext,
  type InvoiceForSap,
} from './sap-invoice-payload';

/**
 * SAP-001 — financial context integrity at the SAP outbound boundary.
 *
 * FIN-11: every monetary amount leaving the platform carries its currency.
 *
 * The defect: the payload sent `amount` and `vatAmount` with NO currency field
 * at all — a search of the whole SAP module returned zero occurrences of
 * "currency" — and forwarded `mallId: invoice.mallId` verbatim, which two
 * reachable invoice creation paths leave null.
 */

const invoice = (over: Partial<InvoiceForSap> = {}): InvoiceForSap => ({
  id: 'inv-1',
  invoiceNumber: 'INV-2026-00001',
  contractId: 'contract-1',
  tenantId: 'tenant-1',
  billingPartyId: null,
  mallId: 'mall-1',
  currencyCode: 'VND' as CurrencyCode,
  totalAmount: 100_000_000,
  adjustmentAmount: 0,
  vatAmount: 10_000_000,
  period: '2026-03',
  dueDate: new Date('2026-04-15'),
  legalInvoiceNumber: null,
  counterpartyName: null,
  counterpartyTaxCode: null,
  tenant: { companyName: 'Test Tenant', taxCode: '0123456789' },
  billingParty: null,
  contract: { id: 'contract-1', unit: { mallId: 'mall-1' } },
  lines: [{ description: 'Rent 2026-03', qty: 1, unitPrice: 100_000_000, amount: 100_000_000 }],
  ...over,
});

const payloadFor = (inv: InvoiceForSap) => {
  const res = resolveSapInvoiceContext(inv);
  if (isSapContextFailure(res)) throw new Error(`expected success, got ${res.code}`);
  return buildSapInvoicePayload(res.context);
};

describe('SAP-001 — currency is present in the outbound payload', () => {
  it.each([
    ['VND', 100_000_000],
    ['USD', 5_000],
    ['MMK', 20_000_000],
  ] as const)('T1-3: a %s invoice posts currencyCode %s', (ccy, total) => {
    const p = payloadFor(invoice({ currencyCode: ccy, totalAmount: total }));
    expect(p.data.currencyCode).toBe(ccy);
  });

  it('T12: the pre-fix payload shape is no longer producible — currency is always present', () => {
    // Before this fix the payload had no currency key whatsoever. A USD invoice
    // therefore left the platform as a bare number.
    const p = payloadFor(invoice({ currencyCode: 'USD', totalAmount: 5_000 }));
    expect(Object.keys(p.data)).toContain('currencyCode');
    expect(p.data.currencyCode).toBe('USD');
    expect(p.data.amount).toBe(5_000);
  });

  it('supported currencies mirror the platform enum', () => {
    expect([...SAP_SUPPORTED_CURRENCIES]).toEqual(['VND', 'USD', 'MMK']);
  });

  it('T4: a missing currency fails closed', () => {
    const res = resolveSapInvoiceContext(invoice({ currencyCode: null }));
    expect(res.ok).toBe(false);
    if (isSapContextFailure(res)) {
      expect(res.code).toBe('SAP_INVOICE_CURRENCY_MISSING');
      expect(res.missingField).toBe('currencyCode');
      expect(res.invoiceId).toBe('inv-1');
      expect(res.contractId).toBe('contract-1');
      expect(res.tenantId).toBe('tenant-1');
    }
  });

  it('T8: an unsupported currency fails closed rather than being coerced', () => {
    const res = resolveSapInvoiceContext(invoice({ currencyCode: 'EUR' as CurrencyCode }));
    expect(res.ok).toBe(false);
    if (isSapContextFailure(res)) expect(res.code).toBe('SAP_INVOICE_CURRENCY_UNSUPPORTED');
  });

  it('never defaults a missing currency to VND', () => {
    const res = resolveSapInvoiceContext(invoice({ currencyCode: null }));
    expect(res.ok).toBe(false);
    if (isSapContextFailure(res)) expect(res.currencyCode).toBeNull();
  });
});

describe('SAP-001 — T9: no FX conversion, amounts pass through untouched', () => {
  it('a USD amount is not rescaled', () => {
    const p = payloadFor(invoice({ currencyCode: 'USD', totalAmount: 1_234.56, vatAmount: 123.45 }));
    expect(p.data.amount).toBe(1_234.56);
    expect(p.data.vatAmount).toBe(123.45);
  });

  it('the same numeric total is produced regardless of currency', () => {
    const amounts = (['VND', 'USD', 'MMK'] as const).map(
      (ccy) => payloadFor(invoice({ currencyCode: ccy, totalAmount: 777, adjustmentAmount: 23 })).data.amount,
    );
    expect(amounts).toEqual([800, 800, 800]);
  });

  it('adjustmentAmount is still folded into the total, as before', () => {
    const p = payloadFor(invoice({ totalAmount: 100, adjustmentAmount: -30 }));
    expect(p.data.amount).toBe(70);
  });
});

describe('SAP-001 — mall ownership is resolved, never sent null', () => {
  it('uses Invoice.mallId when present', () => {
    const res = resolveSapInvoiceContext(invoice());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.context.mallId).toBe('mall-1');
      expect(res.context.mallSource).toBe('INVOICE');
    }
  });

  it('T5: a revenue-share invoice with mallId NULL derives the mall from contract → unit', () => {
    // billing.service.ts revenue-share creation sets contractId + tenantId but
    // no mallId.
    const res = resolveSapInvoiceContext(invoice({ mallId: null }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.context.mallId).toBe('mall-1');
      expect(res.context.mallSource).toBe('CONTRACT_UNIT');
    }
  });

  it('T6: a manual invoice with mallId NULL derives the mall the same way', () => {
    // The manual POST /billing/invoices path never sets mallId, but its DTO
    // requires contractId.
    const res = resolveSapInvoiceContext(
      invoice({ mallId: null, contract: { id: 'contract-1', unit: { mallId: 'mall-9' } } }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.context.mallId).toBe('mall-9');
  });

  it('T7: an unresolvable mall fails closed', () => {
    const res = resolveSapInvoiceContext(invoice({ mallId: null, contractId: null, contract: null }));
    expect(res.ok).toBe(false);
    if (isSapContextFailure(res)) {
      expect(res.code).toBe('SAP_INVOICE_MALL_UNRESOLVED');
      expect(res.missingField).toBe('mallId');
      // Diagnostics carry every input the decision was made from.
      expect(res.mallResolutionInputs).toEqual({
        invoiceMallId: null, contractId: null, contractUnitMallId: null,
      });
    }
  });

  it('a contract whose unit has no mall is still unresolvable', () => {
    const res = resolveSapInvoiceContext(
      invoice({ mallId: null, contract: { id: 'contract-1', unit: { mallId: null } } }),
    );
    expect(res.ok).toBe(false);
    if (isSapContextFailure(res)) expect(res.code).toBe('SAP_INVOICE_MALL_UNRESOLVED');
  });

  it('a disagreement between the two sources fails closed instead of picking one', () => {
    const res = resolveSapInvoiceContext(
      invoice({ mallId: 'mall-1', contract: { id: 'contract-1', unit: { mallId: 'mall-2' } } }),
    );
    expect(res.ok).toBe(false);
    if (isSapContextFailure(res)) {
      expect(res.code).toBe('SAP_INVOICE_MALL_INCONSISTENT');
      expect(res.mallResolutionInputs.invoiceMallId).toBe('mall-1');
      expect(res.mallResolutionInputs.contractUnitMallId).toBe('mall-2');
    }
  });

  it('the payload can never carry a null mallId', () => {
    for (const inv of [invoice(), invoice({ mallId: null })]) {
      expect(payloadFor(inv).data.mallId).toBeTruthy();
    }
  });
});

describe('SAP-001 — the rest of the contract is unchanged', () => {
  it('keeps the existing envelope and field names', () => {
    const p = payloadFor(invoice());
    expect(p.action).toBe('CREATE_INVOICE');
    expect(Object.keys(p.data).sort()).toEqual([
      'amount', 'currencyCode', 'customerId', 'customerName', 'dueDate',
      'invoiceNumber', 'legalInvoiceNumber', 'lines', 'mallId', 'period',
      'taxCode', 'vatAmount',
    ]);
  });

  it('preserves the counterparty precedence', () => {
    const p = payloadFor(invoice({
      counterpartyName: 'Override Co', counterpartyTaxCode: '999',
    }));
    expect(p.data.customerName).toBe('Override Co');
    expect(p.data.taxCode).toBe('999');
  });

  it('falls back to the billing party when there is no tenant', () => {
    const p = payloadFor(invoice({
      tenantId: null, tenant: null,
      billingPartyId: 'bp-1', billingParty: { name: 'Parking Co', taxCode: '555' },
    }));
    expect(p.data.customerId).toBe('bp-1');
    expect(p.data.customerName).toBe('Parking Co');
  });

  it('maps invoice lines with the same shape as before', () => {
    const p = payloadFor(invoice());
    expect(p.data.lines).toEqual([
      { description: 'Rent 2026-03', quantity: 1, unitPrice: 100_000_000, amount: 100_000_000 },
    ]);
  });

  it('T11: the resolved context carries what an auditor needs, and no credentials', () => {
    const res = resolveSapInvoiceContext(invoice({ mallId: null }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.context).toMatchObject({
        invoiceId: 'inv-1', contractId: 'contract-1', tenantId: 'tenant-1',
        currencyCode: 'VND', mallId: 'mall-1', mallSource: 'CONTRACT_UNIT',
      });
      const serialized = JSON.stringify(res.context);
      for (const secret of ['client_secret', 'SAP_CLIENT_SECRET', 'Authorization', 'Bearer', 'access_token']) {
        expect(serialized).not.toContain(secret);
      }
    }
  });

  it('the mapper cannot inject a default for a finance dimension', () => {
    // Every emitted field comes from the context; anything absent is rejected
    // upstream. Nothing here can silently substitute a value.
    const res = resolveSapInvoiceContext(invoice());
    if (!res.ok) throw new Error('expected success');
    const p = buildSapInvoicePayload(res.context);
    expect(p.data.currencyCode).toBe(res.context.currencyCode);
    expect(p.data.mallId).toBe(res.context.mallId);
    expect(p.data.amount).toBe(res.context.amount);
  });
});
