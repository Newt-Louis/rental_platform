# SAP INTEGRATION AUDIT

Reconstructed from `src/modules/sap/`, environment configuration and tests.
Companion to `CURRENCY_AUDIT.md` and `DATA_LINEAGE.md`.

## 1. What the integration actually is

| Aspect | Finding |
|---|---|
| Transport | HTTPS + JSON via `fetch`. **Not** RFC, IDoc or a BAPI call. |
| Auth | OAuth2 `client_credentials` against `${SAP_BASE_URL}/oauth/token`, token cached until 60s before expiry |
| Invoice endpoint | `POST ${SAP_BASE_URL}/AccountingDocumentItem` |
| Customer endpoint | `POST ${SAP_BASE_URL}/CustomerMaster` |
| Envelope | bespoke `{ action: 'CREATE_INVOICE', data: {...} }` — SAP-flavoured endpoint names over a custom body |
| Enabled | `SAP_ENABLED` — **currently false**; not set in `.env` |
| Resilience | timeout, bounded retry on transient status/errors, circuit breaker |
| Idempotency | `SapIntegrationLog.idempotencyKey` = `${entityType}:${entityId}:${endpoint}`, sent as an `Idempotency-Key` header; a SUCCESS log short-circuits a repeat call |
| Trigger | **manual only** — `POST /api/sap/sync/invoice`, roles ADMIN and FINANCE. No cron, no outbox handler, no automatic propagation. |

### There is no downstream field specification in this repository

No sample payload, fixture, mapping table or interface document exists.
`docs/ai-erp-team/06-ERP-INTEGRATION-CATALOG.md` lists `INT-001` (SAP) as a
template entry that was never filled in, and `CLAUDE.md` describes the module as
"a SAP integration mock". The pre-existing `sap.service.spec.ts` tests transport
resilience only and never asserts payload content.

**Consequence for this audit:** the outbound *shape* is fully reconstructable
from code, but what a real SAP counterparty *expects* is not. Field names below
are marked accordingly.

## 2. Outbound invoice payload — field classification

| Field | Class | Source |
|---|---|---|
| `invoiceNumber` | SOURCE | `Invoice.invoiceNumber` |
| `customerId` | DERIVED | `Invoice.tenantId ?? billingPartyId` |
| `customerName` | DERIVED | `counterpartyName → tenant.companyName → billingParty.name` |
| `taxCode` | DERIVED | `counterpartyTaxCode → tenant.taxCode → billingParty.taxCode` |
| `mallId` | **DERIVED (fixed)** | `Invoice.mallId`, else `Contract → Unit → mallId`; fails closed if neither |
| `amount` | SOURCE | `totalAmount + adjustmentAmount` — unchanged by this remediation |
| `vatAmount` | SOURCE | `Invoice.vatAmount` |
| **`currencyCode`** | **SOURCE (added)** | `Invoice.currencyCode`, ISO-4217. **Field name UNVERIFIED** against a real counterparty |
| `period` | SOURCE | `Invoice.period` |
| `dueDate` | SOURCE | `Invoice.dueDate` |
| `legalInvoiceNumber` | OPTIONAL | `Invoice.legalInvoiceNumber` |
| `lines[]` | SOURCE | `InvoiceLine` |
| `companyCode` | **MISSING** | `SapEntityMapping.sapCompanyCode` exists (default `'1000'`) but is never sent — see SAP-003 |
| `costCenter` | **MISSING** | no such field anywhere in the schema or code |
| `profitCenter` | **MISSING** | same |
| `glAccount` | **MISSING** | same |
| `postingDate` | **MISSING** | not sent; only `period` and `dueDate` are |
| `documentDate` | **MISSING** | same |
| `contractId` / `invoiceId` | **MISSING** | not sent; only the human-readable `invoiceNumber` |
| document vs local currency | **UNVERIFIED** | the platform has one currency per invoice and no FX engine, so it can only ever supply document currency |
| amount precision by currency | **UNVERIFIED** | all amounts are `Float`; no per-currency rounding rule exists |

## 3. SAP-001 — currency at the outbound boundary (FIXED 2026-09-06)

The payload carried `amount` and `vatAmount` with **no currency field at all** —
a search of the whole SAP module returned zero occurrences of "currency". A USD
invoice and a VND invoice posted as indistinguishable bare numbers.

- `Invoice.currencyCode` is the single source of truth. No VND default, no
  inference from amount scale, no locale, no FX conversion.
- Missing or unsupported currency **fails closed before any network call** and
  before any log row is written, so a rejected posting never leaves a misleading
  SUCCESS entry.
- Amounts are untouched: currency is added *alongside* the number.

## 4. Mall ownership (fixed in the same change)

The payload forwarded `mallId: invoice.mallId` verbatim, and `Invoice.mallId` is
nullable. All six invoice sources were traced first:

| Source | mallId at creation |
|---|---|
| scheduled rent (`billing.service.ts:413`) | `contract.unit.mallId` |
| service contract (`:458`) | `contract.mallId` |
| parking boundary (`:507`) | `contract.mallId` |
| periodic charge (`:575`) | `contract.unit.mallId` |
| slot booking (`:638`) | `slot.unit.mallId` |
| **manual create** (`:936`) | **null** — but `contractId` is required by the DTO |
| **revenue-share** (`:1540`) | **null** — but `contractId` is always set |

Precedence is therefore justified by the trace, not assumed: `Invoice.mallId`
when present, otherwise `Contract → Unit → mallId`. If both exist and
**disagree**, the posting fails closed rather than picking a winner. If neither
resolves, it fails closed — `mallId: null` can no longer leave the platform.

## 5. Stale queued payloads

Because SAP is disabled, every `syncInvoice` call so far wrote a `PENDING` log
holding a payload built by the old, currency-less mapper. `retryPending()`
replayed `log.payload` verbatim, which would have silently defeated this fix for
every already-queued invoice the moment SAP was enabled.

`retryPending()` now **rebuilds** the payload for `INVOICE` entities from
current data, which also re-applies the fail-closed checks. Non-invoice entities
still replay their stored payload unchanged.

## 6. Mapping boundary

All SAP field mapping lives in `src/modules/sap/sap-invoice-payload.ts`:

- `resolveSapInvoiceContext(invoice)` → `{ok, context}` or a typed failure
  carrying `code`, `missingField`, `invoiceId`, `contractId`, `tenantId`,
  `currencyCode` and every `mallResolutionInputs` value the decision used.
- `buildSapInvoicePayload(context)` — pure and total. Every field it emits comes
  from the resolved context, so it **cannot** inject a default for a finance
  dimension.

Nothing in the controller or service builds SAP fields.

## 7. Idempotency — unchanged

`SapIntegrationLog.idempotencyKey`, the `Idempotency-Key` header, the
SUCCESS short-circuit and the circuit breaker are all untouched. No concurrency
behaviour was redesigned.

## 8. Open SAP issues

- **SAP-002** — the currency field NAME and format are unverified against a real
  SAP counterparty. A genuine S/4HANA OData service would likely expect
  `TransactionCurrency` and distinguish document from local currency. Confirm
  before go-live; renaming is a one-line change in the mapper.
- **SAP-003** — no organizational finance dimensions are transmitted:
  `companyCode`, `costCenter`, `profitCenter`, `glAccount`, `postingDate`,
  `documentDate`. `SapEntityMapping.sapCompanyCode` exists (default `'1000'`,
  `sapSystem: 'S4HANA'`) but is never read by the posting path. Deliberately
  **not** invented here — whether SAP requires them is a business/integration
  question, and a hardcoded `'1000'` would be a guess about a finance dimension.
- **SAP-004** — `SapReconciliationRecord.ourAmount` / `sapAmount` still carry no
  currency, so reconciliation compares two currency-less numbers (part of
  CUR-002).
