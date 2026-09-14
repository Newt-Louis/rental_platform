import { CurrencyCode } from '@prisma/client';

/**
 * SAP-001 — the single mapping boundary for an outbound invoice posting.
 *
 * Everything that decides what leaves the platform lives here. Do not build SAP
 * field mappings in the service or controller.
 *
 * ── WHAT THE DOWNSTREAM CONTRACT ACTUALLY IS ────────────────────────────────
 * Reconstructed from code, config and tests; there is NO field-mapping
 * specification, sample payload or fixture anywhere in this repository, and
 * `docs/ai-erp-team/06-ERP-INTEGRATION-CATALOG.md` lists INT-001 (SAP) as a
 * template entry that was never filled in. CLAUDE.md describes this as "a SAP
 * integration mock".
 *
 * What IS verifiable:
 *   transport   HTTPS + JSON, OAuth2 client_credentials, POST
 *   endpoint    ${SAP_BASE_URL}/AccountingDocumentItem
 *   envelope    bespoke `{ action: 'CREATE_INVOICE', data: {...} }`
 *               — NOT a BAPI, RFC or standard OData entity payload, despite the
 *               SAP-flavoured endpoint name
 *   convention  camelCase business field names (invoiceNumber, vatAmount, ...)
 *
 * `currencyCode` therefore follows the envelope's existing convention and
 * carries an ISO-4217 alphabetic code (VND/USD/MMK are all ISO-4217).
 *
 * ⚠ UNVERIFIED: the field NAME and format have not been confirmed against a
 * real SAP counterparty. A genuine S/4HANA OData service would more likely
 * expect `TransactionCurrency`, and would distinguish document currency from
 * company-code (local) currency. Confirm the mapping with the SAP team before
 * go-live — see SAP-002 in docs/audit/ISSUE_REGISTER.md. The important property
 * this change guarantees is that the currency is PRESENT and correct at source;
 * renaming a field later is a one-line change here.
 */

/** ISO-4217 codes this platform can post. Mirrors the CurrencyCode enum. */
export const SAP_SUPPORTED_CURRENCIES: readonly CurrencyCode[] = ['VND', 'USD', 'MMK'];

export type SapInvoiceFinanceContext = {
  invoiceId: string;
  invoiceNumber: string;
  contractId: string | null;
  tenantId: string | null;
  billingPartyId: string | null;
  customerId: string;
  customerName: string | null;
  taxCode: string | null;
  /** Resolved, never null — see `resolveSapInvoiceContext`. */
  mallId: string;
  /** How the mall was established, for audit and for the failure diagnostics. */
  mallSource: 'INVOICE' | 'CONTRACT_UNIT';
  currencyCode: CurrencyCode;
  amount: number;
  vatAmount: number;
  period: string;
  dueDate: Date;
  legalInvoiceNumber: string | null;
  lines: { description: string; quantity: number; unitPrice: number; amount: number }[];
};

export type SapContextErrorCode =
  | 'SAP_INVOICE_CURRENCY_MISSING'
  | 'SAP_INVOICE_CURRENCY_UNSUPPORTED'
  | 'SAP_INVOICE_MALL_UNRESOLVED'
  | 'SAP_INVOICE_MALL_INCONSISTENT';

export type SapContextFailure = {
  ok: false;
  code: SapContextErrorCode;
  message: string;
  missingField: string;
  invoiceId: string;
  contractId: string | null;
  tenantId: string | null;
  currencyCode: CurrencyCode | null;
  /** Every input the mall decision was made from, so a failure is diagnosable. */
  mallResolutionInputs: {
    invoiceMallId: string | null;
    contractId: string | null;
    contractUnitMallId: string | null;
  };
};

export type SapInvoiceContextResult =
  | { ok: true; context: SapInvoiceFinanceContext }
  | SapContextFailure;

/** Narrowing helper — mirrors `isContractResolutionFailure` in common/finance. */
export function isSapContextFailure(
  result: SapInvoiceContextResult,
): result is SapContextFailure {
  return result.ok === false;
}

/** Minimum shape `resolveSapInvoiceContext` needs. Keep the service's include aligned. */
export type InvoiceForSap = {
  id: string;
  invoiceNumber: string;
  contractId: string | null;
  tenantId: string | null;
  billingPartyId: string | null;
  mallId: string | null;
  currencyCode: CurrencyCode | null;
  totalAmount: number;
  adjustmentAmount: number;
  vatAmount: number;
  period: string;
  dueDate: Date;
  legalInvoiceNumber: string | null;
  counterpartyName: string | null;
  counterpartyTaxCode: string | null;
  tenant?: { companyName: string | null; taxCode: string | null } | null;
  billingParty?: { name: string | null; taxCode: string | null } | null;
  contract?: { id: string; unit?: { mallId: string | null } | null } | null;
  lines: { description: string; qty: number; unitPrice: number; amount: number }[];
};

/**
 * Resolve the complete financial context, or fail closed BEFORE any network
 * transmission. Never substitutes a default for a missing finance dimension.
 */
export function resolveSapInvoiceContext(invoice: InvoiceForSap): SapInvoiceContextResult {
  const invoiceMallId = invoice.mallId ?? null;
  const contractUnitMallId = invoice.contract?.unit?.mallId ?? null;
  const mallResolutionInputs = {
    invoiceMallId,
    contractId: invoice.contractId ?? null,
    contractUnitMallId,
  };
  const base = {
    ok: false as const,
    invoiceId: invoice.id,
    contractId: invoice.contractId ?? null,
    tenantId: invoice.tenantId ?? null,
    mallResolutionInputs,
  };

  // ── Currency (FIN-11) ─────────────────────────────────────────────────────
  // Invoice.currencyCode is the single source of truth. No VND default, no
  // inference from amount scale, no locale, no FX conversion.
  const currencyCode = invoice.currencyCode ?? null;
  if (!currencyCode) {
    return {
      ...base,
      code: 'SAP_INVOICE_CURRENCY_MISSING',
      message: 'Hóa đơn không có đơn vị tiền tệ — không thể đẩy sang SAP.',
      missingField: 'currencyCode',
      currencyCode: null,
    };
  }
  if (!SAP_SUPPORTED_CURRENCIES.includes(currencyCode)) {
    return {
      ...base,
      code: 'SAP_INVOICE_CURRENCY_UNSUPPORTED',
      message: `Đơn vị tiền tệ ${currencyCode} chưa được hỗ trợ đẩy sang SAP.`,
      missingField: 'currencyCode',
      currencyCode,
    };
  }

  // ── Mall ownership ────────────────────────────────────────────────────────
  // Invoice.mallId is nullable and two reachable creation paths leave it null
  // (manual create and revenue-share), so it cannot be the sole source. All
  // invoice sources were traced: the five funnel paths set it from
  // contract.unit.mallId / contract.mallId / slot.unit.mallId, and the two that
  // do not always carry a contractId. Derivation through contract → unit
  // therefore covers every source.
  //
  // When both are present they must agree — a disagreement is a data-integrity
  // problem, not something to silently pick a winner for.
  let mallId: string;
  let mallSource: 'INVOICE' | 'CONTRACT_UNIT';
  if (invoiceMallId && contractUnitMallId && invoiceMallId !== contractUnitMallId) {
    return {
      ...base,
      code: 'SAP_INVOICE_MALL_INCONSISTENT',
      message:
        `Invoice.mallId (${invoiceMallId}) khác với mall suy ra từ hợp đồng ` +
        `(${contractUnitMallId}).`,
      missingField: 'mallId',
      currencyCode,
    };
  }
  if (invoiceMallId) {
    mallId = invoiceMallId;
    mallSource = 'INVOICE';
  } else if (contractUnitMallId) {
    mallId = contractUnitMallId;
    mallSource = 'CONTRACT_UNIT';
  } else {
    return {
      ...base,
      code: 'SAP_INVOICE_MALL_UNRESOLVED',
      message:
        'Không xác định được mall của hóa đơn (không có Invoice.mallId và không ' +
        'suy ra được từ hợp đồng). Không gửi mallId rỗng sang SAP.',
      missingField: 'mallId',
      currencyCode,
    };
  }

  const customerId = invoice.tenantId || invoice.billingPartyId;
  return {
    ok: true,
    context: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      contractId: invoice.contractId ?? null,
      tenantId: invoice.tenantId ?? null,
      billingPartyId: invoice.billingPartyId ?? null,
      customerId: customerId ?? '',
      customerName:
        invoice.counterpartyName || invoice.tenant?.companyName || invoice.billingParty?.name || null,
      taxCode:
        invoice.counterpartyTaxCode || invoice.tenant?.taxCode || invoice.billingParty?.taxCode || null,
      mallId,
      mallSource,
      currencyCode,
      // Unchanged arithmetic: the same total the pre-SAP-001 payload sent.
      // Currency is added ALONGSIDE the amount, never applied to it.
      amount: invoice.totalAmount + invoice.adjustmentAmount,
      vatAmount: invoice.vatAmount,
      period: invoice.period,
      dueDate: invoice.dueDate,
      legalInvoiceNumber: invoice.legalInvoiceNumber ?? null,
      lines: invoice.lines.map((line) => ({
        description: line.description,
        quantity: line.qty,
        unitPrice: line.unitPrice,
        amount: line.amount,
      })),
    },
  };
}

/**
 * Build the outbound payload from an already-resolved context.
 *
 * Pure and total: every field it emits is present on the context, so it cannot
 * inject a default for a finance dimension. Anything that could be missing is
 * rejected earlier by `resolveSapInvoiceContext`.
 */
export function buildSapInvoicePayload(context: SapInvoiceFinanceContext) {
  return {
    action: 'CREATE_INVOICE',
    data: {
      invoiceNumber: context.invoiceNumber,
      customerId: context.customerId,
      customerName: context.customerName,
      taxCode: context.taxCode,
      mallId: context.mallId,
      amount: context.amount,
      vatAmount: context.vatAmount,
      // SAP-001 — the field this whole remediation exists to add.
      currencyCode: context.currencyCode,
      period: context.period,
      dueDate: context.dueDate,
      legalInvoiceNumber: context.legalInvoiceNumber,
      lines: context.lines,
    },
  };
}

export function serializeSapInvoicePayload(context: SapInvoiceFinanceContext): string {
  return JSON.stringify(buildSapInvoicePayload(context));
}
