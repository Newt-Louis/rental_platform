# CR-GOLDEN-PROPOSAL & APPROVAL — Phase A UX Readiness

**Owner:** Codex

**Date:** 2026-08-24

**Phase:** IMPLEMENTED — AWAITING HUMAN VISUAL REVIEW

**Application code changed:** FRONTEND PRESENTATION ONLY

## 1. Executive conclusion

Proposal and Approval already form an executable commercial-decision flow,
but the current screens present it as two feature-heavy admin pages rather
than one coherent ERP decision system. The Proposal page has a useful
paginated worklist, exact Amount/Currency columns, a detail sheet, scenarios,
versions and document editing. The Approval page has a role-filtered decision
queue, sequential approval enforcement, exact Amount/Currency columns,
decision history and a detailed workflow sheet.

The primary UX problems are information hierarchy and authority. Proposal
identity, parties, location, commercial value, approval position and the true
Contract handoff are fragmented. Approval decisions can be taken directly
from a crowded row before the approver sees the full evidence. The page also
mixes Proposal approvals and Booking price approvals inside one visually equal
surface. Several decorative status cards and repeated containers consume
space without improving decision quality.

The executable flow also exposes business-truth conflicts that a Golden UI
must not conceal:

1. `rentFree` is treated as months by Proposal financial calculations and some
   Proposal views, but Booking conversion and Approval policy/UI call it days.
2. Booking→Proposal conversion calculates commercial totals differently from
   direct Proposal create/update.
3. Proposal scenarios calculate rent/total differently from the Proposal
   source of truth, and their `score` has no located approved business meaning.
4. Approval steps do not persist the policy rule or evaluated trigger that
   created them; the current queue reconstructs a reason from the *currently
   active* policy by `stepName + approverRole`.

The blocking business confirmations were resolved on 2026-08-24. Rent-free is
presented as days without changing any calculation; scenarios are explicitly
non-authoritative simulations and their score is hidden; commercial type is
omitted; supplementary money follows Proposal currency only where existing
data proves that relationship; and bulk Approval decisions are prohibited.
The calculation/currency discrepancies remain isolated in
`docs/changes/CR-PROPOSAL-APPROVAL-CORRECTNESS-BACKLOG.md`.

## 2. Evidence reviewed

### Governance and system truth

- `AGENTS.md`, `RUN-FIRST.md`, and the mandatory governance sequence.
- System Truth for the Lead→Booking→Proposal→Approval→Contract journey,
  Proposal/Approval state machines, transactions, roles, Mall access,
  multi-currency and Golden E2E scenarios.
- Current executable code was treated as stronger evidence than stale prose.
  In particular, current Approval completion **and rejection** events are both
  transactionally enqueued through the outbox.

### UX and money standards

- `docs/ux/02-ERP-DESIGN-SYSTEM.md`
- `docs/ux/03-PAGE-ARCHETYPES.md`
- `docs/ux/04-TABLE-STANDARD.md`
- `docs/ux/06-OBJECT-PAGE-STANDARD.md`
- `docs/ux/08-COMPONENT-ARCHITECTURE.md`
- Golden Dashboard, Booking, Billing and Contract references.
- CR-109 money standard and its completed Amount/Currency correction.

### Executable sources

- Proposal controller, service, DTOs, scenarios, PDF/editor, Prisma models and
  focused service/conversion tests.
- Approval controller, service, policy evaluator, DTOs, Prisma models and
  transaction/pending-queue tests.
- Booking conversion service/controller and frontend conversion form.
- CRM deal/timeline read models and Proposal/Approval entry links.
- `ProposalsPage.tsx`, `ProposalEditor.tsx`,
  `CreateProposalDialog.tsx`, `ApprovalsPage.tsx`, API clients, roles and
  locale resources.

## 3. Executable E2E flow

```text
CRM Lead / Customer
  → Booking (must be ACTIVE; price approval cannot be PENDING/REJECTED)
  → Booking conversion creates Proposal DRAFT and marks Booking CONVERTED
  → Leasing completes DRAFT commercial/document content
  → Submit creates ApprovalWorkflow IN_PROGRESS + ordered PENDING steps
  → Current eligible approver approves or rejects one step
  → all steps APPROVED → workflow APPROVED → Proposal APPROVED
  → if Tenant exists: Contract DRAFT is created automatically and Proposal
    becomes CONVERTED
  → if Tenant is missing: Proposal remains APPROVED; authorized user creates/
    resolves Tenant and invokes the existing manual conversion endpoint
```

There is also a backend `POST /proposals` direct-create path. The current
Proposal list UI does not expose it: “Create Proposal” selects an eligible
ACTIVE Booking and invokes Booking conversion. CRM exposes linked Proposal
context and navigation but does not provide a separate direct-create
workspace.

### Entry-point constraints

- Booking conversion requires `BookingStatus.ACTIVE`.
- A Booking with Proposal already linked cannot be converted again.
- Booking price approval `PENDING` or `REJECTED` blocks conversion.
- Current UI fetches at most 100 ACTIVE Bookings for the entry picker and then
  filters client-side; users are not informed if eligible inventory exceeds
  that retrieval limit.
- Booking conversion carries Lead or Customer-derived Tenant when available
  and preserves selected/Booking currency.

### Submission and concurrency

- Only Proposal `DRAFT` can be submitted.
- Active approval policy rules are evaluated from discount, rent-free,
  industry, AR debt and VND pricing-deviation context.
- A Proposal cannot submit without at least one matching/required approval
  step.
- Proposal status update and workflow/step creation occur in a Serializable
  transaction.
- The unique workflow-per-Proposal constraint and P2002 recovery protect a
  double-submit race.
- VND category price-floor/ceiling evaluation is deliberately skipped for
  non-VND Proposals because that pricing master is VND-only.

### Approval decisions and concurrency

- Pending work is role/assignment filtered, then limited to a step whose all
  earlier steps are already approved.
- Approve/reject rechecks pending step, workflow, role, assignment and prior
  steps inside a Serializable transaction.
- Approve comment is optional; reject comment is required with minimum length
  5 by the API DTO and current UI.
- Final approve and reject write their durable outbox event in the same
  transaction as the decision.
- No code path was found that writes Proposal `UNDER_REVIEW`, Workflow
  `PENDING`, or Step `SKIPPED`. They are valid schema enum members but are not
  current executable transitions.

### Proposal→Contract handoff

- Final approval first makes the Proposal `APPROVED`.
- When a Tenant already exists, the approval handler automatically invokes the
  hardened Proposal→Contract conversion. It creates a Contract `DRAFT`,
  propagates currency, moves the Unit to `CONTRACTED`, resolves active Booking
  state, moves Proposal to `CONVERTED`, and moves Lead to `WON` atomically.
- When Tenant is absent, the Proposal stays `APPROVED`; the user is notified
  to assign/create Tenant and use the existing manual conversion path.
- Conversion is idempotent and protected against duplicate Contract creation.
- The UI must therefore not present manual conversion as the normal next step
  for every approved Proposal.

## 4. Ownership, roles and authorization

### Proposal

| Capability | Backend-authorized roles |
|---|---|
| List/read/PDF | ADMIN, LEASING_MANAGER, LEASING_EXECUTIVE, MALL_DIRECTOR, CEO |
| Create/update/submit/editor/scenarios | ADMIN, LEASING_MANAGER, LEASING_EXECUTIVE, MALL_DIRECTOR |
| Manual Proposal→Contract conversion | ADMIN, LEASING_MANAGER, MALL_DIRECTOR |
| Direct reject submitted Proposal | ADMIN, LEASING_MANAGER, MALL_DIRECTOR |
| Delete | Proposal edit roles at controller; service allows DRAFT or REJECTED |

The frontend correctly restricts list create/edit/submit and manual conversion
at the broad role level. The detail sheet, however, renders document editing
for all readers and for non-DRAFT states even though both editor save endpoints
reject anything except DRAFT.

### Approval

Approval module access is granted to ADMIN, LEASING_MANAGER, MALL_DIRECTOR,
FINANCE, LEGAL, CEO and OPERATION. The service then narrows pending work to the
current user's assigned step or role; ADMIN can see/decide all eligible steps.
Policy administration is ADMIN-only.

Mall scope is enforced server-side through Proposal/Unit relationships.
Approval endpoints intentionally use the existing `crossMallRead` capability;
that behavior must not be reinterpreted or expanded by the UI. A decision
still passes Mall validation and step-role/assignee validation.

## 5. Current Proposal UX audit

### Worklist

Strengths:

- Server pagination, search, status, date, lease type, floor, unit and Mall
  filters exist.
- Amount and Currency are correctly separated; values use numeric-only exact
  formatting.
- Proposal, party, Unit/floor, area, monthly rent, total value, currency,
  status and state-based row actions are visible.

Problems:

- Six independent status cards plus a separate lease-type strip plus a large
  filter card create a stacked “card collection” before the primary table.
- Proposal status is visible, but Approval workflow state/current step is not.
- Mall is not returned by the list read model and cannot be an authoritative
  row column today.
- “Created age” and exact created timestamp consume a full column; there is no
  authoritative submitted timestamp.
- Tenant/Lead fallback is useful but does not label which party type is shown.
- `leaseTermType` and `businessModel` both exist; “Commercial type” is not yet
  a confirmed business label for either.
- Inline submit/convert/edit/delete controls compete inside every row. Bulk
  submit/delete makes consequential operations possible with little per-record
  evidence.
- The table requires `min-width: 1300px`; contained scrolling exists, but the
  preceding filter/status surfaces create substantial vertical pressure at
  768px height.

### Detail and object identity

Strengths:

- Detail is fetched separately and displayed in a shared Sheet.
- Lead source, Tenant, Unit, financials, term, approval steps, scenarios,
  versions and Contract result are available.
- Detail money carries a single authoritative `rentCurrency` context.

Problems:

- The Sheet title/subtitle do not answer Mall, Unit, commercial value, Approval
  position and next action as one object header.
- Repeated rounded `SheetSection`/status/lead/contract panels weaken hierarchy
  and lengthen the scroll.
- The Approval list uses nonexistent `a.level` instead of authoritative
  `stepOrder/stepName`, making step labelling unreliable.
- The current-step/next-step distinction is not clear.
- A “Deal score” action surfaces a composite metric without evidence in this
  review that it is an approved commercial KPI.
- “Edit document” is always shown although backend editor/doc-field writes are
  DRAFT-only.
- Direct reject in the Proposal sheet is a different endpoint from rejecting
  the current Approval step and can be mistaken for the approver decision.
- Approved Proposal always displays manual Contract conversion even though
  the normal Tenant-present path auto-converts immediately after final
  approval.

### Create/edit and scrolling

- The entry picker accurately chooses ACTIVE Bookings but is capped at 100
  without disclosure.
- The conversion dialog is a narrow, long form with several 3-column rows,
  nested scrolling and hard-to-scan commercial hierarchy at 1024×768.
- Commercial terms and supplementary fees are mixed with context rather than
  grouped by business meaning.
- The full-screen Proposal document editor is an A4 document-composition tool,
  not a commercial terms editor. Its permanent 288px settings panel plus A4
  canvas is unsuitable for small laptop widths without deliberate responsive
  behavior.
- The editor exposes mutable controls in non-DRAFT contexts even though save
  is rejected server-side.

## 6. Current Approval UX audit

### Inbox and queue

Strengths:

- Pending rows are authoritative current actionable steps, not notifications.
- Proposal number, queue age, step, role, party, exact money, discount,
  rent-free, total value and currency are available.
- Server pagination and Mall/floor/unit/search/lease-type filters exist.
- Decision history is paginated and links to a full workflow view.

Problems:

- Proposal approvals, Booking price approvals and history are presented as
  three equal status cards, blending two different decision object types.
- The current Proposal queue is already 1300px wide before showing Unit/Mall,
  requester, Proposal status or a trustworthy trigger explanation.
- Tenant-only display loses Lead identity when Tenant is absent.
- Mall is absent from the pending read model; Unit exists in the response but
  is not shown in the Proposal approval table.
- Requester is not included by current pending/workflow APIs.
- “Urgency” is approximated only by age since workflow/step creation. There is
  no SLA, due date or priority field; it must not be presented as overdue.
- `policyReason` is reconstructed from current active policy, not persisted
  historical evidence. It can disappear or change after policy edits.
- Approve and reject are available directly in each crowded row. Approve has
  no confirmation/evidence gate, and bulk approval can process multiple
  distinct commercial decisions sequentially.

### Decision context

The 720px detail sheet contains Proposal identity, party, Unit/floor, term,
date range, base rent, monthly rent, CAM, discount, rent-free, total value,
conditions, full step history and PDF access. This is a strong base.

It still does not expose:

- Mall name.
- Requester identity.
- A historically authoritative policy trigger.
- A clear current-decision header/action bar.
- Any submitted-versus-previous commercial comparison.
- Scenario comparison in decision context.
- Contract handoff expectation.

The pipeline component is visually large and horizontally scrollable, then
the same steps are repeated as a vertical log. This duplicates information
and pushes core commercial evidence down. The 720px rigid preferred width is
bounded by `max-width: 96vw`, but its two-column facts and long pipeline still
become cramped at 1024×768.

### Approve/reject and history

- Reject correctly requires a reason of at least five characters.
- Approve supports an optional comment in the API, but the row shortcut does
  not offer one.
- Backend role, assignment, prior-step and concurrency checks remain the
  authority even if frontend actions are hidden.
- History correctly shows actual role/approver/decision/time/comment fields.
  It is Approval-step history only; it is not a complete immutable Proposal
  audit trail and must not be labelled as one.

## 7. Validated Proposal list columns

| Candidate | Current authority | Readiness decision |
|---|---|---|
| Proposal No. | `proposalNumber` | READY |
| Tenant / Lead | list includes Tenant, Lead and Booking party fallback | READY; label party type |
| Unit | Unit code/name/floor | READY |
| Mall | not included in Proposal list Unit selection | API GAP |
| Commercial type | `unit.leaseTermType` and `businessModel` both exist | BUSINESS CONFIRMATION |
| Rent Amount | `monthlyRent` | READY |
| Currency | `rentCurrency` | READY; separate column |
| Proposal Status | `status` | READY |
| Approval state | workflow id/status returned | READY for workflow state; current step needs read-model support |
| Created date | `createdAt` | READY |
| Submitted date | no field; workflow creation is not formally named submission time | SCHEMA/API GAP |
| Action | status + role + linked Contract/Tenant context | READY with corrected hierarchy |

## 8. Commercial term authority

| Presentation term | Current field/source | Authority note |
|---|---|---|
| Area | `Proposal.area` | Proposal snapshot value |
| Term | `Proposal.term` | integer used as months in end-date/value logic |
| Start/end | `startDate`, calculated `endDate` | exact dates |
| Base rent rate | `rentPerSqm` | currency per m² |
| Monthly rent | `monthlyRent` | stored calculated field; path divergence noted below |
| CAM/service charge | `camPerSqm`, `monthlyCAM` | stored in Proposal currency by current model convention |
| Deposit months/value | `deposit`, `depositAmount`, optional `depositLease` | `depositLease` currency semantics conflict with multi-currency comments |
| Discount | `discount` | percent; absent from Booking conversion form/payload |
| Rent-free | `rentFree` | **UNKNOWN unit: days vs months** |
| Escalation | `escalationPercent` | stored but not applied by current total-value formula |
| Revenue share | `revenueSharePercent` | stored; not included in current total-value calculation |
| Marketing fee | `marketingFee` | stored; not included in current total-value calculation |
| Service/support fees | `serviceFeeSqm`, `businessSupportFeeSqm` | stored; not included in current total-value calculation |
| Utility/after-hours/fitout/deposits | supplementary fields | DTO/schema comments hardcode VND while conversion UI sometimes labels selected Proposal currency |
| Currency | `rentCurrency` | canonical Proposal ISO currency (VND/USD/MMK) |

Golden UI must show stored/calculated values, not recalculate them. Fields not
included in `totalContractValue` must not be visually implied to be included.

## 9. Scenario comparison readiness

Existing scenario records contain name, description, selected flag, JSON
terms and a computed score. They can be listed/created/updated/selected/deleted.
However:

- Selecting a scenario only marks `isSelected`; it does not apply terms to the
  Proposal.
- Scenario JSON has no currency field; display can only inherit the owning
  Proposal currency.
- Scenario `monthlyRent` includes CAM before discount, unlike Proposal
  `monthlyRent`.
- Scenario `totalValue` differs from Proposal `totalContractValue` treatment.
- Scenario `escalation` is stored but not applied.
- Scenario score is a hard-coded composite of revenue, term, discount and
  rent-free with no located approval as a business KPI.

The Golden UI may design a comparison table for raw stored scenario terms, but
must not call the score authoritative, call “selected” an applied Proposal, or
present calculated scenario totals as equivalent to Proposal totals until the
business and correctness gaps are resolved.

## 10. State and action matrix

| Proposal state | Actual meaning | Allowed/likely UI action |
|---|---|---|
| DRAFT | mutable Proposal, no submitted workflow | edit terms/document, scenarios, submit, delete |
| SUBMITTED | approval workflow created and in progress | view decision position; authorized manager may direct-reject via separate Proposal action |
| UNDER_REVIEW | schema state, no current writer found | display if legacy data exists; do not design a transition into it |
| APPROVED | final approval completed, but Contract not yet linked | usually transient; manual Tenant resolution/conversion only when auto-handoff could not run |
| REJECTED | Proposal/workflow rejected | view rejection; service permits delete; no resubmit transition exists |
| CONVERTED | Contract linked/created | open Contract; no duplicate conversion |

Approval Workflow presentation must use only `IN_PROGRESS`, `APPROVED` and
`REJECTED` in the executable Proposal path. Schema-only `PENDING` may be
displayed defensively for legacy data but must not be depicted as a normal
transition. Approval Steps similarly use PENDING/APPROVED/REJECTED; no fake
SKIPPED behavior may be introduced.

## 11. Money compliance

Current Proposal and Approval cross-record worklists are CR-109 compliant for
their main rent/value fields:

```text
Amount          Currency
75.259,00       USD
229.500.000     VND
```

Requirements for future implementation:

- Retain `formatMoneyAmount` for numeric-only table cells and a separate ISO
  Currency column.
- Use exact amount plus authoritative currency in single-record detail.
- Never abbreviate with K/M/B/tr/triệu/tỷ.
- Never sum Proposal or scenario records across currencies.
- Do not introduce FX or infer VND.
- Treat zero as a real value; current truthy checks sometimes render zero as
  missing.
- Do not change currency formatters or financial formulas in this UX program.

## 12. Responsive risks

No rendered viewport verification was performed in this Phase A audit; these
are code-derived risks to be verified during implementation.

| Viewport | Risk |
|---|---|
| 1920×1080 | Excessive status/filter cards and duplicate workflow blocks waste executive-height space |
| 1440×900 | 1300px tables leave little tolerance for page padding/sidebar; action columns are crowded |
| 1366×768 | table scroll plus stacked header/cards/filters reduces visible decision rows materially |
| 1024×768 | long 3-column conversion form, 720px sheet, two-column facts, horizontal pipeline and A4 editor are cramped |

Contained horizontal scrolling is acceptable for worklists/comparisons. Page-
level horizontal scrolling and `overflow:hidden` workarounds are not.

## 13. Change impact map for future implementation

| Area | Impact |
|---|---|
| Upstream | CRM/Booking links and Booking conversion entry context |
| Primary | Proposal list/detail/create/editor/scenarios and Approval queue/detail/history |
| Downstream | Contract link/handoff presentation only; no conversion logic change |
| Financial | Tier 0 presentation; exact stored values only, no formulas/rounding changes |
| Currency | Preserve `rentCurrency`; no FX or mixed-currency aggregation |
| Mall/Tenant | Preserve current server-side scopes; UI is not an authorization boundary |
| Authorization | Role-aware action visibility must match controllers and per-step checks |
| Events/jobs | No change; approval outbox and Contract automation remain untouched |
| Concurrency | No change; submit/decision/conversion transaction behavior remains untouched |
| Schema/database | No change in authorized UX scope |

### Golden E2E regression set for a future implementation

- GS-01: Lead→Booking→Proposal→Approval→Contract.
- GS-03: rejection path and reason visibility.
- GS-04/GS-05: Proposal→Contract currency and downstream handoff.
- GS-07/GS-09: Mall scope and role visibility.
- GS-12/GS-13: concurrent submit/decision/conversion safety.
- GS-15: durable approval completion/rejection handling.

## 14. Correctness findings — separate CRs required

These are findings only. They are **not** authorized fixes in Golden UI:

1. **Proposal calculation-path divergence:** Booking conversion uses
   `monthlyRent = area × rentPerSqm` and `total = monthlyRent × term`, ignoring
   discount, rent-free and CAM treatment used by `ProposalsService.calcFinancials`.
2. **Rent-free semantic conflict:** financial math subtracts it from month
   term, while Booking conversion and policy naming say days.
3. **Scenario calculation divergence:** scenario rent/deposit/total treatment
   differs from the Proposal stored financials.
4. **Scenario score authority:** hard-coded composite has no located approved
   business definition.
5. **Supplementary-fee currency ambiguity:** schema/DTO comments hardcode VND;
   one creation UI labels values with selected Proposal currency while the
   document editor explicitly labels some VND.
6. **Direct Proposal reject atomicity:** Proposal/Lead/Unit updates are not
   wrapped as one transaction, unlike Approval-step rejection.
7. **Entry-picker cap:** list retrieves 100 ACTIVE Bookings with no disclosure.
8. **Controller/service documentation mismatches:** delete and document-field
   mutability descriptions differ from service enforcement.

## 15. Authorization concerns

- Hide/disable DRAFT-only editor actions outside DRAFT; backend remains final
  authority.
- Do not show direct Proposal rejection as equivalent to an Approval-step
  rejection.
- Do not show an Approval decision action merely because a user can open the
  module; only pending rows returned for that role/assignee are actionable.
- Preserve CEO cross-Mall behavior exactly as provided by Approval APIs; do not
  generalize it to Proposal mutation access.
- Bulk decision design requires explicit business acceptance because each row
  is a consequential independent commercial decision, even though endpoints
  can be called sequentially today.

## 16. API gaps

### Required for the complete target architecture

- Proposal/Approval list and detail Mall identity (`id`, code/name) from the
  Proposal Unit relationship.
- Approval requester identity if “Who requested?” is mandatory.
- A historically authoritative approval-trigger explanation. Current
  `policyReason` is best-effort current-policy correlation only.
- Current actionable step/position in the Proposal list if it is to be shown
  without opening detail.

### Optional/read-model improvements

- A server-recognized submitted timestamp; `createdAt` must not be relabelled.
- A bounded, server-searchable eligible Booking source or explicit cap metadata.
- A comparison read model that exposes only authoritative Proposal/scenario
  values after the correctness decision.

No additive API is authorized in Phase A.

## 17. Schema gaps

- No `submittedAt` on Proposal.
- ApprovalStep has no policy-rule id, evaluated condition snapshot or persisted
  trigger reason.
- Approval workflow/step has no SLA, due date, priority or urgency field.
- ProposalScenario terms are untyped JSON and carry no currency snapshot.
- Supplementary Proposal money fields do not each carry an explicit currency.

Schema changes are out of scope. The design must degrade honestly when these
fields are unavailable.

## 18. Business confirmations required

### BC-PA-001 — Rent-free unit — RESOLVED

Business presentation is **days**. Golden UI changes labels only and does not
modify formulas, API semantics or persisted data. The semantic/calculation
conflict is tracked separately.

### BC-PA-002 — Scenario authority — RESOLVED

Scenarios are simulation/comparison only. They do not alter authoritative
Proposal terms, are not ranked, and the undefined score is not displayed or
used for approval.

### BC-PA-003 — Commercial type — RESOLVED

No new Commercial Type classification is introduced. Only explicitly named
existing fields may be shown; the candidate column is omitted.

### BC-PA-004 — Supplementary-fee currency — RESOLVED FOR UI

Business intent is Proposal currency. Golden UI does not change schema or
formulas and does not present an ambiguous value as authoritative money. The
remaining persisted-data ambiguity is tracked separately.

### BC-PA-005 — Bulk commercial decisions — RESOLVED

Bulk Approve/Reject is prohibited. Every Approval requires individual review
and an explicit decision.

## 19. Recommended Golden architecture

```text
PROPOSAL — COMMERCIAL BUSINESS OBJECT
Command Header
  → Compact status/filter control
  → Dense Proposal Worklist (master)
  → Contextual Proposal Object Detail
      → Object identity + authoritative next action
      → Commercial terms and exact financial summary
      → Approval position/history
      → Scenario/versions/document context
      → factual Contract handoff

APPROVAL — DECISION COCKPIT
Command Header
  → Decision-type switch with Proposal approvals primary
  → Compact queue filters
  → Dense Decision Queue (master)
  → Persistent Decision Context
      → identity/party/location/current tier
      → exact commercial evidence
      → prior steps/comments
      → consequential Approve/Reject action bar
```

The two workspaces should reuse status, money, identity, timeline and decision
patterns, but should not be merged into one route or copied from another Golden
module.

## 20. Future implementation scope

- Frontend information architecture for Proposal list/detail/create context.
- Frontend information architecture for Approval queue/detail/history.
- Exact-money and role-aware presentation corrections.
- Honest Proposal→Contract handoff states.
- Responsive/accessible behavior and focused frontend tests.
- Only additive read-model/API work specifically reviewed and authorized after
  the business confirmations; no business-rule mutation.

## 21. Out of scope

- Proposal financial formula corrections.
- Rent-free semantic correction without business decision.
- Approval policy/lifecycle/concurrency changes.
- Scenario formula or score redefinition.
- Proposal→Contract conversion or Contract creation changes.
- FX, currency migration, schema/database/migration changes.
- Mall authorization/Tenant isolation changes.
- Redesign of CRM, Booking, Contract, Dashboard, Billing or other modules.
- Rollout of conceptual shared components to other modules.

## 22. Readiness decision

The target architecture is validated and bounded. All five business decisions
are recorded, and correctness work is explicitly separated from Golden UI.

**IMPLEMENTATION READINESS: READY**

Implementation completed on 2026-08-24 without API, backend, schema, database,
workflow or financial-formula changes. Focused frontend tests, TypeScript and
the production build passed. Rendered viewport review remains part of the
human visual gate because no controllable local browser was available in the
implementation session.
