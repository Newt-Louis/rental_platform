# 01 — P0 Verification

Independent re-investigation of the 3 P0 findings from `docs/system-truth/ARCHITECTURE_CONTRADICTIONS.md`, performed 2026-08-21 by re-reading current code directly (not by trusting the prior severity labels). All line numbers below were re-confirmed against the working tree in this session.

---

## P0-001 (was CONTRA-005) — Billing invoice-summary currency-mixing

**Business process**: BP-002 Contract-to-Cash / BP-011 Management Reporting.

**Entry point**: `GET /billing/invoices` (list endpoint) → `BillingService.findAllInvoices()`.

**Affected actor**: Any authenticated user with Billing read access (staff roles; TENANT is scoped separately to their own invoices).

**Affected Mall/Tenant**: Any Mall/Tenant whose invoice set spans more than one currency — not Mall-scoping-related, this is a pure currency-aggregation defect.

**Code path**: `billing.service.ts:598-732`. Query params accepted: `status, tenantId, period, search, page, limit, mallId, sourceType, type, bucket` — **re-confirmed no `currencyCode` param exists**. The `where`/`summaryWhere` clauses (615-653) apply `mallId`-based filtering (via a `mallIds` array passed from the controller) but **never filter or group by `currencyCode`**. The summary block (708-730) does `summary.bySource[source].amount += row.balance` and `bucket.amount += ...` across every row in `summaryRows` regardless of currency.

**Authorization path**: Not applicable — this is a data-correctness defect, not an authorization gap. Mall-scoping on this specific endpoint is correctly applied (confirmed: `mallIds` is threaded into the `where` clause).

**Data path**: `Invoice.currencyCode` (per-row, correctly populated for this source type) → summed without a currency dimension → `summary.totalOutstanding`, `summary.bySource[*].amount`, `summary.{draft,current,partial,overdue,paid}.amount`.

**Exploit/failure path**: Not an exploit — a data-integrity defect. Any user filtering the invoice list by a Mall/Tenant/period/status combination that includes invoices of more than one currency will see a `summary.totalOutstanding` (and related bucket totals) that silently blends VND, USD, and MMK amounts as if they were the same unit.

**Financial impact**: Directly misleading financial totals shown in the Billing UI's summary cards for any multi-currency mall/tenant/period combination. No data is corrupted at rest — `Invoice.currencyCode` and `Invoice.totalAmount` remain individually correct; only the derived summary is wrong.

**Cross-module impact**: None beyond the Billing UI itself — this specific summary is not confirmed to be consumed by Dashboard/Reports/Analytics (those have their own independent, separately-flawed implementations, see P0-... wait, tracked under `CONTRA-012`, not this P0).

**Existing protection**: None. Every sibling formula in the same file (`getPendingReceivables`, `getArAging`, `collection-kpi.service.ts`) is correctly currency-scoped — this specific summary was simply missed.

**Protection gap**: No `currencyCode` grouping/filter in `findAllInvoices`'s summary aggregation.

**Reproduction method** (code-level, not executed against a live environment this pass): Create two Invoices for the same Tenant/Mall/period in different currencies (e.g. one VND, one USD contract's invoice both due in the same period), call `GET /billing/invoices?tenantId=...&period=...`, observe `summary.totalOutstanding` sums both `balance` values as one number with no currency label.

**Evidence**: `billing.service.ts:598-732`, specifically the query-param list (598-608), `where`/`summaryWhere` construction (615-653), and the summary loop (717-730).

**Final severity**: **CONFIRMED-P0** — financial data corruption in a user-facing summary, exploitable under normal usage (no special access needed), no reliance on unconfirmed business assumptions. Downgrade not warranted: this is deterministic and reproducible whenever a multi-currency filtered set exists, independent of BC-004's answer.

**Status update (2026-08-21) — RESOLVED by CR-102.** See `docs/changes/CR-102-CURRENCY-MIXING-CORRECTNESS.md`. Fixed and tested (10 new tests, T01-T10). Known limitation: the fix cannot detect an Invoice whose stored `currencyCode` is itself wrong (see CONTRA-010, confirmed still-live via `ServiceContractsPage.tsx`'s currency selector during CR-102's adversarial review) — that gap remains open under CR-103.

---

## P0-002 (was CONTRA-008, Spaces instance — representative of the broader cluster) — Mall-scoping absent on Unit read/write/delete

**Business process**: BP-013 Multi-Mall Operations; also upstream of BP-001/002/003 since Units are the shared substrate for Booking/Proposal/Contract/Fitout.

**Entry point**: `GET/PATCH/DELETE /spaces/units/:id`, `PATCH /spaces/units/:id/status`, `GET /spaces/units` (list).

**Affected actor**: Any authenticated staff user holding the `spaces` module role (class-level `@Roles(...MODULE_ROLES.spaces)`, `spaces.controller.ts:22`) for read; `spacesManage = [ADMIN, MALL_DIRECTOR, LEASING_MANAGER]` (`role-permissions.ts:24`) for write/status/delete. **MALL_DIRECTOR and LEASING_MANAGER are non-bypass roles** (`BYPASS_ROLES = [ADMIN, CEO, TENANT]`, `mall-access.service.ts:9`) — i.e., exactly the roles `UserMallAccess` exists to restrict.

**Affected Mall/Tenant**: Any Mall other than the ones the acting MALL_DIRECTOR/LEASING_MANAGER is assigned to via `UserMallAccess`.

**Code path**: `spaces.controller.ts:263-295` (`getUnit`, `updateUnit`, `updateUnitStatus`, `deleteUnit`) — none inject `mallAccess` or call `assertMallAccess`. `getUnits` (137-153) doesn't even inject `@CurrentUser()`, so the service method (`spaces.service.ts:238-...`) has no user context to scope by even if it wanted to — **re-confirmed**: `where` clause built from `filters.mallId` (client-optional) only, no `UserMallAccess`-derived restriction.

**Authorization path**: `JwtAuthGuard` (authenticates) → `RolesGuard` (checks `spaces`/`spacesManage` role membership) → `MallAccessGuard` (global `APP_GUARD`) attempts automatic resolution: `resourceId = params.id` is populated, but the guard's `sources` object (`mall-access.guard.ts:30-40`) only maps `resourceId` into `contractId`/`fitoutProjectId`/`fitoutSubmittalId`/`fitoutIssueId`/`invoiceId` via path-substring checks — **none of which match `/spaces/units/:id`**. `mallId`/`unitId`/`floorId` are read from `query`/`body`/`params` by literal field name — the route param is named `id`, not `unitId`, so this also doesn't populate. Net result: `extractAndValidateMallAccess` is called with an entirely empty `sources` object, `mallId` stays `undefined` throughout, and the final `if (mallId) { assertMallAccess }` (`mall-access.service.ts:262`) never executes — **the check is structurally skipped, not merely bypassed by role**.

**Data path**: `Unit` row (any Mall) → read/updated/deleted directly by ID, no Mall filter applied anywhere in the request lifecycle.

**Exploit/failure path**: A MALL_DIRECTOR or LEASING_MANAGER user, authenticated normally with legitimate access to Mall A, can call `GET/PATCH/DELETE /spaces/units/{knownOrGuessedUnitIdFromMallB}` and succeed — reading, editing (including changing status, media, floor-plan position), or deleting a Unit belonging to a Mall they have no `UserMallAccess` grant for. `GET /spaces/units` (list) similarly returns all-mall data whenever the optional `mallId` query param is omitted.

**Financial impact**: Indirect but real — Unit records carry `baseRentPerSqm`/`camPerSqm` and are the anchor for Booking/Contract/Fitout; unauthorized edits or deletion could corrupt pricing data or unit availability across Malls the actor has no legitimate business reason to touch.

**Cross-module impact**: High — Unit is the highest-fan-in entity after Billing/Contracts (`BLAST_RADIUS_MATRIX.md`); Booking, Proposals, Contracts, Fitout, Tickets, Work-Orders all key off Unit and Unit.status.

**Existing protection**: Role-gating (`spacesManage`) restricts this to internal staff, not arbitrary users — this is real defense, just insufficient (the roles it restricts to are precisely the mall-scoped ones).

**Protection gap**: No explicit `mallAccess.assertMallAccess`/`extractAndValidateMallAccess` call in the controller; the global guard's heuristics don't cover this route's param naming.

**Reproduction method**: Authenticate as a MALL_DIRECTOR/LEASING_MANAGER user provisioned only for Mall A (`UserMallAccess` row for Mall A only); call `GET /spaces/units/{unitId}` where `unitId` belongs to Mall B; observe HTTP 200 with the Unit's full data rather than 403.

**Evidence**: `spaces.controller.ts:1-30` (class-level guards/roles), `137-295` (unit routes), `spaces.service.ts:238-...` (`getUnits`, no user-context param); `mall-access.guard.ts:13-44`; `mall-access.service.ts:262-264`.

**Final severity**: **CONFIRMED-P0** — directly exploitable by legitimately-authenticated, non-privileged (relative to ADMIN/CEO) staff accounts, no business-context dependency, full CRUD exposure including destructive operations (delete).

*(This P0-002 write-up is the fully-detailed representative instance of the broader `CONTRA-008` cluster. Analytics and Reports were independently re-confirmed this session to have zero `MallAccessService` references at all — see `03-MALL-AUTHORIZATION-ARCHITECTURE.md` for the full coverage matrix across all 9+ instances; they share the same root cause and are tracked together under root-cause cluster `AUTH-01`, not as 9 separate P0s.)*

---

## P0-003 (was CONTRA-011) — Revenue-share formula mixes an implicitly-VND figure with a contract-currency figure

**Business process**: BP-007 Sales-to-Revenue-Share.

**Entry point**: `BillingService.calculateRevenueShare(period, mallIds)` — internal/scheduled or manual-trigger calculation, not directly user-invoked from a single obvious button (not independently traced to its controller trigger this session, consistent with the earlier finding that this is likely a periodic/manual finance operation).

**Affected actor**: Whichever role triggers revenue-share invoice generation (Finance, per module conventions).

**Affected Mall/Tenant**: Any Tenant with an active revenue-share contract (`proposal.revenueSharePercent > 0`) whose `Contract.currencyCode` is not VND.

**Code path**: `billing.service.ts:1355-1431`. Re-confirmed line-by-line this session:
- `sale.grossSales` sourced from `SalesTurnover.grossSales`, a bare `Float` with **no currency field on the model at all** (`schema.prisma`, `model SalesTurnover` — re-confirmed via direct schema read this session: fields are `grossSales Float`, `netSales Float`, no `currency`/`currencyCode` field whatsoever).
- `contract.rent` sourced from `Contract.rent`, denominated in `Contract.currencyCode` (enum, VND/USD/MMK).
- Line 1384: `shareAmount = Math.max(0, sale.grossSales * (pct / 100) - contract.rent)` — subtracts a currency-less number from a currency-denominated one.
- Line 1408: the resulting invoice is created with `currencyCode: contract.currencyCode` — i.e., if the contract is USD, the invoice claims to be a USD amount, but `shareAmount`'s arithmetic never converted `grossSales` into USD terms; it's whatever raw number was entered as `grossSales`.

**Authorization path**: Not applicable — this is a formula-correctness defect, not an authorization gap.

**Data path**: `SalesTurnover.grossSales` (currency-less) + `Contract.rent`/`currencyCode` → `Invoice.subtotal`/`totalAmount`/`currencyCode`.

**Exploit/failure path**: Not an exploit — a silent calculation defect. Occurs automatically whenever `calculateRevenueShare` runs for a non-VND revenue-share contract with a corresponding `SalesTurnover` record.

**Financial impact**: Potentially severe if triggered — an invoice could be generated with a `currencyCode` (e.g. USD) attached to an amount that was actually computed by mixing VND-scale and USD-scale raw numbers, producing a nonsensical `shareAmount` (either wildly too large or `<= 0` and silently skipped, depending on the numbers' relative magnitude — VND figures are typically 15,000-25,000× larger in raw numeric terms than equivalent USD figures, so in practice `sale.grossSales * pct% - contract.rent` would likely stay positive and produce a **grossly inflated** `shareAmount` if `grossSales` is VND-scale and `contract.rent` is USD-scale).

**Cross-module impact**: Sales (source data), Billing (invoice creation), Reports/Dashboard (would display the resulting wrong figure).

**Existing protection**: **None found.** Re-confirmed this session via a dedicated grep: `revenueSharePercent` (`create-proposal.dto.ts:74`) has no currency-conditional validation anywhere in `proposals.service.ts` or its DTO — a non-VND proposal can freely carry a nonzero `revenueSharePercent` with no structural barrier. This means the dangerous precondition (non-VND revenue-share contract) is **not prevented by any code**, only possibly avoided by consistent business practice (unconfirmed).

**Protection gap**: No currency-consistency validation between `SalesTurnover` and `Contract` at calculation time; no currency field on `SalesTurnover` at all to make such validation possible without a schema change.

**Reproduction method**: Create a Contract with `currencyCode = 'USD'` and a linked Proposal with `revenueSharePercent > 0`; create a `SalesTurnover` record for the same tenant/unit/period with a VND-scale `grossSales` value (e.g. 500,000,000); run `calculateRevenueShare` for that period; observe the resulting Invoice's `totalAmount` is a nonsensical figure while `currencyCode = 'USD'`.

**Evidence**: `billing.service.ts:1355-1431`; `schema.prisma` `model SalesTurnover` (no currency field, re-read directly this session); `proposals/dto/create-proposal.dto.ts:74`, `proposals.service.ts:225` (no currency gating on `revenueSharePercent`).

**Final severity**: **CONFIRMED-P0 for the code-level defect** (no structural prevention exists, the formula is provably wrong when the precondition holds) — **BUSINESS-CONFIRMATION-REQUIRED for real-world urgency** (whether non-VND revenue-share contracts actually exist or are ever created in production is unknown from code alone; this determines whether remediation is emergency-priority or can be scheduled normally). See `BC-004` in `07-BUSINESS-CONFIRMATION-TRIAGE.md`. **Not a false positive and not a downgrade** — the code-level facts alone justify P0 classification regardless of BC-004's eventual answer, because "no code path prevents this" is itself the P0-qualifying fact (per `docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`, P0 = "financial corruption," and this is a proven, unguarded financial-corruption code path, not merely a hypothetical one).

**Status update (2026-08-21) — still OPEN, not fixed by CR-102.** CR-102 was authorized to fix this if VND-only semantics could be proven; a fresh, thorough search (schema, code, docs, UI, tests) found no such proof, so per explicit instruction the guard was not implemented. Returned `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`, unchanged. See `docs/changes/CR-102-CURRENCY-MIXING-CORRECTNESS.md` "Blocker."

---

## Summary

| P0-ID | Classification | Rationale |
|---|---|---|
| P0-001 (findAllInvoices currency mixing) | **CONFIRMED-P0** | Deterministic, reproducible, no business-context dependency |
| P0-002 (Spaces Unit mall-scoping) | **CONFIRMED-P0** | Directly exploitable by legitimately-authenticated non-privileged staff, full CRUD including delete |
| P0-003 (Revenue-share currency mixing) | **CONFIRMED-P0** (code-level) / **BUSINESS-CONFIRMATION-REQUIRED** (real-world urgency) | Formula is provably wrong when triggered; no code prevents the triggering precondition; production likelihood unconfirmed |

**No findings were downgraded or reclassified as false-positive.** All 3 P0s survive independent re-verification against current code, re-read fresh in this session rather than trusted from the prior pass's summary.
