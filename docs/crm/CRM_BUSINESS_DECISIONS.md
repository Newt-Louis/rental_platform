# CRM lifecycle integrity — Business decisions

All entries below are **PROPOSED DEFAULT** for local implementation/testing only. They are not represented as business-approved. CR-121 remains pending required architecture/functional review.

## D-CRM-001 — Ownership and aggregation

Status: PROPOSED DEFAULT

- Customer is the aggregate customer profile.
- Lead is one sales opportunity/process.
- Each event retains its original Lead and optional Customer/source links.
- Linking a Lead to a Customer does not move, copy, or duplicate an event.
- Customer 360 aggregates only events from linked Leads the caller is authorized to see, plus authorized Customer-level events.
- A Customer activity refreshes stale state only for an explicitly supplied Lead; it never refreshes every Lead belonging to the Customer.

## D-CRM-002 — Meaningful contact

Status: PROPOSED DEFAULT

- Qualifying contact types: completed CALL, EMAIL, and MEETING with `occurredAt` and an explicit outcome.
- NOTE, internal comment, status transition, Booking, Proposal, Approval, and Contract creation do not qualify automatically.
- Failed/unanswered contact is recorded but is not treated as successful contact. Both attempt and outcome remain queryable for future policy configuration.
- Completing a follow-up qualifies only when it includes a qualifying contact type, occurred time, and result.
- SITE_VISIT and PROPOSAL_SENT remain recorded activities but do not qualify until Functional review decides their policy.

## D-CRM-003 — Lead transitions

Status: PROPOSED DEFAULT, PARTIALLY BLOCKED FOR FINAL ADJACENCY

- All status writers call one lifecycle validator/event writer.
- Every entry to WON requires at least one linked Proposal in APPROVED or CONVERTED state.
- LOST, any backward transition, and reopen from WON/LOST require a non-empty reason.
- Automation actor is SYSTEM and records the job/action source.
- No transition is inferred from enum ordinal. Exact forward adjacency other than existing cross-module behavior requires Leasing Functional approval.

## D-CRM-004 — Business-event persistence

Status: PROPOSED DEFAULT

- CRM business events are append-only. Normal APIs cannot update/delete them.
- Correction is a new event referencing the corrected event.
- Mutation and event commit in the same transaction. If event persistence fails, the audited mutation fails.
- `occurredAt` is the business time; `recordedAt` is immutable ingestion time.
- Retry deduplicates by source action key; interceptor, service, and consumer must not each create the same business event.
- Legacy/imported events carry provenance and confidence and never fabricate actor/before/after.

## D-CRM-005 — Bulk semantics

Status: PROPOSED DEFAULT

- Status-changing bulk operations are all-or-nothing for a bounded request, proposed maximum 100 Leads.
- Every row is re-read and validated inside the transaction; one failure rejects the batch and returns the failing Lead without claiming partial success.
- Assignment/priority bulk actions may use the same atomic behavior for consistency, but are not allowed to bypass per-record authorization.
- Automated large batches must page and commit per bounded batch with a run ledger; the response/report states committed, skipped, and failed counts.

## D-CRM-006 — Follow-up lifecycle

Status: PROPOSED DEFAULT

- Statuses: OPEN, COMPLETED, CANCELLED.
- Creator, assignee, and completer/canceller are distinct identities.
- Completion requires a result. If completion is also contact, it requires contact type/outcome/occurred time.
- Cancellation requires reason. Normal business deletion becomes cancellation; no event/history row is physically deleted.
- Due-date and assignee changes create before/after events.

## D-CRM-007 — KPI semantics

Status: PROPOSED DEFAULT

- Snapshot distribution is not labelled historical conversion.
- Historical conversion uses a Lead-created cohort in `[from,to)` and an explicit cutoff.
- A→B requires distinct evidence that A occurred before B. Skipping A does not count as A→B.
- A Lead is counted once per KPI, not once per event.
- Time to first win is first WON event minus Lead creation time.
- Reopen/multiple-WON does not move first-win time; current status is a separate dimension.
- Results expose event-coverage start, eligible/unknown counts, and `INSUFFICIENT_DATA` where appropriate.

## D-CRM-008 — Time and timezone

Status: PROPOSED DEFAULT

- Persist instants in UTC.
- Default business timezone is `Asia/Ho_Chi_Minh` (IANA alias consistent with the configured Asia/Saigon environment).
- All periods use half-open `[from,to)` boundaries after resolving local calendar boundaries to instants.
- Backdated activity preserves both `occurredAt` and `recordedAt`; period activity uses occurred time while audit/late-entry reporting uses recorded time.

## D-CRM-009 — Configuration

Status: PROPOSED DEFAULT

- Auto-assignment rules and stale thresholds become Mall-scoped, inactive until configured.
- Deterministic fallback for missing assignment rule: leave unassigned and return `NO_MATCHING_RULE`; do not pick a global role/user.
- Auto-LOST defaults disabled; dry-run is always available and returns candidate/reason counts.
- Configuration changes are audited with actor and before/after.
- Lead status definitions remain code-owned; only presentation ordering/labels and safe thresholds are candidates for configuration in CR-121.

## D-CRM-010 — Historical data

Status: PROPOSED DEFAULT

- No `createdAt`/`updatedAt` value is repurposed as WON/LOST/transition time.
- Existing activity rows appear as LEGACY events with known original actor/time where those fields exist.
- Snapshot-derived lifecycle entries are not labelled events.
- AuditLog import is optional and only imports records with an unambiguous entity, actor, action, value, and timestamp. Every imported row retains source ID and confidence.

## Open confirmations

### BC-016 — Customer Mall ownership

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

Customer has no `mallId`; safe Customer-only business-event scope and Customer 360 aggregation cannot be finalized without deciding whether Customer is global, belongs to one Mall, or is visible through linked Leads.

### BC-CRM-001 — Exact Lead transition adjacency

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

Question: Beyond WON validation and reason-required LOST/backward/reopen, which forward/backward Lead transitions are permitted for human users and automations?

Impact: Central validator and tests can be designed, but final adjacency activation must remain behind the CR-121 feature flag until Leasing Functional approval.

### BC-CRM-002 — Internal comment visibility

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

Question: Which staff roles may view internal CRM comments across assignees and Malls, and may any comment ever be exposed to Tenant Portal users?

Impact: New timeline will preserve current non-Tenant visibility and will not broaden access pending Security/Functional approval.

### BC-CRM-003 — Existing auto-LOST policy

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

Question: Should CRM retain automatic status mutation to LOST, or should stale handling create a manager task/review queue only?

Impact: Auto-LOST must remain disabled/dry-run under the proposed configuration until confirmed.

