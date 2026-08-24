# UAT Plan — Post Option B

Review date: 2026-08-18  
Purpose: validate business outcomes and permission boundaries with real Mall staff. Automated tests are supporting evidence, not a substitute.

## Entry criteria

- P0 credentials have been rotated and the UAT environment redeployed.
- Seeded, non-production data covers two Malls, at least two staff roles and two tenant accounts.
- Integration/e2e runs inside the Compose network or with a host-safe database URL.
- Current migration, backup and rollback evidence is attached.
- Tester accounts never share credentials; every result includes user, Mall, timestamp, request ID on failure and cleanup notes.

## Core business scenarios

| ID | Persona | Preconditions | Steps | Expected outcome | Permission | Data required | Pass/fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-01 | Leasing Executive | Active Mall selected; qualified Lead; available Unit | Login -> Dashboard -> CRM/Bookings -> create Booking -> open Proposals -> `Tạo đề xuất` -> select Booking -> complete draft | One Proposal is created from the selected Booking; tenant/unit/terms are correct; status and next action are clear; no duplicate Proposal on double click/retry | Can create Booking/Proposal only in assigned Mall | Lead, Unit, pricing rule | Pending | Observe UI/API/DB IDs and Unit/Booking status. |
| UAT-02 | Leasing Executive | Draft Proposal from UAT-01; applicable approval policy | Edit terms -> save -> submit for approval | Submit has one clear result; Proposal becomes Submitted/Under Review; required approver and policy reason are visible; submitter cannot approve own step unless policy permits | Leasing edit/submit, no unauthorized approval | Discount/rent-free values triggering at least two rules | Pending | Retry after simulated slow response; ensure no duplicate workflow/steps. |
| UAT-03 | Leasing Manager / Mall Director | Pending step assigned to tester | Login -> open Notification Center `Việc cần làm` -> open Approvals -> inspect rent-free/policy context -> Approve | Correct step is actionable; decision context is sufficient; only one decision is stored; next step or approved state appears everywhere | Assigned approver; wrong role/Mall must receive 403 | Proposal from UAT-02 | Pending | Run a concurrent approve/reject attempt with two sessions. |
| UAT-04 | Approver | Separate pending Proposal | Open pending step -> Reject with reason | Rejection reason is required/visible; Proposal and workflow agree; submitter receives actionable notification; Unit/Booking state follows documented rule | Assigned approver only | Second proposal | Pending | Verify DB workflow/step/proposal state. |
| UAT-05 | Leasing Manager / Legal | Approved Proposal with tenant data | Convert to Contract -> review draft -> activate after prerequisites | Exactly one Contract; Proposal becomes Converted; Unit becomes Contracted; other Bookings are handled; activation creates durable handoff work | Contract create/status role in same Mall | Approved proposal, legal dates, tenant contact | Pending | This is a data-safety gate: compare UI, API and DB after each step and after forced retry. |
| UAT-06 | Operation + Finance | Active Contract from UAT-05 | Open Contract detail -> inspect Fitout/Billing handoff -> follow Fitout and Billing links | Fitout project and billing schedule status are visible; links open the exact project/appropriate billing workspace; missing handoff is explicit, not silent | Operation sees Fitout; Finance sees Billing; neither gains unrelated mutation rights | Active Contract | Pending | Record provisioning latency and outbox/email state. |
| UAT-07 | Operation assignee | Assigned overdue Work Order/Ticket and notification | Notification Center -> `Việc cần làm` -> My Work/operational workspace -> execute task -> add evidence -> complete | Task is findable; assignment, SLA and status are consistent; completion produces audit/history and notification; refresh does not reopen completed task | Assignee can act; other Mall/user cannot | Overdue task and safe evidence file | Pending | Verify protected evidence is not downloadable anonymously. |
| UAT-08 | Finance | Issued invoice/schedule due | Open Billing -> filter action-needed invoice -> record idempotent payment with same retry key twice -> inspect Contract/Billing | One payment and correct balance; no duplicate invoice/payment; UI error/success states are unambiguous | Finance in assigned Mall | Invoice, payment reference | Pending | Required before any finance pilot. |
| UAT-09 | Tenant | Tenant linked to one active Contract in Mall A | Login Tenant Portal -> view own Contract/Invoice/Fitout/Ticket -> attempt IDs/URLs belonging to another tenant/Mall | Only own resources are returned; direct API and file URLs for other tenant are denied; internal Fitout route is unavailable | Tenant self-scope only | Two tenants across Malls | Pending | Mandatory negative IDOR test, including `/uploads`. Current public file behavior is expected to fail until fixed. |
| UAT-10 | Admin / CEO | Cross-Mall access | Switch Mall context and All-Mall where permitted -> inspect Dashboard/Reports/Audit | Scope label and data change together; restricted users cannot select unassigned Mall; no stale previous-Mall rows remain | Role-specific cross-Mall rules | Two Malls with distinguishable data | Pending | Covers the stale active-Mall test debt. |
| UAT-11 | Support/Operator | Known failed outbox/email/job fixture | Use logs/metrics/runbook to locate request/workflow and recover safely | Owner identifies component and affected entity without DB guesswork; replay is idempotent; resolution is recorded | Operational admin only | Controlled failed delivery/job | Pending | Cannot pass until job ledger/alerts exist. |
| UAT-12 | Release Operator | Candidate build and current backup | Preflight -> migration job -> pilot deploy -> smoke -> rollback application -> verify data | Migration runs once; health remains correct; known-good image rollback works; no destructive down migration; backup/restore evidence meets target | Deployment role | Release image, manifest, isolated restore DB | Pending | Mandatory release rehearsal. |

## New-user usability study

Recruit 5–8 representative users who have not received deep product training. Give outcome-only prompts; do not mention menus.

| Scenario | Prompt | Success definition |
| --- | --- | --- |
| NU-01 | “You need to create a new Proposal and send it for approval.” | Finds a valid entry point, understands the Booking prerequisite, creates and submits without facilitator navigation. |
| NU-02 | “You have something waiting for your approval.” | Finds the actionable queue, distinguishes it from informational notifications, understands policy/status context and makes the correct decision. |
| NU-03 | “Find the items overdue today.” | Uses Dashboard/My Work/operational filters to locate the correct overdue set and explain ownership/next action. |
| NU-04 | “A Contract was activated. Check whether Fitout and Billing have started.” | Finds Contract handoff status and opens the correct downstream records without manually searching IDs. |

Capture for every scenario:

- task success (unassisted / assisted / failed);
- time to first meaningful action;
- total completion time;
- navigation errors/backtracks;
- help requests and facilitator interventions;
- CTA/status comprehension in the user's own words;
- confidence rating (1–5) and accessibility barrier.

Initial acceptance targets: at least 80% unassisted task success, median first action under 30 seconds, no critical permission error, no more than two navigation errors per journey, and at least 80% able to state what happens after Submit/Approve. These are pilot targets and should be baselined, not retrofitted to claim success.

## Exit criteria

- UAT-01 through UAT-10 pass for every applicable role/Mall; UAT-11/12 pass before production.
- Zero cross-tenant/Mall disclosure or unauthorized mutation.
- Zero duplicate financial/workflow side effect under retry/concurrency cases.
- Every failure has owner, severity, evidence and retest result.
- New-user study meets targets or produces a funded remediation plan before broad rollout.
