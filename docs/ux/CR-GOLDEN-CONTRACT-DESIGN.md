# CR-GOLDEN-CONTRACT — Golden Object Page Design

**Target archetype:** Master-detail / Document lifecycle workspace
**Phase:** IMPLEMENTED — awaiting human visual review
**Depends on:** `docs/ux/CR-GOLDEN-CONTRACT-READINESS.md`

**Implementation authorization:** approved by the subsequent Golden Contract
implementation authorization. This design is now reflected in the frontend;
no backend, API, schema, database, or business-rule change was made.

## 1. Design objective

Golden Contract establishes the ERP business-object pattern. A user should
understand within seconds:

1. Which Contract is selected?
2. Who is the Tenant and where is the Unit?
3. What is the authoritative status?
4. When does it start and expire?
5. What are the exact financial terms and currency?
6. What action is allowed now?
7. Did Billing and Fitout handoffs occur?
8. Where are the documents, amendments, and Contract events?

It is not a Dashboard, a Booking transaction cockpit, or a Billing-first table.
The list is the master work surface; the selected Contract is a persistent
business object with lifecycle context.

## 2. Design principles

- Preserve authoritative Contract and termination states exactly.
- Present one object identity and one current status before any secondary tab.
- Use current state, role, readiness, and endpoint capability for actions.
- Do not render a decorative lifecycle that implies nonexistent transitions.
- Keep exact amount and ISO currency inseparable in meaning.
- Use typography, alignment, rows, and dividers before rounded containers.
- Keep downstream automation factual: show what exists, not an invented manual
  step.
- Keep high-risk legal/financial actions separated and confirmed.
- Reuse approved ERP tokens and shared components.
- Do not create generic ObjectHeader/KeyFacts abstractions until Contract proves
  repeated, stable requirements.

## 3. Target page architecture

```text
COMMAND HEADER
  Contracts identity, Mall context, concise operational purpose
  Secondary: Expiring view

CONTRACT ATTENTION + CONTROL BAR
  Status segments/counts integrated with search and filters

CONTRACT WORKLIST — MASTER
  Dense, paginated, exact financial values

CONTRACT OBJECT DETAIL — CONTEXTUAL
  Sticky object header
  Key facts and downstream handoff strip
  Contextual tabs
  Sticky/visible action context where appropriate
```

On desktop, selection keeps list context visible in a responsive right-side
object sheet. At 1024px, the same object detail may occupy most of the viewport;
it remains the same information architecture, not a separate mobile flow.

## 4. Command header and attention controls

Use the existing `PageHeader` and global Mall selector context.

- Eyebrow: Leasing / Contracts domain, localized.
- Title: Contracts.
- Description: one operational sentence, not “upload scan & e-sign.”
- Secondary action: toggle/show expiring Contracts.
- No generic Create Contract primary CTA. The approved main journey creates a
  Contract from an approved Proposal; the current empty state already routes to
  Proposals. Direct backend creation remains unchanged but is not promoted.

Replace five independent status cards plus a separate lease-term segmented row
with a compact status/attention strip integrated near the toolbar. Counts remain
clickable filters, not KPI cards. Recommended segments:

- All.
- Preparing: DRAFT + PENDING_LEGAL + PENDING_SIGNATURE.
- Active.
- Expiring.
- Ended: EXPIRED + TERMINATING + TERMINATED, with termination visually distinct
  inside status badges rather than changing grouping semantics.

Use restrained semantic color only for status/attention. No gradients, large
icons, or elevated card row.

## 5. Unified filter bar

Use existing `ERPToolbar` and current server filters:

1. Debounced search: Contract number, Tenant, Unit.
2. Status.
3. Contract type.
4. Lease-term type.
5. Floor.
6. Unit.
7. Contract start-date range.
8. Clear filters when active.
9. Result count.

The Unit Select remains an acknowledged capped-filter limitation in the base
scope. Do not imply it searches every Unit if it still consumes a 500-row
client list. A future additive server finder is optional and separately
reviewed.

Do not add client-side sorting over one server page. Add sorting controls only
after an authoritative server sort contract exists.

## 6. Contract worklist

### 6.1 Recommended columns

| Column | Existing source | Presentation |
|---|---|---|
| Contract | `contractNumber`, `type` | Monospace identity; type secondary |
| Tenant | `tenant.brandName`, `companyName` | Tenant first; company secondary where useful |
| Unit / Location | `unit.code`, `unit.floor.name` | Unit first; Floor secondary; Zone only if returned in list |
| Start | `startDate` | Exact localized date |
| Expiry | `endDate` + derived days remaining | Date first; attention text only near expiry |
| Status | `status` | Localized `ERPStatusBadge` |
| Rent Amount | `rent` | Right-aligned `ERPAmount` numeric-only mode / `formatMoneyAmount` |
| Currency | `currencyCode` | Separate ISO column |
| Documents | existing file summary if returned | Count/signing indicator, not an icon-only mystery |
| Open | selected row / explicit affordance | Keyboard/focus accessible |

Creation time and lease-term type remain discoverable as secondary row metadata
or filters, not necessarily prime standalone columns. The final choice should
be validated at 1366 and 1024 without losing Contract identity, status, expiry,
or money.

### 6.2 Deliberately omitted columns

- Mall name: absent from list response; global Mall context is authoritative in
  the base scope.
- Outstanding/Billing state: absent from list response and owned by Billing.
- Fitout stage: absent from list response.
- Action mutations: not appropriate as casual row buttons.

### 6.3 Table behavior

- Worklist owns the majority of page height.
- Selected row remains visibly selected while detail is open.
- Header may be sticky inside a contained table scroller.
- Horizontal scrolling belongs to the table surface only.
- Loading, error/retry, empty, and filtered-empty states reuse `AsyncState`.
- Server pagination stays attached to the table.
- Status/expiry color is supplemental; exact text remains visible.

## 7. Contract object header

The persistent object header is the most important change.

### Identity block

- Contract number.
- Localized status badge.
- Contract type.
- Tenant brand/company.
- Unit + Floor/Zone.
- Global Mall context or authoritative Mall name when available.

### Time and financial context

- Start date.
- Expiry date and days remaining when relevant.
- `term` using the actual field; do not use nonexistent `durationMonths`.
- Contract currency ISO code.
- Exact base rent/month as the primary financial context.

### Action block

Show at most one primary action, based on actual status, role, and readiness.
Secondary actions are links/utilities; dangerous actions move to a separated
menu/workspace.

Do not show a named workflow owner until business confirmation establishes an
authoritative owner field.

## 8. Status and action hierarchy

### Status-derived presentation

| Current status | Primary/next context | Secondary | Never imply |
|---|---|---|---|
| DRAFT | Activate when permitted and ready, or move to Legal when that path is selected | View readiness and terms | Legal review is mandatory; backend also permits direct activation |
| PENDING_LEGAL | Move to Pending Signature when permitted | Return to Draft | A named Legal owner without data |
| PENDING_SIGNATURE | Activate when permitted and ready | Return to Pending Legal | A legally completed signature solely from internal hash signing |
| ACTIVE | No routine mutation required | View Billing, Fitout, documents; initiate termination in danger area | Manual Billing/Fitout creation |
| EXPIRING | Expiry attention and existing permitted actions | Amendment/renewal context only as currently supported | A new renewal lifecycle |
| EXPIRED | Read-only terminal context | Documents/activity | Reactivation not supported by matrix |
| TERMINATING | Complete/cancel through dedicated termination service | Checklist and effective date | Routine status button |
| TERMINATED | Read-only terminal context | Documents/activity | Reopening |

Status actions render only for ADMIN, LEASING_MANAGER, and MALL_DIRECTOR.
Edit/document/amendment actions render only for their current backend roles.
FINANCE, LEGAL, and TENANT receive the read/action subset their endpoints
actually permit. Backend authorization remains authoritative.

### Activation readiness

- Display the existing `ready` result and `missing` reasons near Activate.
- Treat reasons as backend authority, but localize presentation safely. The
  current response contains English prose; implementation should prefer stable
  reason codes if an additive API is authorized. Do not parse prose into new
  business rules.
- Disabled Activate must explain why through visible text, not only disabled
  styling.

## 9. Key facts and overview

Overview is summary-first and uses dense fact rows, not a grid of cards.

Recommended groups:

### Parties and location

- Tenant brand/company.
- Unit code/name.
- Floor and Zone.
- Contract manager when present.
- Origin links: Proposal, Booking, Lead.

### Contract period

- Start date.
- End date.
- Term.
- Expiry attention.
- Operating hours where present.

### Current financial terms

- Rent/month.
- CAM/month.
- Deposit and existing deposit subtypes.
- Existing fees, each individually labeled.
- Currency once at section level plus exact amount formatting.

Do not calculate a “total Contract value,” “total obligation,” or consolidated
deposit unless an authoritative backend formula is approved.

### Downstream handoff strip

Two compact factual rows, not cards:

- Billing: schedule exists / no schedule; period count/current schedule facts
  when returned; link to schedule/Billing context.
- Fitout: project exists / not yet observed; returned current stage/status; link
  to Fitout project.

For ACTIVE/EXPIRING Contracts, a missing handoff is attention. For pre-active
Contracts, absence is expected and should not look like an error.

## 10. Contextual tabs

Use five primary tabs backed by real current functionality:

1. **Overview** — identity-supporting facts, status/readiness, source, dates,
   current terms, Billing/Fitout handoff.
2. **Financial & Billing** — exact financial terms, Billing schedule, linked
   Invoice status, existing maintenance rebuild action.
3. **Documents** — Contract files plus template render as a secondary utility.
4. **Amendments** — amendment lifecycle and evidence.
5. **Activity** — ContractEvent timeline, honestly labeled as Contract events.

Fitout does not receive a full tab in the base design because Contract API only
supports current project identity/status and navigation. A blank or link-only
tab would add symmetry without decision value.

Termination is not an equal reference tab. It opens as a separated lifecycle
workspace/action area when current status and role allow it. If implementation
must retain a tab for technical simplicity, place it last, visually separated,
and only render it to eligible roles/statuses.

Tabs must horizontally scroll or collapse predictably inside the object detail;
they must not overflow the Sheet.

## 11. Financial & Billing tab

### Contract terms

- Show exact fields already present on Contract.
- Show one persistent ISO currency context.
- Use canonical `formatMoney`/`ERPAmount`; never raw local formatters.

### Billing schedule

- Preserve period, subtotal, due date, schedule status, Invoice identity,
  Invoice status, exact collected amount, and exact Invoice total.
- The section header states Contract currency. No implicit VND.
- If a table introduces a Currency column, amount cells become numeric-only.
- Keep schedule table horizontally contained.
- “Rebuild schedule” is secondary and role-aware, with confirmation if current
  behavior can replace/recompute entries.
- Do not calculate Contract outstanding for the list or object header from the
  visible 12-Invoice subset.

The current frontend summaries (scheduled, collected, remaining, collection
rate) may remain only if reconciled to the complete authoritative schedule
response and single currency. They must not be promoted as cross-contract KPIs.

## 12. Billing and Fitout handoff semantics

### Billing

```text
Contract activation transaction
  → Contract ACTIVE
  → BillingScheduleEntry upserts
```

Present “Billing schedule created” only when entries exist. Present “No schedule
observed” otherwise. Do not label the Contract “Billing blocked” without an
authoritative blocker.

### Fitout

```text
Contract activation transaction
  → durable contract.activated event
  → idempotent Fitout project creation
```

Present the returned Fitout project status and link. “Create Fitout” is not a
Contract action in this design.

## 13. Amendments

Amendment rows should show:

- Amendment number.
- Localized type and status.
- Effective date.
- Reason.
- Exact changed fields, before/after where current data permits.
- Currency for monetary changes.
- Created/submitted/approved dates where returned.
- One allowed next action.

Action hierarchy:

- DRAFT: Submit for approval — secondary/controlled action.
- SUBMITTED: Approve and apply — consequential primary action for permitted
  roles, with explicit confirmation summarizing changed fields and Billing
  schedule impact.
- APPLIED: read-only evidence.

Do not add rejection, multi-step approval, or rollback states; they do not exist
in the current amendment model.

## 14. Termination

Termination is a high-risk lifecycle workspace.

### Entry

- Available only for ACTIVE/EXPIRING and authorized status roles, matching
  current service behavior.
- Accessed from a separated danger/lifecycle action, not next to routine View
  Billing/View Fitout links.
- Initiation confirmation states effective date, notice period, deposit refund,
  penalty, and Contract currency.

### In progress

- Show authoritative termination status.
- Show reason, initiated-by, effective date, notice, exact financial values and
  currency.
- Preserve the three existing handover checklist items.
- Complete remains disabled until all current checklist requirements are true,
  with visible explanation.
- Complete and Cancel each require confirmation.

### Complete

- Read-only completed timestamp and result.
- Do not visually promise Unit release atomicity; that is a separate correctness
  concern.

## 15. Documents

- Use one dense file list grouped by state (signed internal / unsigned) only if
  the existing data supports it.
- Show file name, type/size, uploaded date, internal signing state, signer, and
  available actions.
- Retain authenticated download.
- Retain explicit “internal integrity verification, not legal digital
  signature” warning.
- Delete remains destructive and confirmed; signed files remain protected.
- Upload zone becomes compact after files exist to reclaim vertical space.
- Template render sits in Documents as a secondary utility. Current API response
  is preview/render content, not a persisted ContractFile; label it accordingly.

Do not merge `ContractFile` and `UnifiedDocument` in this program.

## 16. Activity

- Use a chronological, dense timeline/list.
- Show event title/type, timestamp, actor when returned, and concise before →
  after status/value.
- JSON payloads should be presented as human-readable field changes only when
  their keys have known labels; preserve raw detail in expandable secondary
  content if needed.
- Label the tab “Contract activity/events,” not “Complete audit history.”
- Empty/error/loading states are explicit.

Do not synthesize missing termination/file events in the frontend.

## 17. Permission-aware presentation

The UI must query the existing auth store and render only endpoint-permitted
actions. This is presentation alignment, not authorization.

- Read-only users still see authoritative status and why an action is not theirs
  when useful.
- Unsupported mutations are not rendered as active buttons that predictably
  fail with 403.
- TENANT receives only the currently authorized Contract read subset. Staff-only
  tab queries should not run for TENANT.
- Backend Mall/Tenant checks remain unchanged and authoritative.

No new role, permission, endpoint access, or policy is introduced.

## 18. Responsive specification

### 1920×1080

- Worklist and selected object remain visible together.
- Object sheet may be wider than the current 560px to support fact hierarchy,
  but must preserve meaningful list context.
- Header, key facts, and several rows are visible without excessive scroll.

### 1440×900

- Toolbar may wrap once.
- Object sheet remains responsive; five tabs fit or scroll inside their own
  navigation area.
- No fixed-width child can enlarge the page.

### 1366×768

- Status strip and toolbar remain compact so list header + useful rows stay in
  the viewport.
- Object detail prioritizes identity/status/actions, then scrollable content.
- Billing schedule owns contained horizontal scrolling.

### 1024×768

- Object sheet uses a viewport-bounded width such as `min(100vw, 640px)` or a
  verified equivalent; do not retain an unconditional `w-[560px]` without
  testing.
- Tabs scroll/collapse within the detail surface.
- Key facts use one/two columns based on available width.
- All tables scroll inside their section; no page-level horizontal scroll.

All four viewports require rendered screenshots in implementation. Source
review alone cannot produce a responsive PASS.

## 19. Accessibility

- Selected row and open-detail affordance are keyboard accessible.
- Status and expiry never rely on color alone.
- Disabled actions expose a textual reason.
- Tabs preserve Radix keyboard behavior and visible focus.
- Object sheet has a clear accessible title and close control label.
- Icon-only document actions retain tooltips and accessible names.
- Confirmations describe the actual consequence, not generic “Are you sure?”
  copy.
- Exact financial strings remain selectable/readable and do not clip.

## 20. Reusable pattern candidates

Conceptual patterns proven by Golden Contract may later inform Proposal,
Service Contract, Tenant, Work Order, and Fitout detail. No rollout is included.

| Concept | Contract proof point | Reuse approach |
|---|---|---|
| ObjectHeader | Identity, status, currency, dates, restrained actions | Compose with existing Sheet/PageHeader first |
| KeyFacts | Parties, location, term, financial context | Dense rows/dividers; no new card system |
| StatusActionBar | Current state, readiness, one primary action | Domain-owned mapping, not generic lifecycle invention |
| DetailTabs | Five evidence-backed sections | Existing Tabs with responsive behavior |
| FinancialSummary | Exact single-object terms | Existing ERPAmount/currency utilities |
| DocumentSection | ContractFile actions and signing state | Existing buttons/dialogs/download helper |
| HistoryTimeline | ContractEvent chronology | Domain-specific data with shared visual recipe |

Create a shared abstraction only after at least one additional object page
demonstrates the same stable props and behaviors. Golden Contract implementation
should stay composed from existing shared primitives.

## 21. Existing components to reuse

- `PageHeader`.
- `ERPToolbar`.
- `ERPStatusBadge`.
- `ERPAmount` and canonical currency formatters.
- `Sheet`, extended responsively rather than replaced by a parallel drawer.
- `Tabs`, with contained responsive navigation.
- `AsyncState`.
- `ConfirmActionDialog` / existing confirmation primitives.
- Existing Inputs, Selects, DateRangePicker, Badges, and buttons.

`ERPStatCard` is not the default for Contract status counts; a compact filter
strip is more appropriate.

## 22. Optional additive API work

Not required for the base Golden architecture:

- Server-derived allowed-actions/readiness codes.
- Mall name in list rows for all-Mall presentation.
- Billing-owned Contract summary/outstanding state.
- Fitout stage in list rows.
- Contract-scoped Billing navigation/filter.
- Paginated expiring list.
- Server-search Unit filter.
- Server sorting.
- Unified cross-domain activity read model.

Any addition requires its own Impact Map, Mall/Tenant query scoping, backward
compatibility, tests, and no schema change unless separately authorized.

## 23. Implementation verification gates

- Focused Contract frontend tests for list hierarchy, status presentation,
  role-aware actions, exact money, filtered empty, and detail tabs.
- Existing Contract backend focused tests if backend is untouched; targeted new
  tests only for an authorized additive read API.
- Currency tests for VND/USD/MMK and large exact values.
- TypeScript and frontend production build.
- Backend tests/build only if backend changes are separately authorized.
- `git diff --check`.
- Rendered review at 1920×1080, 1440×900, 1366×768, and 1024×768.
- GS-01, GS-04, GS-05, GS-07 happy path, GS-09, GS-10, GS-11/12/13, GS-14,
  and GS-15 as applicable to the actual implementation diff.
- Reconcile Contract list/detail currency and terms, Contract/Billing schedule
  currency, and Contract/Fitout status links.

Known termination/amendment transaction defects are separate correctness work;
Golden UI must not claim those failure-injection gates pass until fixed.

## 24. Implementation scope after authorization

- Frontend Contract page/detail information architecture and density.
- Role-aware presentation using existing roles/endpoints.
- Existing status/readiness/action hierarchy only.
- CR-109 exact money compliance and currency context.
- Billing/Fitout handoff visibility using current response data.
- Amendment, documents, activity, and termination visual hierarchy.
- Localization, frontend typing, async-state, and responsive fixes local to
  Contracts.
- Focused tests and rendered verification.

## 25. Out of scope

- Backend lifecycle/state/transition changes.
- Proposal conversion, activation, Billing generation, Fitout automation, or
  termination behavior changes.
- Correctness fixes documented in Readiness §15.
- Financial formulas, currency propagation, FX, schema, database, migrations.
- Authorization policy changes or broader Tenant access.
- New approval states or renewal semantics.
- Dashboard, Booking, Billing, or other-module rollout.
- New parallel design/component system.

## 26. Design decision

The recommended Golden Contract pattern is:

**dense Contract master worklist → responsive Contract object header → compact
key facts and factual handoffs → five contextual evidence tabs → separated
high-risk lifecycle actions**.

This design is implementable with current authoritative functionality. Optional
API enhancements and open business questions are deliberately excluded from
the base architecture so implementation can proceed without inventing business
semantics.
