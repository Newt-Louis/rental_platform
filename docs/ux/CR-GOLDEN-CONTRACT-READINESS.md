# CR-GOLDEN-CONTRACT — Phase A UX Readiness

**Owner:** Codex
**Date:** 2026-08-24
**Phase:** READINESS / DESIGN ONLY
**Application code changed:** NO

## 1. Executive conclusion

Contracts already has a substantial operational surface: a paginated worklist,
an authoritative Contract state machine, activation-readiness checks, automatic
Billing and Fitout handoffs, document upload/signing, amendments, termination,
and an event timeline. The problem is primarily information architecture and
action hierarchy, not missing domain breadth.

The current screen behaves like a wide list plus a dense seven-tab utility
drawer. It does not yet behave like an ERP business object page. Contract
identity, current status, location, dates, currency, next permitted action, and
downstream state are distributed across the drawer header, handoff notices,
the first tab, and secondary tabs. Permission-ineligible mutations are also
rendered to read-only roles and rejected only by the backend.

Golden Contract can proceed as a frontend information-architecture program
using existing APIs and lifecycle semantics. Additive read-model work would
improve authority and scale, but is not required for the base architecture.
Correctness findings are explicitly separated and must not be fixed silently in
the UX implementation.

**IMPLEMENTATION READINESS: READY**, subject to the scope and gates in this
document.

## 2. Evidence reviewed

### Governance and System Truth

- `AGENTS.md`, `RUN-FIRST.md`, and the mandatory governance sequence.
- System Truth for E2E process, ownership, state machines, cross-module
  contracts, transactions, roles, money, documents, multi-Mall,
  multi-currency, and Golden scenarios.
- GS-01, GS-04, GS-05, GS-07, GS-09, GS-10, GS-11, GS-12, GS-13, GS-14, and
  GS-15 are the relevant regression set for a future implementation.

### Approved Golden references

- Golden Dashboard: dense executive/intelligence hierarchy; not copied as an
  object-page pattern.
- Golden Booking: persistent context and readiness; not copied as a
  search-and-select transaction workspace.
- Golden Billing: exact money, contextual detail, restrained actions, and
  contained table scrolling.
- CR-109: cross-record Amount and Currency separation; exact values; canonical
  currency formatters only.

### Contract-specific sources

- `apps/frontend/src/pages/contracts/ContractsPage.tsx` and shared Sheet/Tabs.
- `apps/frontend/src/api/contracts.ts`, frontend Contract types, permissions,
  routes, and Contract locales.
- Contracts controller, service, activation, expiry scheduler, amendments,
  templates, events, termination, Prisma models, and focused tests.
- Existing Contract lifecycle, completion, pattern-reference, redesign, file
  authorization, and multi-currency documents.

## 3. Real E2E role of Contract

```text
Lead → Booking → Proposal → Approval → Contract
                                         ├─ activation → Billing schedule
                                         ├─ durable contract.activated event → Fitout
                                         ├─ amendments → Contract terms / Billing rebuild
                                         └─ termination → Contract + Unit lifecycle
```

The Contract object must answer:

| Question | Authoritative current source |
|---|---|
| Who? | `Contract.tenant`, originating Proposal/Lead context |
| What? | `contractNumber`, `type`, `status` |
| Where? | `unit`, `unit.floor`, `unit.zone`, global Mall context |
| When? | `startDate`, `endDate`, `term`; expiry scheduler |
| How much? | Contract money fields + `currencyCode` |
| What next? | Contract transition matrix, activation readiness, role-gated endpoints |
| Billing? | Billing schedule and linked invoices |
| Fitout? | `fitoutProject.id/status`, auto-created after activation |
| Evidence? | Contract files, amendments, Contract events |

No UI should imply that Billing schedule creation or Fitout project creation is
a normal manual next step. Both are existing activation side effects. Manual
Billing schedule rebuild is recovery/maintenance, not the primary workflow.

## 4. Current Contract list audit

### What exists

- Server pagination: 25 rows per page.
- Server filters: search, status, type, lease-term type, tenant, Unit, floor,
  start-date range, and accessible Mall set.
- Separate expiring query and an expiry-focused view.
- Status summary grouped by authoritative Contract statuses.
- Table columns: Contract number, creation time, Tenant, Unit/Floor, type,
  rent, Currency, start/end date, status, document count, and remaining days in
  expiry mode.
- Whole-row navigation opens detail; no casual mutation is embedded in rows.
- Cross-record rent already follows CR-109: exact numeric Amount with a separate
  ISO Currency column.

### Current weaknesses

- The page stacks a header, lease-term segmented control, five independent
  status tiles, a bordered filter card, and the table. This delays the primary
  worklist and reads as a collection of containers.
- Search is sent on every keystroke; no debounce is present.
- The Unit filter loads a capped set (`limit: 500`) into a client Select. That
  is not a complete finder at larger scale.
- `min-w-[1200px]` is correctly contained by table scrolling, but the column
  set is wider than necessary. Creation age and type/lease-term consume prime
  space before business status and expiry context.
- Mall name is not included in list rows. Adding a Mall column would require an
  additive relation/select or reliance on the global Mall context; it must not
  be invented from an ID.
- Outstanding/Billing state is not present in the list response. It is not a
  valid Golden list column without a Billing-owned additive read model.
- No explicit Action column exists. The whole row is clickable, which is usable
  but weak for keyboard/discoverability unless the row receives an explicit
  accessible open-detail affordance.
- Several visible labels are hard-coded Vietnamese in the component, so the
  English locale is incomplete despite a separate locale file.

### Recommended list columns using current data

1. Contract No. + type as secondary metadata.
2. Tenant.
3. Unit + Floor/Zone.
4. Start date.
5. Expiry date + days remaining when relevant.
6. Status.
7. Rent Amount.
8. Currency.
9. Documents.
10. Open-detail affordance.

Mall may be shown once in the command context when a single Mall is selected.
Do not add a row-level Mall name until the API returns an authoritative name.
Do not add Outstanding/Billing state to the list in the base implementation.

## 5. Current Contract detail audit

### What exists

- A right-side shared Sheet with a scrollable body.
- Header shows Contract number and Tenant.
- Active/Expiring Contracts show Billing-schedule and Fitout-existence handoff
  notices.
- Detail tab shows status, type, expiry warning, allowed UI transitions,
  activation blocking reasons, origin links, parties, financial terms, and
  dates.
- Other tabs expose documents, Contract events, amendments, template render,
  Billing schedule/invoices, and termination.

### Current weaknesses

- Status is not in the persistent Sheet header. A user must enter the first tab
  to see the primary lifecycle fact.
- Mall, Unit, Floor/Zone, effective dates, currency, and next action are not
  visible together.
- Seven equal tabs create cognitive density and exceed the width of the fixed
  Sheet at smaller desktops.
- Source, workflow, parties, financial, dates, and handoff state use many
  independent rounded/tinted containers.
- The detail response already includes Fitout status, but UI only says
  started/not started. Current stage is hidden.
- Billing navigation from the handoff notice opens `/billing` without a
  Contract filter, so context can be lost. Invoice rows in the Billing tab do
  preserve invoice identity.
- Tenant navigation opens the Tenant list without selecting the Tenant.
- `signedDate`, `durationMonths`, and `serviceCharge` are read by the UI but are
  not Contract model fields. They can render empty or remain hidden. The real
  term field is `term`.
- Contract frontend typing omits authoritative `TERMINATING` even though the UI
  and backend use it.

## 6. Authoritative Contract status model

The only Contract lifecycle statuses are:

| Status | Meaning in current UI | Allowed Contract transitions | Presentation priority |
|---|---|---|---|
| `DRAFT` | Draft | `PENDING_LEGAL`, `ACTIVE` | Activation/readiness context |
| `PENDING_LEGAL` | Pending Legal | `PENDING_SIGNATURE`, `DRAFT` | Legal review context |
| `PENDING_SIGNATURE` | Pending Signature | `ACTIVE`, `PENDING_LEGAL` | Signature/activation context |
| `ACTIVE` | Active | `EXPIRING`, `EXPIRED`, `TERMINATING` | Normal operational state |
| `EXPIRING` | Expiring | `ACTIVE`, `EXPIRED`, `TERMINATING` | Renewal/expiry attention |
| `EXPIRED` | Expired | none | Terminal Contract transition |
| `TERMINATING` | Terminating | dedicated termination service; backend matrix also has `TERMINATED`, `ACTIVE` | High-risk operation |
| `TERMINATED` | Terminated | none | Terminal |

The daily scheduler automatically moves eligible Contracts to `EXPIRING` and
`EXPIRED`. Manual status endpoints still exist, but the Golden UI must not
present routine expiry as if the operator always owns that transition.

The existing frontend transition matrix is a narrower copy of the backend
matrix. It is currently accurate, but it is not an independent source of truth.
Implementation must preserve the exact existing subset or consume additive
server-derived action/readiness metadata; it must not add lifecycle states.

## 7. Action and permission audit

### Backend authority

| Capability | Roles currently allowed |
|---|---|
| Read list/detail | ADMIN, LEASING_MANAGER, MALL_DIRECTOR, FINANCE, LEGAL; TENANT on list/detail with tenant scoping |
| Edit Contract, documents, template, create/submit amendment | ADMIN, LEASING_MANAGER, MALL_DIRECTOR, LEGAL |
| Status change, approve amendment, termination | ADMIN, LEASING_MANAGER, MALL_DIRECTOR |

Mall scoping is enforced on Contract list/detail/mutations. Tenant list/detail
is additionally forced to the authenticated Tenant. Contract-file download
Mall enforcement was closed under CR-101 Phase 3C and must be preserved.

### UX gap

The current page does not use the authenticated role when rendering status,
document, amendment, or termination actions. FINANCE, LEGAL, and TENANT users
can see actions that their endpoint role cannot execute and receive a 403 only
after interaction. Golden Contract must make action availability role-aware
without weakening backend authorization.

TENANT is explicitly allowed to list/detail, but several staff-only detail
queries/tabs inherit the stricter Contracts role list. A future implementation
must either render the existing tenant-safe read subset or route TENANT users
to the existing Tenant Portal experience. It must not broaden endpoints.

## 8. Financial presentation audit

- `Contract.currencyCode` is authoritative for Contract rent, CAM, deposits,
  fees, and downstream Billing schedule currency.
- Core Booking → Proposal → Contract → Billing currency propagation is verified
  for VND/USD/MMK.
- List rent already uses `formatMoneyAmount` plus a separate Currency column.
- Single-Contract detail uses exact `formatMoney` values and a currency badge,
  which is compliant with CR-109.
- Billing schedule values are exact and tied to one Contract currency. The
  Billing tab should show that ISO currency once in its persistent section
  header rather than leave currency context in another tab.
- No K/M/B/tr/triệu/tỷ abbreviation is acceptable in Contract list, detail,
  amendments, termination, documents, or schedule rows.
- Deposit Lease, Deposit Fitout, Fitout Fee, Utility Fee, and After-hours Fee
  exist in the Contract response but are largely absent from current detail.
  They may be shown only with their authoritative Contract currency and actual
  existing labels; no total obligation formula may be invented.
- Current DTO comments still describe some fields as VND even though the model
  uses Contract currency. This is a documentation/correctness smell, not a UI
  license to relabel the stored values.

## 9. Billing handoff audit

- Activation and Billing schedule generation are in one Serializable
  transaction. An ACTIVE Contract should not exist without its mandatory
  schedule through the canonical activation path.
- Same-status activation replay is an existing recovery mechanism.
- Detail exposes Billing schedule existence and a schedule table with linked
  Invoice identities/statuses.
- The schedule endpoint is the correct owner for schedule data. Contract list
  does not expose outstanding balance or a Billing summary.
- “Rebuild schedule” is an existing maintenance action. It should be secondary,
  role-aware, and not presented as the normal activation handoff.
- Billing handoff presentation should use factual states only: schedule exists,
  no schedule, period status, linked invoice, and Invoice status. “Ready” or
  “blocked” requires explicit backend evidence and must not be inferred.

## 10. Fitout handoff audit

- `contract.activated` is enqueued through the transactional outbox.
- Fitout consumes the event and idempotently creates a Fitout project.
- Contract detail returns `fitoutProject.id/status`; current UI shows only
  existence and a link.
- Golden Contract can show the returned current Fitout stage/status and link to
  the project. It must not add a manual “Start Fitout” action or imply that the
  operator owns automatic project creation.

## 11. Amendment audit

- Existing lifecycle: `DRAFT → SUBMITTED → APPLIED`.
- Creation supports real amendment types and whitelisted Contract fields.
- Submit is restricted to edit roles; approval/application is restricted to
  status roles.
- Billing-relevant applied changes rebuild the schedule.

Current UX shows only amendment number, type, raw status, and one action. It
does not expose effective date, reason, changed values, creator, submission
date, or approval date even though the model carries most of this evidence.
Approval is a one-click financial/legal mutation with no confirmation.

The Golden design should make amendment identity, exact before/after values,
currency, effective date, reason, status, and permitted action readable. It
must not introduce a new approval lifecycle.

## 12. Termination audit

Termination is correctly separated from routine status buttons and uses a red
primary treatment. The existing form captures reason, effective date, notice,
deposit refund, penalty, and a handover checklist.

Weaknesses:

- Initiate, complete, and cancel actions have no confirmation dialog.
- Deposit refund and penalty inputs need explicit Contract currency context.
- The operation sits as an equal top-level tab, which makes a high-risk
  lifecycle action look like ordinary reference navigation.
- UI does not surface the authoritative eligibility rule that initiation is
  limited to ACTIVE/EXPIRING until the backend rejects it.

Golden Contract should move termination into a separated danger/action area
and use the existing confirmation primitive. It must preserve current
termination semantics and checklist.

## 13. Documents and history audit

### Documents

- Contract uses `ContractFile`, not `UnifiedDocument`, for its visible file
  list.
- Upload, authenticated download, internal hash signing, verification, and
  delete exist.
- Delete already has confirmation; signed files cannot be deleted.
- Internal-signature copy explicitly states it is integrity verification, not
  a legally binding digital signature. Preserve that distinction.
- Template render is a separate tab and currently only produces a success
  toast; the rendered response is not shown or persisted as a Contract file.
  Do not describe it as a saved document.

The Golden design should use one Documents area for Contract files and place
template rendering as a secondary document utility, without pretending the two
storage models are unified.

### History

- The visible timeline reads `ContractEvent` and includes status/update and
  amendment-applied events created by current services.
- It is not a guaranteed complete audit log: Proposal conversion Contract
  creation, termination operations, and file operations are not all written to
  `ContractEvent`.
- The global Audit Log exists separately and is not merged into this endpoint.

Label this surface “Contract activity” or “Contract events,” not a complete
audit history, unless an additive authoritative history read model is approved.

## 14. Responsive risks

No browser session was available during this readiness pass. No rendered
responsive PASS is claimed.

| Viewport | Source-level risk |
|---|---|
| 1920×1080 | Worklist is usable but header/status/filter layers consume vertical space before the table. Detail still uses only 560px despite available width. |
| 1440×900 | Filter controls wrap; seven detail tabs are likely to exceed Sheet width. |
| 1366×768 | Fixed 560px Sheet plus dense padding leaves limited worklist context; long tabs and Billing table are likely to clip. |
| 1024×768 | Shared Sheet remains fixed at 560px; TabsList has no scroll/wrap; internal Billing table lacks contained horizontal scrolling. |

Existing good behavior: the main list owns horizontal scrolling. Required
implementation behavior: responsive Sheet width, scrollable/condensed tab
navigation, contained internal tables, fixed/sticky object header/action area,
and no page-level horizontal scroll. Do not use `overflow:hidden` as a
structural workaround.

## 15. Business logic and correctness concerns — separate CR only

The following were observed or re-confirmed. They are not authorized for
correction in Golden Contract UX:

1. Termination initiation writes `ContractTermination` and
   `Contract.status=TERMINATING` in separate unwrapped writes.
2. Termination completion commits Contract/Termination together but releases
   Unit status outside that transaction.
3. Amendment approval updates Contract, rebuilds Billing schedule, marks the
   amendment APPLIED, and logs the event through sequential writes rather than
   one atomic transaction. A failure can leave partial lifecycle/history state.
4. Cancelling termination can restore ACTIVE/EXPIRING without rebuilding a
   schedule after an intervening amendment; already tracked as a reliability
   edge case.
5. Contract direct creation writes Contract, Unit status, and Contract event
   sequentially; proposal conversion has stronger transaction behavior.
6. `ContractStatus` frontend typing omits `TERMINATING`.
7. Some DTO descriptions hardcode VND for fields stored under the Contract’s
   authoritative currency.

These findings must be tracked separately. The UX program may improve warning,
confirmation, and presentation, but may not alter the operations.

## 16. Authorization concerns

- Backend Contract Mall/Tenant enforcement is currently present and must remain
  untouched.
- Frontend action visibility does not match endpoint roles.
- TENANT can access Contract list/detail but not the complete staff utility
  surface queried/rendered by the current detail sheet.
- Contract file retrieval Mall enforcement is resolved in current code under
  CR-101; older System Truth text describing it as open is stale.

## 17. API and schema gaps

### API gaps that affect optional enhancements

- No server-derived `allowedActions`/blocked-reason model for every Contract
  state and role; only activation has explicit readiness.
- List rows do not return Mall name, Billing state, outstanding balance, Fitout
  stage, or action metadata.
- Billing navigation has no Contract-scoped link/filter in current UI usage.
- Events endpoint is ContractEvent-only, not a complete cross-domain history.
- Expiring list is not paginated.
- Unit filter is not a server-search finder and is capped client-side.
- No authoritative server sorting contract is exposed for the Contract list.

The base Golden architecture does not require these fields. If implementation
adds any of them, use an additive, Mall-scoped read contract with a reviewed
Impact Map. Do not compute Billing balance in Contracts.

### Schema gaps

No schema change is required for the recommended base implementation.
`signedDate`, `durationMonths`, and `serviceCharge` referenced by the current UI
are not Contract fields; omit them or use actual existing fields instead of
adding schema in this program.

## 18. Business confirmations required

These questions do not block the base architecture because the design avoids
inventing their answers. They do block the named optional presentation:

1. **UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** Is TENANT access to the staff
   `/contracts` object page intentional, or should TENANT use only Tenant
   Portal? Until answered, preserve current list/detail access and render only
   endpoint-permitted read content/actions.
2. **UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** Who owns each
   PENDING_LEGAL/PENDING_SIGNATURE step, and is `managedBy` the authoritative
   owner? Do not show a named “next owner” without confirmation.
3. **UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** What is the authoritative
   renewal behavior for an EXPIRING versus EXPIRED Contract? Do not create a
   prominent Renew action beyond the current amendment capability.
4. **UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** May termination proceed with
   outstanding invoices or incomplete Fitout obligations? Current service does
   not encode such blockers; do not invent them in the UI.

## 19. Recommended Golden Contract architecture

```text
COMMAND HEADER + MALL CONTEXT
  ↓
COMPACT CONTRACT ATTENTION / FILTER CONTROL
  ↓
DENSE CONTRACT WORKLIST (master)
  ↓ select
RESPONSIVE CONTRACT OBJECT PAGE (detail)
  Object identity + status + restrained actions
  Key facts / dates / financial context / downstream handoffs
  Overview | Financial & Billing | Documents | Amendments | Activity
  Separated high-risk termination workspace
```

The exact design is specified in `CR-GOLDEN-CONTRACT-DESIGN.md`.

## 20. Future implementation scope

- Recompose the Contract page and detail using existing ERP/shared components.
- Make list and object detail the dominant master-detail surfaces.
- Make actions role- and state-aware using current endpoint authority.
- Consolidate detail hierarchy and reduce decorative containers.
- Apply CR-109 exact-money presentation everywhere.
- Expose current Billing/Fitout facts without changing automation.
- Improve amendment/document/activity readability.
- Separate and confirm dangerous termination actions.
- Fix frontend-only localization/type/responsive defects that do not change
  backend semantics.
- Add focused frontend tests and perform rendered viewport verification.

## 21. Out of scope

- Contract, Proposal, Booking, Invoice, Fitout, Unit, or termination lifecycle
  changes.
- Proposal-to-Contract conversion or activation atomicity changes.
- Billing schedule generation or Fitout auto-create changes.
- Amendment/termination correctness fixes listed above.
- Currency propagation, financial formulas, FX, schema, migrations, or data
  correction.
- Mall/Tenant authorization policy changes.
- New approval workflow or invented lifecycle stages.
- Dashboard, Booking, Billing, or rollout to other modules.
- A new component/design system.

## 22. Readiness decision

Golden Contract is ready for a separately authorized implementation because the
base object-page architecture can be built from verified current functionality
without answering the optional business questions or changing backend
semantics.

**IMPLEMENTATION READINESS: READY**
