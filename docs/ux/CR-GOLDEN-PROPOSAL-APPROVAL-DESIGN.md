# CR-GOLDEN-PROPOSAL & APPROVAL — Commercial Decision Workspace Design

**Target archetype:** Commercial Decision / Approval workspace

**Phase:** IMPLEMENTED — AWAITING HUMAN VISUAL REVIEW

**Depends on:** `docs/ux/CR-GOLDEN-PROPOSAL-APPROVAL-READINESS.md`

## 1. Design objective

Golden Proposal & Approval should feel like one commercial-decision system
with two role-specific working surfaces:

- **Proposal** is the commercial business object owned and prepared by Leasing.
- **Approval** is the decision cockpit used by the current authorized approver.

Within seconds, a Proposal user should understand:

1. Which Proposal and party are being handled?
2. Which Mall/Unit does it concern?
3. What are the exact commercial terms and currency?
4. What is the authoritative Proposal/Approval state?
5. What action is allowed next?
6. Was a Contract created, or what blocks the handoff?

Within seconds, an approver should understand:

1. What requires this decision?
2. Which Proposal, party, Mall and Unit are affected?
3. What exact amount/currency and concessions are requested?
4. Which approval tier is current and what happened before it?
5. What evidence is authoritative and what is unavailable?
6. Is the user approving, rejecting, or only viewing history?

## 2. Design principles

- Preserve actual Proposal, Workflow and Step states exactly.
- Treat Proposal and Approval as master-detail workspaces, not card galleries.
- Put identity, state, money and next action before documents and secondary
  history.
- Use exact stored values; never calculate commercial values in React.
- Keep Amount numeric-only and Currency separate in cross-record tables.
- Use a single currency context for single-Proposal detail.
- Do not show scenario score, risk, urgency or policy reason as authoritative
  unless an authoritative source exists.
- Make consequential decisions occur from a reviewed decision context.
- Reject remains destructive and reason-required; approve is deliberate and
  supports an optional comment.
- Use restrained semantic color for status/decision only.
- Reuse current ERP tokens, Sheet, table, inputs, badges, buttons and async
  states before extracting any new shared primitive.

## 3. Shared system model

```text
Proposal Worklist ──select──> Proposal Object Detail
                                  │
                                  ├─ DRAFT: edit / submit
                                  ├─ SUBMITTED: view approval position
                                  ├─ REJECTED: view reason
                                  ├─ APPROVED: resolve handoff only if needed
                                  └─ CONVERTED: open Contract

Approval Inbox ────select──> Proposal Decision Context
                                  │
                                  ├─ commercial evidence
                                  ├─ current tier + earlier decisions
                                  ├─ approve (+ optional comment)
                                  └─ reject (+ required reason)
```

Proposal status and Approval workflow status are related but distinct. They
must not be collapsed into a single invented lifecycle badge.

## 4. Proposal workspace architecture

```text
COMMAND HEADER
  Proposal title and concise purpose
  Primary create action for authorized Leasing roles

COMPACT CONTROL BAR
  Status segments/counts + lease/commercial filters
  Search + Mall-context/floor/unit/date filters

PROPOSAL WORKLIST — PRIMARY SURFACE
  Paginated, exact financial columns, contained horizontal scroll

PROPOSAL OBJECT DETAIL — CONTEXTUAL SHEET
  Sticky Object Header
  Key commercial facts
  Commercial terms / Approval / Scenarios / Versions / Document
  Sticky state-aware Action Bar
```

The status counts become compact selectable segments integrated with the
control area. They are not six independent cards. Search and filters use one
shared toolbar surface rather than another large bordered card.

## 5. Proposal worklist design

### Base column set using existing data

| Column | Presentation |
|---|---|
| Proposal | monospace Proposal No.; created date secondary |
| Party | Brand/company; secondary `Lead` or `Tenant` label |
| Unit | Unit code; floor and lease-term type secondary |
| Monthly Rent | right-aligned, tabular, exact numeric amount |
| Total Value | right-aligned, tabular, exact numeric amount |
| Currency | ISO code in separate column |
| Proposal Status | restrained authoritative status badge |
| Approval | actual workflow state; no fake current step if unavailable |
| Action | one contextual primary action or overflow for secondary actions |

Mall is added only when an authorized additive read model supplies it. Until
then, selected global Mall context may be shown in the command header but must
not be copied into each record as if returned by that record.

“Commercial type” remains omitted until BC-PA-003. Existing lease-term type can
continue under its explicit “Lease term type” meaning; it must not be renamed
to a broader commercial concept.

### Row action hierarchy

- Row selection/open detail is the default action.
- DRAFT may expose a single “Continue” or “Submit” action, depending on
  readiness; edit/delete remain in overflow.
- SUBMITTED/UNDER_REVIEW opens Approval context; no normal edit action.
- APPROVED exposes “Resolve Tenant / Create Contract” only when no Contract is
  linked and the existing manual conversion is truly required.
- CONVERTED exposes “Open Contract”.
- REJECTED opens rejection context; delete is secondary and confirmed.
- Bulk submit/delete are removed from prime placement. Bulk decision behavior
  is not designed until BC-PA-005.

### Density and states

- 40–44px target data-row height where secondary two-line context permits.
- Sticky header inside the table scroll container.
- Loading skeletons preserve column geometry.
- Empty state distinguishes no records from filters returning no matches.
- Pagination remains server-authoritative.
- Exact zeros render as `0`, never as an em dash.

## 6. Proposal Object Header

```text
PROP-2026-00042       [Proposal status] [Approval state]
Brand / Tenant
Mall · Unit · Floor

Monthly rent          Currency          Current approval position
229.500.000           VND               Step 2 of 3 — Finance

Readiness / next action explanation                 [Primary action]
```

Rules:

- Proposal No. is the primary identity.
- Party type is explicit; do not show an unlabeled fallback.
- Mall is rendered only when returned authoritatively.
- Proposal status and Approval state remain separate badges.
- Money is exact and currency visible beside it.
- Current approval position appears only when the returned workflow/steps make
  it derivable without guessing.
- Next-action text explains state: “Draft can be submitted”, “Waiting for Legal
  approval”, “Approved; Contract was created”, or “Approved; Tenant is required
  before Contract creation”.

## 7. Proposal detail information hierarchy

### Default tab — Commercial terms

Use dense label/value groups separated by light dividers, not nested cards:

1. **Party and premises** — Lead/Tenant, Unit, floor/zone, area, authoritative
   Mall when available.
2. **Core rent** — base rent rate, monthly rent, CAM rate/monthly CAM, exact
   Proposal currency.
3. **Concessions and deposits** — discount, deposit months/value, rent-free
   only after unit confirmation.
4. **Term** — start, end, duration, handover/opening/fitout when present.
5. **Other commercial terms** — escalation, revenue share, marketing,
   service/support fee, conditions and notes, with an explicit indication that
   stored values are not necessarily included in total value.

The total Contract value is visually primary but labelled as the stored
Proposal value, not a frontend recomputation.

Supplementary money fields with unresolved currency are hidden from Golden
financial summary or labelled only after BC-PA-004. No implicit VND.

### Approval tab

- Workflow status and actual ordered steps.
- Current actionable/waiting step distinguished from completed steps.
- Role, approver, decision timestamp and comment only where present.
- A link opens the Approval workspace at the workflow.
- Do not use nonexistent `level`; use `stepOrder`, `stepName` and
  `approverRole`.
- Do not repeat the same pipeline and timeline at equal prominence.

### Scenarios tab

The tab stays secondary until BC-PA-002 and the calculation correctness CR are
resolved. The intended comparison structure is:

```text
Term / Metric       Current Proposal    Scenario A    Scenario B    Variance
Area
Term
Rent per m²
CAM per m²
Discount
Rent-free
Monthly rent
Deposit
Total value
Currency            one inherited Proposal currency context
```

Rules:

- Comparison has a contained horizontal scroll.
- All money uses the owning Proposal currency; no cross-currency sum.
- Variance is shown only if an authoritative backend value/approved formula is
  available. React does not introduce variance math in the first pass.
- “Selected” is labelled “Preferred scenario” only if business confirms that
  meaning. It never implies that Proposal terms were updated.
- Current scenario `score` is omitted from Golden prime placement unless
  formally approved.

### Versions and document

- Versions remain a secondary audit/comparison tab and are not called a full
  audit trail.
- Document preview/edit remains available from Proposal detail.
- Editing and saving are shown only for DRAFT and authorized Proposal edit
  roles.
- PDF view/download is available according to existing endpoints.
- The A4 editor stays a dedicated full-screen mode; it is not embedded into the
  commercial object sheet.

## 8. Proposal status/action presentation

| State | Label/tone | Primary presentation | Blocked/secondary |
|---|---|---|---|
| DRAFT | neutral | Continue editing / Submit | delete in overflow |
| SUBMITTED | amber | Waiting for approval; open workflow | no edit, no manual convert |
| UNDER_REVIEW | blue, defensive legacy display | View workflow | no invented transition/action |
| APPROVED | emerald | handoff fact or Tenant-resolution action | no duplicate conversion |
| REJECTED | red | rejection reason/history | delete secondary; no fake resubmit |
| CONVERTED | blue/neutral completion | Open Contract | no Proposal mutations |

Do not show a decorative DRAFT→SUBMITTED→UNDER_REVIEW→APPROVED→CONVERTED strip;
that sequence is not executable as drawn because UNDER_REVIEW has no writer and
APPROVED may be transient before automatic conversion.

## 9. Submission UX

Submission is consequential because it creates an approval workflow and locks
normal Proposal editing.

- Submit is only shown for authorized users on DRAFT.
- A compact confirmation summarizes Proposal No., party, Unit, exact total and
  currency.
- Confirmation states that the Proposal will enter Approval and normal edits
  will be blocked.
- It does not predict which rules will match unless the backend already returns
  that evaluated result.
- The UI calls the existing submit endpoint exactly once, disables the action
  while pending and handles the server's double-submit result.
- No frontend workflow creation or auto-approval.

## 10. Proposal→Contract handoff design

The handoff block is factual, not an action card:

| Condition | Presentation |
|---|---|
| workflow still in progress | “Contract creation waits for final approval.” |
| final approval + Tenant + linked Contract | “Contract created automatically” + Contract No./status/open action |
| APPROVED + no Tenant/Contract | “Tenant information is required before Contract creation” + existing authorized manual action |
| CONVERTED + Contract | Contract identity/status is primary; Proposal conversion action absent |
| conversion failed/no link unexpectedly | neutral error/retry guidance from actual API result; no fabricated status |

The UI does not claim the Contract is active or signed. The created Contract is
normally DRAFT and its own Golden workspace owns the later lifecycle.

## 11. Approval workspace architecture

```text
COMMAND HEADER
  Approval title + count of current actionable decisions

DECISION TYPE + FILTER BAR
  Proposal approvals primary
  Booking price approvals as a distinct queue for authorized roles
  History secondary

DECISION QUEUE — MASTER
  Dense Proposal approval rows

DECISION CONTEXT — PERSISTENT SHEET/PANEL
  Sticky Decision Header
  Commercial evidence
  Approval position + prior decisions
  Comments and limitations
  Sticky Decision Action Bar
```

The current three status cards become a compact queue switch. Proposal approval
is the default Golden surface. Booking price approval remains functionally
unchanged and visually separate; it is not redesigned as if it were a Proposal
workflow.

## 12. Approval Decision Queue

### Base columns using current data

| Column | Presentation |
|---|---|
| Proposal | Proposal No.; age/created timestamp secondary |
| Party | Tenant or Lead with explicit type |
| Unit | code + floor; Mall only after additive read model |
| Current tier | step name/order; approver role secondary |
| Monthly Rent | exact numeric value |
| Concession | discount; rent-free only after BC-PA-001 |
| Total Value | exact numeric value |
| Currency | separate ISO column |
| Action | Review is primary; no row-level silent Approve |

Requester, urgency and “what changed” are omitted until authoritative data
exists. Age can be labelled “In queue for …” but never “overdue” without SLA.

The current best-effort `policyReason` may appear only as “Current policy match
(reference)” with a tooltip explaining it is not a persisted submission
snapshot. Prefer omission in the Golden queue until a historical source exists.

## 13. Decision Header

```text
DECISION REQUIRED — STEP 2 OF 3
PROP-2026-00042                  [Workflow IN_PROGRESS]
Brand / Tenant · Unit · Floor
229.500.000 VND                 Finance approval

Current user's eligible step and prior-step state
```

- “Decision required” appears only for a row returned as actionable to the
  current role/assignee.
- History/completed workflow detail says “Decision record”, not “Decision
  required”.
- Proposal status and workflow status are both visible when useful.
- Mall/requester are shown only after authoritative read-model support.

## 14. Decision context hierarchy

1. **Identity and location** — Proposal, party type/name, Unit/floor, Mall when
   available.
2. **Requested commercial value** — monthly rent, total value, exact currency,
   term and effective dates.
3. **Concessions/charges** — base rate, CAM, discount, confirmed rent-free unit,
   deposit and other authoritative terms.
4. **Conditions and notes** — Proposal special conditions/notes.
5. **Approval context** — current tier plus preceding decisions/comments.
6. **Reference document** — open/download Proposal PDF.
7. **Decision action bar** — approve/reject only after the evidence.

No profitability, risk, deal score, price variance or policy warning is added
unless the existing response contains an authoritative captured value. Current
`pricingSnapshot` may be displayed only after its stable structure and business
meaning are explicitly validated for the UI.

## 15. Approval timeline/history

Use one compact vertical timeline:

```text
Step 1 · Leasing Manager     Approved
Nguyen Van A · 24/08/2026 09:15
Comment if present

Step 2 · Finance             Current / Pending

Step 3 · Mall Director       Waiting for prior step
```

Rules:

- Role, approver, status, timestamp and comment only from actual Step fields.
- Waiting and current pending steps are visually distinct without fake dates.
- Workflow summary gives `approved steps / total`; a large percentage progress
  visualization is unnecessary.
- History list is labelled “Approval decision history”, not “full audit log”.
- Proposal versions and document changes remain separate evidence sources.

## 16. Approve / Reject interaction

### Approve

- Available in the sticky Decision Action Bar for the current actionable step.
- Visually primary only after decision context has loaded successfully.
- Opens a compact confirmation with Proposal identity, exact total/currency and
  optional comment.
- Requires an explicit final click; no row-level one-click approval.
- Disables both decision actions while request is pending.

### Reject

- Consequential destructive action, visually separated from Approve.
- Opens the existing reason dialog with minimum five-character validation.
- Shows Proposal identity and current approval tier.
- Reason is sent as the existing `comment`; no new reject semantics.

### Bulk decisions

Bulk Approve/Reject is omitted from the Golden Proposal decision surface until
BC-PA-005. Existing backend concurrency and authorization checks are not a
substitute for individual evidence review policy.

### Failure handling

- Server role/assignment/prior-step/state errors are displayed verbatim or via
  approved localized mappings.
- A stale decision refreshes the queue/detail rather than retrying blindly.
- No optimistic status change before server success.

## 17. Role-aware presentation

- Proposal readers (including CEO) can inspect objects allowed by backend but
  do not see Leasing mutations.
- Leasing edit roles see create/edit/submit only in DRAFT.
- Manual conversion is limited to ADMIN, LEASING_MANAGER and MALL_DIRECTOR and
  only appears for the actual Tenant-missing approved case.
- Approval module users see pending items returned for their role/assignment;
  frontend does not infer eligibility from role alone.
- ADMIN policy management remains separate and unchanged.
- Booking price approval switch appears only for current authorized roles.
- Mall and Tenant scope remain query/API responsibilities, not UI filtering
  guarantees.

## 18. Responsive behavior

### 1920×1080

- Master table remains dominant with 12–15 useful rows visible.
- Detail may use a 680–760px contextual width if the remaining master surface
  stays usable.
- No oversized workflow graphics.

### 1440×900

- Compact header/control bar avoids wrapping into multiple decorative rows.
- Table uses contained horizontal scroll for optional columns.
- Decision detail keeps action bar visible without covering evidence.

### 1366×768

- Status counts and filters collapse to one/two dense rows.
- Low-priority columns move behind contained scroll; actions stay reachable.
- Detail timeline and terms use one column when two would clip.

### 1024×768

- Worklist and detail do not attempt a simultaneous rigid split.
- Detail Sheet uses viewport-relative width and one-column facts.
- Comparison table owns horizontal scrolling.
- Conversion form uses one/two columns, never three cramped financial inputs.
- A4 document editor may require deliberate full-screen horizontal canvas
  scrolling; the page itself must not overflow.

Implementation must render and inspect all four viewports. This design phase
does not claim responsive PASS.

## 19. Accessibility

- All rows are keyboard-selectable and do not depend on drag selection.
- Status meaning is present in text, not color alone.
- Exact values use tabular numerals and remain readable at browser zoom.
- Sheet/Dialog focus is trapped and restored through existing primitives.
- Decision actions have explicit labels; destructive action is not icon-only.
- Loading and error states are announced; decision context must be fully loaded
  before actions enable.
- Horizontal scroll areas remain keyboard/touch accessible and visibly
  discoverable.

## 20. Existing shared components and conceptual patterns

### Reuse first

- Existing Sheet/Dialog/Button/Input/Select/Badge/Tabs/AsyncState primitives.
- Existing ERP table, toolbar, status and amount conventions.
- `formatMoneyAmount` for table Amount cells and canonical exact detail
  formatter for amount+currency.
- Existing permission hooks and API clients.

### Conceptual local patterns

- `DecisionHeader`
- `CommercialSummary`
- `ComparisonTable`
- `ApprovalTimeline`
- `DecisionActionBar`
- `ApprovalWorklist`

These names describe responsibilities, not authorization to create a parallel
component system. Implement locally first; extract only after Proposal and
Approval demonstrate a stable repeated contract. Do not roll them out to CRM,
amendments or other modules in this program.

## 21. Data contract/degradation rules

| Desired evidence | If unavailable |
|---|---|
| Mall | omit row/detail field; retain global Mall context |
| Requester | omit; do not substitute current user or approver |
| Submitted date | label workflow creation only if shown; never rename createdAt |
| Urgency/SLA | show neutral queue age only |
| Policy trigger | omit or explicitly mark current-policy reference |
| What changed | link versions; do not fabricate baseline/variance |
| Scenario currency | inherit owning Proposal currency only after business confirmation |
| Contract handoff | derive from actual Proposal status + linked Contract/Tenant |

## 22. Implementation sequence after unblock

1. Record BC-PA-001 and BC-PA-002 decisions and assign separate correctness
   CRs where formulas/data must change.
2. Confirm the exact frontend-only scope and any additive read-model contract.
3. Add focused tests for state/action/role/money/degradation mapping before
   visual restructuring.
4. Build Proposal worklist and Object Header hierarchy.
5. Build Proposal commercial/approval/handoff detail.
6. Build Approval queue and reviewed Decision Context/Action Bar.
7. Address scenarios only within confirmed semantics.
8. Verify focused backend contracts remain unchanged; run frontend focused/full
   gates, TypeScript, production build and `git diff --check`.
9. Render 1920×1080, 1440×900, 1366×768 and 1024×768 for human review.

## 23. Acceptance criteria

- Proposal and Approval feel like one commercial-decision system.
- Proposal list remains the dominant Proposal working surface.
- Approval queue remains the dominant approver working surface.
- Object/Decision headers answer identity, party, location, state, exact money,
  current approval and next action using authoritative data.
- Cross-record Amount and Currency remain separate and exact.
- No mixed-currency totals, abbreviation, FX or implicit VND.
- No fake lifecycle, urgency, risk, score, requester, policy reason or audit
  completeness.
- Approve/reject occur only from a loaded decision context with clear
  confirmation/reason handling.
- Automatic Contract creation is represented factually; manual conversion is
  exceptional, not the normal lifecycle.
- Backend business logic, API semantics, authorization, schema, database,
  transactions and outbox remain unchanged unless a separately reviewed
  additive read-model CR is authorized.
- Dashboard, Booking, Billing, Contract and unrelated work remain untouched.

## 24. Design status

The Golden architecture is defined, bounded and reusable. BC-PA-001 through
BC-PA-005 are resolved and Golden UI implementation is authorized. Formula,
scenario-score, currency-persistence and atomicity findings remain separate
correctness work.

**IMPLEMENTED — AWAITING HUMAN VISUAL REVIEW**

The implementation uses the existing read models and shared ERP primitives;
no additive API was required. Automated focused tests, TypeScript and the
frontend production build passed. The four target viewports remain for human
rendered review because no controllable local browser was available in the
implementation session.
