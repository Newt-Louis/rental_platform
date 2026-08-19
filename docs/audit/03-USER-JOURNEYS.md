# 03 — User Journeys

> Phase 3. Journeys traced through actual frontend/backend code (not assumed).
> Each step is evaluated against: does the user know what to do, why, what's next,
> the current status, who's handling it, when it's done; is a screen change or
> re-entry of data required; is anything automatable.

## Journey A — Lead to Signed Contract (the platform's core revenue journey)

```text
TRIGGER: A prospective tenant expresses interest
  ↓
1. LEASING EXEC creates a Lead — CrmPage.tsx, UnifiedAddDialog (mode=lead)
  ↓
2. LEASING EXEC creates a Booking — BookingsPage.tsx, CreateBookingDialog
   (requires BOTH unitId AND leadId — cannot be created from Lead alone)
  ↓
3. LEASING EXEC converts Booking → Proposal — ConvertToProposalDialog
   (heavily prefilled from booking/unit data; navigates to /proposals?id=X)
  ↓
4. LEASING EXEC submits Proposal — ProposalsPage.tsx, submitMutation
   (button only visible when status === DRAFT)
  ↓
5. SYSTEM builds approval chain from ApprovalPolicyRule (discount %, rent-free
   days, AR debt, price deviation) — invisible computation, no preview shown
  ↓
6. APPROVER(S) act in sequence (Leasing Manager → [Mall Director] → [CEO],
   + Finance + Legal in parallel) — ApprovalsPage.tsx pipeline view
  ↓
7. On final approval, LEASING EXEC (or Manager) converts Proposal → Contract —
   ProposalsPage.tsx convert button (only when status === APPROVED); if no
   tenant linked yet, a 7-field tenant-creation form appears inline first
  ↓
8. SYSTEM creates Contract + Tenant (if needed) + updates Unit status in one
   mutation; invalidates contracts/units/occupancy/floor-map
  ↓
9. STAFF (Legal/Manager) move contract DRAFT → PENDING_LEGAL → PENDING_SIGNATURE
   → ACTIVE via ContractsPage.tsx status buttons
  ↓
10. STAFF signs via SignFileDialog (signerName + signerRole), verifiable later
    via VerifyDialog
  ↓
COMPLETION: Contract ACTIVE. (Fitout kickoff and Billing schedule are separate,
manually-initiated next steps — not automatically triggered by contract activation;
V2 flags this exact gap as "Contract Activation is not one atomic checklist.")
```

### Step-by-step evaluation

| Step | Knows what to do? | Knows why? | Knows next step? | Knows status? | Knows who's handling it? | Screen change? | Re-enters data? | Automatable? |
|---|---|---|---|---|---|---|---|---|
| 1 Create Lead | Yes | Yes | **No** — nothing on the Lead points to "next: create a Booking" | N/A | N/A | — | No | — |
| 2 Create Booking | **Partially** — user must already know a Booking is the required bridge to a Proposal; nothing surfaces this | No | **No** — no visible "convert to proposal" prompt until the user finds it inside the booking detail | Yes (booking status) | N/A | Yes | Re-enters unit/lead already selected — minor | Low |
| 3 Booking→Proposal | Yes, once found | Yes | Yes (proposal created) | Yes | N/A | Yes (navigates to proposal) | No — good prefill | — |
| 4 Submit Proposal | Yes | Yes | Yes | Yes (DRAFT→SUBMITTED) | **No** — doesn't show which approver is first | — | No | — |
| 5 Approval chain built | N/A (invisible) | **No** — user cannot see *why* their proposal needs 3 approvers instead of 1 (the discount-threshold logic is server-side only) | N/A | N/A | N/A | N/A | N/A | Already automated — **needs a UI explanation, not new logic** |
| 6 Approvals | Yes (approver view) | Approver sees terms but not full context in one place | Yes — pipeline shows next step | Yes — "Đã duyệt/Đang xử lý/Chưa đến lượt/Từ chối" | Yes — pipeline shows current step owner | — | No | — |
| 7 Convert to Contract | Yes | Yes | Yes | Yes | N/A | — | Only if tenant missing (unavoidable) | — |
| 8 Contract+Tenant+Unit created | N/A (automatic) | N/A | **No confirmation/preview shown before this multi-entity fan-out happens** — user sees a single button press | N/A | N/A | N/A | N/A | Already automated well — **needs a pre-action preview** |
| 9 Contract status progression | Yes | **No** — no explanation of what's required to legally move to PENDING_SIGNATURE (e.g., legal review sign-off) | Yes (status buttons imply next state) | Yes | **No** — doesn't show who owns each transition | — | No | Legal-review gate could be tied to the Legal approval step already recorded |
| 10 Signing | Yes | Yes | Yes | Yes | N/A | — | No | — |

**Overall friction density for Journey A:** the *individual* steps are each
reasonably clear; the *seams between modules* (Lead→Booking, the invisible
approval-policy computation, the unconfirmed multi-entity conversion, contract
activation not cascading to Fitout/Billing) are where a first-time user gets lost.
This matches the platform-wide finding in
[04-UX-FRICTION-REPORT](04-UX-FRICTION-REPORT.md): friction concentrates at module
boundaries, not within modules.

---

## Journey B — Tenant Reports an Issue

```text
TRIGGER: Something is broken in a tenant's unit
  ↓
1. TENANT opens Tenant Portal → CreateTicketDialog (5 fields: unit, type,
   priority, subject, description) — unit list restricted to tenant's own units
  ↓
2. SYSTEM computes SLA due date from TicketSlaPolicy (type + priority) —
   invisible to tenant at creation time
  ↓
3. TENANT sees ticket in portal ticket list, status-badged (NEW → ...)
  ↓
4. OPERATION STAFF sees it in TicketsPage.tsx queue, "Chưa phân công"
   (unassigned) filter tile shows count
  ↓
5. STAFF assigns to self/colleague — ticketsApi.assignTicket
  ↓
6. STAFF transitions status (ASSIGNED → IN_PROGRESS → ... → RESOLVED) —
   same status enum tenant sees, shared vocabulary
  ↓
7. Cron checks every 2h for SLA breach → escalates + notifies assignee AND
   escalation-target role (Leasing Manager → Mall Director at level 2+)
  ↓
8. STAFF resolves → RESOLVED; TENANT can close or reopen
  ↓
COMPLETION: CLOSED
```

### Evaluation

| Aspect | Assessment |
|---|---|
| Tenant knows what to do | Yes — single clear "create ticket" action in the portal |
| Tenant knows why | Yes | 
| Tenant knows next step | Yes — status badge is business language, not raw enum |
| Tenant knows who's handling it | **No** — no assignee name shown to the tenant, only status |
| Tenant knows when it'll be done | **No** — SLA due date is computed but not surfaced to the tenant at all (staff-only visibility) — a tenant has no way to know if 2 hours or 2 days is normal |
| Staff knows what needs attention | Yes — "Chưa phân công" and "Quá SLA" quick-filter tiles are a genuinely good pattern |
| Screen changes / re-entry | None — this is the best-executed journey in the platform (also has the best-designed empty state, see FR-08) |
| Automatable further | SLA due date and assignee could be shown to the tenant with near-zero engineering cost — pure UI surfacing of data that already exists server-side |

**This journey is the platform's UX reference implementation** — the shared status
vocabulary between tenant and staff, the queue filter tiles, and the contextual
empty state (see 04-UX-FRICTION-REPORT / 05-TASK-EFFICIENCY) should be the pattern
other modules are brought up to, not something to redesign from scratch.

---

## Journey C — Manager Approves a Discounted Deal (decision journey, not creation)

```text
TRIGGER: Notification bell shows unread count; OR dashboard "pendingApprovals" tile
  ↓
1. MANAGER opens NotificationCenter — sees an amber "pending approvals" banner
   (separate from the notification feed) → clicks through to /approvals
   OR opens Dashboard → clicks "Pending approvals" stat tile
  ↓
2. MANAGER sees ApprovalPipeline for each pending item: step name, status badges
  ↓
3. MANAGER must open the underlying Proposal to see deal terms — the approval
   step itself does not show discount %/rent-free days/rationale inline
  ↓
4. MANAGER approves or rejects (rejection likely requires a reason per
   ERP_UX_STANDARD.md, "rejection requires a reason")
  ↓
5. SYSTEM advances workflow, notifies next approver or the proposal creator
  ↓
COMPLETION: workflow APPROVED or REJECTED
```

### Evaluation

The weakest link is step 3: the approval *queue* list does not carry the decision
context (discount %, rent-free days, why this hit the manager's threshold) inline —
the manager must context-switch to the Proposal detail to decide, then switch back
to approve. This is a textbook **information friction** case (data needed for a
decision lives on a different screen than the decision action) — see FR-06 in the
friction report and the Approvals redesign implications in
[07-DASHBOARD-REDESIGN](07-DASHBOARD-REDESIGN.md).
