# CR-BOOKING-UX — Booking Creation / Unit Finder Implementation Plan

**Phase:** A — implementation planning only
**Date:** 2026-08-23
**Severity:** P1 / Tier 0
**Change authorization:** GRANTED — WAVE 1 ONLY
**Implementation readiness:** READY FOR WAVE 1
**Wave 1 status:** CLOSED — 2026-08-23
**Related audit:** `docs/architecture-review/CR-BOOKING-UX-AUDIT.md`

> Authorization update — 2026-08-23: Phase A was accepted and Wave 1 was
> explicitly authorized by the business decision record supplied for
> CR-BOOKING-UX. Authorization is limited to the shared Lead-based Booking
> workspace, Unit Finder API/UI, Mall consistency, queue-aware eligibility,
> pagination, debounce, async states, responsive layout, and tests. Wave 2,
> Customer-model work, Unit rent/currency, schema, lifecycle, Proposal, and
> Contract changes remain unauthorized.

## 1. Change Request

### Change identity

| Field | Value |
|---|---|
| Change ID | CR-BOOKING-UX |
| Title | Shared Booking Workspace and server-backed Unit Finder |
| Primary domain | Leasing / Booking |
| Cross-cutting overlays | UX, Mall authorization, tenant/customer context, reliability, financial display, multi-currency |
| Requested phase | Phase A audit and implementation plan only |
| Implementation owner | Unassigned |
| Required reviewers | Functional Consultant; Leasing Domain Owner; Solution/Chief Architect; Multi-Mall Reviewer; Multi-Currency Reviewer; Security/Authorization Reviewer; QA/E2E Reviewer |

### Business reason

Booking creation is currently split across two different dialogs. One supports only Leads and returns only the first 20 `VACANT` Units; the other supports Leads and Customers but preloads fixed 200-record lists. Neither is a reliable finder for a portfolio with 10,000+ Units or customers, and the Bookings-page dialog hides the backend-supported booking queue. The business needs one shared, scalable experience that makes the party, Unit, price, expiry, queue outcome, and Mall context visible before submission without changing the authoritative Booking lifecycle.

### Current behavior

- `apps/frontend/src/pages/bookings/CreateBookingDialog.tsx` uses direct, non-debounced search and supports only Leads.
- `apps/frontend/src/components/spaces/dialogs/CreateBookingDialog.tsx` supports Leads and Customers but preloads up to 200 records into Select controls.
- The Bookings-page finder requests only `status=VACANT&limit=20`; the backend also accepts a Unit currently in `BOOKING` and creates a queued `PENDING` Booking.
- Search results lack enough persistent Mall/floor/zone/party context for confident selection.
- The backend already performs the authoritative validation and uses a serializable transaction with retry handling, but no read endpoint exposes Booking-specific eligibility and reason codes.
- Unit rent fields have no stored currency source, so the UI cannot safely label or aggregate Unit rent.

### Expected behavior

One responsive Booking workspace is used by both entry points. A user first establishes Mall context, finds either a Lead or an eligible Customer, finds a Unit through server-side filters and pagination, reviews a persistent summary, completes Booking details, and submits to the existing `POST /bookings`. The finder exposes server-derived current eligibility, queue mode, and non-selectable reason codes; the create request revalidates everything and remains authoritative under concurrent changes.

## 2. Scope

### In scope after approval

- A shared responsive Booking workspace for Bookings and Spaces entry points.
- Server-side, paginated Booking-specific Unit discovery.
- Lead and Customer tabs with debounced server search and explicit loading, empty, error, retry, and pagination states.
- Persistent Mall, party, Unit, commercial details, hold expiry, and expected Booking outcome summaries.
- Accessibility and keyboard operation for search, table selection, tabs, validation, and error recovery.
- Compatibility wrappers for both existing create-dialog call sites during rollout.
- Automated controller/service/component tests and the Golden E2E scenarios listed below.

### Out of scope

- Any change to Booking, Proposal, Contract, or Unit lifecycle semantics.
- Any database or Prisma schema change.
- Any new financial formula, FX conversion, reporting calculation, export, event, job, or webhook.
- Direct Tenant selection: `CreateBookingDto` accepts a Lead or Customer, not a Tenant. Linked Tenant context may be displayed read-only.
- Displaying Unit rent with a currency until the currency source is confirmed.
- Resolving customer ownership globally as an incidental UX decision.
- Removing the old dialogs before both entry points have migrated and passed regression gates.

## 3. Impact Map

### Proposed change classification

| Proposed change | Classification | Authorization state |
|---|---|---|
| Shared split-screen workspace and persistent summaries | UI ONLY | Planned, not granted |
| Debounced party/unit queries, pagination, selection state, and API integration | FRONTEND LOGIC | Planned, not granted |
| `GET /bookings/unit-finder` with server-derived current eligibility | BACKEND API | Planned, not granted |
| Extract/reuse the existing bookability predicate without changing allowed states | BUSINESS LOGIC (refactor only) | Review required, not granted |
| Add or infer Unit currency | DATABASE + SCHEMA + BUSINESS LOGIC | Out of scope and blocked |
| Change Booking queue or Unit lifecycle rules | BUSINESS LOGIC | Out of scope |

| Area | Impact | Planned treatment |
|---|---|---|
| Booking frontend | Changed | Replace divergent workflows with one shared workspace through compatibility wrappers. |
| Spaces frontend | Changed | Route its Booking action to the shared workspace; preserve its Unit-prefill capability. |
| Booking backend | Changed | Add read-only Unit Finder endpoint and reuse the same eligibility rule as create. |
| Spaces backend | Checked, not changed | Existing Unit list/search informed the design; it is not sufficient as Booking truth. |
| CRM Leads | Checked; read integration changed | Reuse search endpoint with selected Mall filter and pagination. Same-Mall policy remains a BC. |
| CRM Customers | Checked; read integration blocked | Existing search supports required text fields, but Mall/tenant authorization is unresolved under BC-016. |
| Tenants | Checked, not changed | Show linked context only; no `tenantId` is added to Booking creation. |
| Unit lifecycle | Checked, not changed | Preserve `VACANT → BOOKING` and queuing on `BOOKING`; eligibility is server-derived. |
| Proposal / Contract | Checked, not changed | Downstream Booking identity/status must remain compatible; cover with GS-01. |
| Billing / Reports / Dashboard | Checked, not changed | No formula or stored money change. Reconciliation confirms no new Unit-currency assertion leaks into displays. |
| Mall access | Changed at read boundary | Finder must scope queries at data access to accessible Malls and reject unauthorized `mallId`. |
| Tenant access | Confirmation required | Customer visibility and cross-Mall party pairing cannot be inferred. |
| Currency | Confirmation required | Booking money remains currency-qualified; Unit rent is suppressed until its currency truth exists. |
| Async events / jobs | Checked, not changed | No new event/job. Existing create side effects remain in the current transaction. |
| Database / migration | No change | The proposed approved scope requires no schema migration. A Unit-currency schema decision requires a separate CR/ADR. |
| API clients | Additive change | Add a read endpoint; keep existing endpoints and `POST /bookings` contract backward compatible. |
| Localization | Changed | Add Booking-workspace copy in English and Vietnamese Booking namespaces. |

### Upstream inputs

- Authenticated user and Mall-access scope.
- Selected Mall from `mallStore`, or an explicit Mall choice when “All Malls” is active.
- Lead/Customer search criteria and selected party.
- Unit filters and selected Unit.
- Booking commercial fields and hold duration.

### Downstream consumers

- Booking list and detail.
- Unit status and queue ordering.
- Lead activity/status updates currently performed by create.
- Proposal creation and subsequent Contract journey.
- Operational displays that reconcile Booking and Unit status.

## 4. Business and Technical Invariants

### State and lifecycle

- The implementation must not create a second client-side Booking state machine.
- `POST /bookings` remains the final authority. A finder result is only a current snapshot and can become stale before submit.
- A `VACANT` Unit currently produces the active/highest-priority Booking and transitions the Unit to `BOOKING`.
- A `BOOKING` Unit is currently queue-eligible and produces a `PENDING` Booking, subject to business confirmation below.
- Locked states such as `NEGOTIATING`, `MERGED`, `CONTRACTED`, `UNDER_FITOUT`, and `OCCUPIED` remain non-bookable according to the existing backend service.
- Duplicate active/pending Booking detection for the same party and Unit remains authoritative and returns conflict.

### Concurrency and idempotency

- Unit Finder eligibility is advisory; create must re-read and validate Unit state in its existing serializable transaction.
- Existing retry handling for serialization conflict (`P2034`) must remain intact.
- Concurrent selection of the same `VACANT` Unit must produce one active position and deterministic queued/rejected outcomes according to current service rules.
- A retry after an ambiguous network failure must not silently create a duplicate active/pending Booking for the same party and Unit.
- No client-generated optimistic status may be persisted or shown as final before the create response returns.

### Financial and currency safety

- No money formula, rounding rule, or currency conversion changes.
- Booking amounts may be formatted only with the Booking record/form currency through `apps/frontend/src/lib/currency.ts`.
- Unit rent fields must not be labeled VND, USD, MMK, or any other currency until a historical currency source is confirmed.
- Values from different currencies must never be summed or compared as if they share a currency.
- If business approves a Unit-currency model change, stop this implementation and raise a separate Tier 0 CR/ADR with migration and historical-data treatment.

### Mall and tenant authorization

- The new read endpoint must apply Mall access at the database query boundary, not only through UI filtering.
- An explicit inaccessible `mallId` must be denied; omission may search only the user's accessible Mall set.
- The chosen Unit must remain access-checked by `POST /bookings`.
- Lead/Customer visibility and party-to-Unit Mall compatibility require the confirmations in Section 12.
- No direct Tenant selector or tenant-wide Booking authority is introduced.

### Transactions, events, and reconciliation

- The read endpoint performs no writes and requires no transaction.
- Booking create transaction boundaries, activities, Unit transition, and Lead updates remain unchanged.
- No new events, background jobs, webhooks, or outbox messages are added.
- After create, reconcile the returned Booking status/priority with the refreshed Unit status and Booking list; never infer success from the finder snapshot.

## 5. Recommended UX: Option C

Use a responsive split-screen ERP workspace. On desktop, the left side contains party and Unit discovery; the right side holds the selected context, Booking details, review, and submit action. On narrow screens, the same regions stack in logical keyboard and reading order.

### Information hierarchy

1. **Mall context:** selected Mall name; require explicit selection when global context is active.
2. **Who:** Lead/Customer tabs, search, result identity, linked Customer/Tenant context, and persistent selected-party summary.
3. **Where:** Unit filters, paginated results, eligibility/queue state, and persistent selected-Unit summary.
4. **What and how much:** area, term, expected/proposed rent, CAM, and currency-qualified Booking fields.
5. **Until when:** hold duration and calculated expiry preview using server-consistent date semantics.
6. **Expected status:** immediate or queued as a provisional result, then actual status/priority from `POST /bookings`.

### Interaction acceptance criteria

- In a selected-Mall keyboard-first path, the minimum flow remains open → select party → select Unit → create; choosing a Mall adds one selection when needed.
- Search is debounced at approximately 300 ms, cancels/ignores stale results, and does not request on every keystroke.
- All large datasets use server pagination. No ordinary Select receives a fixed 100/200-record preload.
- Unit rows show at least code/name, Mall, floor, zone, NLA/GFA, category, status, and current Booking eligibility.
- Party rows show the search-matching identity fields plus phone/email and linked Customer/Tenant context where authorized.
- Selected items remain visible while filters or pages change.
- Loading, empty, error, retry, unauthorized, validation, conflict, and stale-eligibility states are distinct.
- A create conflict or status race preserves entered data and offers refresh/reselect, rather than closing the dialog.
- Focus is trapped in the dialog, tabs and rows are keyboard operable, validation is announced, and focus moves to the first actionable error.

## 6. Proposed Additive API

### `GET /bookings/unit-finder`

This is a Booking-specific read model, not a replacement for `GET /spaces/units` or `POST /bookings`.

Suggested query fields:

- `mallId` — required by the UX when the global Mall selector is active; always access-validated.
- `floorId`, `zoneId`, `search`, `category`, `status`, `leaseTermType`.
- `minArea`, `maxArea`.
- `page`, `limit`, `sortBy`, `sortOrder` with bounded limits and stable secondary ordering.
- `minRent`, `maxRent` only after Unit currency semantics are confirmed; omit in the first implementation otherwise.

Suggested response shape:

```ts
type BookingUnitFinderRow = {
  id: string;
  code: string;
  name: string | null;
  mall: { id: string; name: string };
  floor: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
  areaNLA: number | null;
  areaGFA: number | null;
  category: string | null;
  leaseTermType: string;
  status: string;
  currentEligibility: {
    selectable: boolean;
    mode: 'IMMEDIATE' | 'QUEUE' | 'BLOCKED';
    reasonCode: string | null;
    queueCount: number | null;
  };
};
```

The server must derive `currentEligibility` from the same Booking/Unit rule used by create. Reason codes are stable API values localized by the frontend. The query returns only accessible Malls at the data-access layer. Queue count should be included only if it can be computed without an unbounded N+1 query. The response must not include an unlabeled Unit rent value.

### Party search

- Reuse `GET /crm/leads` and `GET /crm/customers` rather than creating another party database.
- Lead requests pass selected `mallId`, search, page, and bounded limit.
- Customer search matches company name, brand name, contact name, email, and customer code as currently implemented; phone and tax code are display fields but are not search fields unless separately added and tested.
- Customer requests remain blocked from final design until BC-016 is resolved and enforced server-side.

### Create response

Keep `POST /bookings` unchanged. Render actual returned `status`, `priority`, hold expiry, Unit, and party identity. Then invalidate/refetch Booking and Unit queries. Do not calculate a final queue position only in the browser.

## 7. Planned Files

No file in this section is authorized for modification during Phase A.

### Frontend — new

- `apps/frontend/src/components/bookings/BookingWorkspaceDialog.tsx`
- `apps/frontend/src/components/bookings/PartyFinder.tsx`
- `apps/frontend/src/components/bookings/UnitFinder.tsx`
- `apps/frontend/src/components/bookings/BookingWorkspaceDialog.test.tsx`
- `apps/frontend/src/components/bookings/PartyFinder.test.tsx`
- `apps/frontend/src/components/bookings/UnitFinder.test.tsx`

### Frontend — modify

- `apps/frontend/src/pages/bookings/CreateBookingDialog.tsx` — compatibility wrapper around the shared workspace.
- `apps/frontend/src/components/spaces/dialogs/CreateBookingDialog.tsx` — compatibility wrapper preserving Unit preselection.
- `apps/frontend/src/pages/bookings/BookingsPage.tsx` — supply selected Mall context and refresh behavior.
- `apps/frontend/src/api/bookings.ts` — typed Unit Finder request.
- `apps/frontend/src/types/index.ts` — shared finder and result types if this remains the repository convention.
- `apps/frontend/src/locales/en/bookings.json`
- `apps/frontend/src/locales/vi/bookings.json`
- `apps/frontend/src/lib/unit-status.ts` — only if review approves extracting shared display labels without duplicating business eligibility.

Do not modify the currently dirty `common.json` locale files for this change. Booking-specific strings belong in the Booking namespace.

### Backend — new

- `apps/backend/src/modules/booking/dto/unit-finder-query.dto.ts`
- `apps/backend/src/modules/booking/booking.unit-finder.spec.ts`

### Backend — modify

- `apps/backend/src/modules/booking/booking.controller.ts`
- `apps/backend/src/modules/booking/booking.service.ts`
- `apps/backend/src/modules/booking/booking.controller.spec.ts`

### Documentation — Phase A only

- `docs/architecture-review/CR-BOOKING-UX-AUDIT.md`
- `docs/changes/CR-BOOKING-UX-IMPLEMENTATION-PLAN.md`

## 8. Implementation Waves After Authorization

### Wave 0 — decisions and approval

- Resolve every blocking Business Confirmation in Section 12.
- Complete P1/Tier 0 review chain and record signatures.
- Confirm the final Impact Map and endpoint contract.
- If a decision introduces schema, financial, or cross-domain scope, update the Impact Map and obtain review before coding.

### Wave 1 — backend read model

- Extract/reuse a single server-side Unit eligibility classifier without changing create semantics.
- Add Mall-scoped, paginated Unit Finder query and DTO validation.
- Add authorization, status, queuing, stable ordering, filter, pagination, and query-count tests.
- Verify create behavior and transaction retry tests remain green.

### Wave 2 — shared frontend workspace

- Build Party Finder, Unit Finder, persistent summaries, and details/review panel.
- Add debounced/cancel-safe requests, query pagination, explicit async states, localization, and accessibility behavior.
- Use the canonical Booking currency formatter only for currency-qualified values.

### Wave 3 — entry-point integration

- Convert both old dialogs to compatibility wrappers.
- Preserve Unit preselection from Spaces and Mall context from Bookings.
- Remove divergent data-fetching only after both paths pass regression tests; actual deletion is a reviewed follow-up within the approved file list.

### Wave 4 — quality gates and release

- Run targeted unit/integration tests, builds, Golden E2E, concurrency, denial, and reconciliation checks.
- Capture before/after request counts and large-result behavior with seeded volume or a representative test fixture.
- Release behind an existing feature-flag mechanism if one exists at implementation time; otherwise use atomic frontend/backend backward-compatible deployment and a documented rollback.

## 9. Verification and Quality Gates

### Static and automated checks

From the relevant app directories:

```text
apps/backend: npm run lint
apps/backend: npm test -- booking
apps/backend: npm run build
apps/backend: npm run test:e2e -- --runInBand
apps/frontend: npm test -- BookingWorkspaceDialog PartyFinder UnitFinder
apps/frontend: npm run build
```

Final command syntax may be narrowed to existing test filenames, but no gate may be represented as passed unless its command actually runs successfully.

### Golden E2E scenarios

- **GS-01:** Lead → Booking → Proposal → Contract, plus a Customer-origin variant after customer authorization is confirmed.
- **GS-02:** competing writers select the same Unit; active/queued outcomes and Unit status reconcile.
- **GS-09:** cross-Mall discovery and create denial for inaccessible Mall data.
- **GS-11 / GS-12 / GS-13:** Booking currency remains stable and no Unit rent receives an inferred currency.
- **GS-15:** retry after commit/ambiguous network failure does not create a duplicate active/pending Booking.

### Targeted scenarios

- Search and paginate beyond the first 20 Units and beyond the first page of Leads/Customers.
- Rapid typing shows only the latest query result and produces bounded request volume.
- `VACANT`, `BOOKING`, and blocked Unit states display the server-derived eligibility and correct reason.
- Unit changes state after selection but before create; submit reports conflict, preserves form input, and supports refresh/reselection.
- Duplicate party/Unit Booking returns actionable conflict without losing entered data.
- Spaces entry preselects its Unit; Bookings entry respects selected Mall.
- Unauthorized Mall IDs and parties never appear and are denied when requested directly.
- Keyboard-only, screen-reader labeling, focus recovery, narrow viewport, Vietnamese, and English paths pass.

### Reconciliation checks

- Create response status/priority equals the refreshed Booking list/detail.
- Unit status after create equals the Booking lifecycle expectation.
- Queued position/count, if exposed, equals backend ordering and is refreshed after create.
- Lead/Customer/Tenant identity in the summary equals the persisted Booking relation.
- Booking money renders with Booking currency in form, success state, list, and detail.
- Dashboard/reports receive no new calculation and show no regression from this read/UX change.

## 10. Compatibility, Deployment, and Rollback

- The API change is additive; existing Unit and Booking endpoints remain available.
- The create payload and response remain backward compatible.
- Deploy the backend endpoint before or with the frontend. The old compatibility wrappers permit frontend rollback.
- Rollback consists of restoring the old wrappers and ceasing calls to the additive finder endpoint; no data rollback or migration is expected.
- If implementation changes stored data, state rules, or create contract, this rollback plan becomes invalid and the CR must be revised and re-reviewed.

## 11. Risks

| Risk | Severity | Mitigation |
|---|---:|---|
| UI repeats backend eligibility and drifts again | High | Server-derived eligibility/reason codes; create remains authoritative. |
| Customer data leaks across Malls/tenants | Critical | Block Customer tab release until BC-016 is decided and enforced at data access. |
| Lead from one Mall books Unit in another | High | Resolve policy; validate server-side on both discovery and create. |
| Unit rent is mislabeled as VND/current Mall currency | Critical | Suppress Unit rent until a historical currency source is approved. |
| Queue status changes between search and submit | High | Advisory finder state, transactional revalidation, recoverable conflict UI. |
| Finder performs N+1 queue counts | Medium | Aggregate query or omit count; add query/performance test. |
| Two old dialogs continue to diverge | High | One shared workspace and temporary thin wrappers only. |
| Dirty unrelated user changes are overwritten | High | Restrict implementation to approved files; do not touch existing unrelated modifications. |

## 12. Business Confirmations

The Wave 1 authorization resolved or deferred these items as follows.

### BC-BOOKING-UX-001 — Customer Mall ownership

**DECIDED FOR WAVE 1 — CUSTOMER SELECTION DEFERRED**

- **Context:** Customer records have no `mallId`; the CRM controller's customer Mall/tenant scoping is already tracked as BC-016.
- **Question:** Are Customers portfolio-global, tenant-scoped, Mall-scoped through another relation, or visible by a different explicit policy?
- **Options:** (A) global to all authorized CRM users; (B) derived through Tenant/Mall relations; (C) explicit Customer-Mall association; (D) another approved rule.
- **Impact:** Determines Customer search query, data-access authorization, cross-Mall denial tests, and whether the Customer tab can ship.
- **Answer:** Booking remains Lead-based. No direct Customer selection or Customer model/schema change is included.
- **Status:** Deferred; not blocking Wave 1.

### BC-BOOKING-UX-002 — Lead-to-Unit Mall compatibility

**DECIDED — SAME MALL REQUIRED**

- **Context:** Leads may have a nullable `mallId`. Create checks Unit Mall access and Lead existence but does not enforce a same-Mall pairing.
- **Question:** May a user with access to both Malls book a Unit in Mall B for a Lead associated with Mall A, and what is the rule for a Lead with no Mall?
- **Options:** (A) same Mall required; (B) any accessible Mall allowed; (C) explicit Lead reassignment/confirmation; (D) another approved rule.
- **Impact:** Requires server-side discovery and create validation; frontend filtering alone is insufficient.
- **Answer:** Lead and Unit must belong to the same Mall. A different or missing Lead `mallId` fails safely; frontend filtering is advisory and `POST /bookings` revalidates.
- **Status:** Resolved for Wave 1.

### BC-BOOKING-UX-003 — Unit rent currency source

**DECIDED FOR WAVE 1 — DO NOT DISPLAY UNIT RENT**

- **Context:** Unit stores base/CAM/asking rent but no currency. Current Mall currency cannot safely describe historical Unit values.
- **Question:** What immutable or effective-dated currency qualifies each Unit rent value?
- **Options:** (A) add Unit/effective-dated currency with migration; (B) derive from an approved immutable pricing record; (C) do not display Unit rent in this workflow.
- **Impact:** Controls rent columns/filters and may require a separate Tier 0 schema and migration CR/ADR.
- **Answer:** Omit Unit rent and Unit-currency display. Any future source-of-truth decision requires a separate Tier 0 CR/ADR.
- **Status:** Deferred; not blocking Wave 1.

### BC-BOOKING-UX-004 — Primary area for Booking

**DECIDED FOR WAVE 1 — NO AREA AUTO-DEFAULT**

- **Context:** The Spaces dialog pre-fills NLA, while Units expose both NLA and GFA and Booking accepts area.
- **Question:** Should Booking area default from NLA, GFA, a category rule, or require explicit entry?
- **Options:** (A) NLA; (B) GFA; (C) category/configuration rule; (D) no automatic default.
- **Impact:** Affects default value, summary labeling, validation, and downstream Proposal/Contract consistency.
- **Answer:** Display NLA/GFA with their actual labels where available and leave requested Booking area explicit; do not substitute or auto-default one area for another.
- **Status:** Resolved for Wave 1.

### BC-BOOKING-UX-005 — Deliberate queue selection

**DECIDED — QUEUE SELECTION IS SUPPORTED**

- **Context:** Backend permits another party to book a Unit in `BOOKING`, creating a queued `PENDING` Booking, while the current Bookings finder hides those Units.
- **Question:** Should users deliberately see and select `BOOKING` Units to join the queue?
- **Options:** (A) yes, always with queue warning; (B) role-controlled; (C) no, only backend/legacy behavior; (D) another approved rule.
- **Impact:** Controls visible statuses, eligibility mode, queue messaging, and GS-02 expectations.
- **Answer:** Show `BOOKING` Units as queue-eligible and selectable with an explicit warning when backend eligibility allows it.
- **Status:** Resolved for Wave 1.

## 13. Approval Gate

This change crosses Booking lifecycle, Mall authorization, customer/tenant visibility, and financial display boundaries. It is P1 / Tier 0 and cannot be self-approved by an implementation agent.

| Required approval | Status |
|---|---|
| Functional / business behavior | Approved for Wave 1 |
| Leasing domain owner | Approved for Wave 1 |
| Solution / Chief Architect | Approved for Wave 1 |
| Multi-Mall and authorization review | Approved decision; implementation verification required |
| Multi-Currency review | Approved decision to omit Unit rent |
| QA Golden E2E plan | Approved; execution required before completion |

### Implementation readiness

**READY FOR WAVE 1**

### Implementation authorization

**GRANTED — WAVE 1 ONLY**

Wave 1 may be implemented within the authorization update above. Wave 2 and all explicitly excluded areas remain unauthorized.

## 14. Wave 1 Closure Record

Wave 1 closed on 2026-08-23 after final source-level UX and accessibility
verification. The Unit Finder now presents Unit, floor, zone, NLA/GFA area,
status, and Booking eligibility as distinct information; blocked rows remain
visible with an explicit reason; and all filters have a one-action reset.
Lead and Unit text search and NLA range entry are debounced, with server-side
pagination and recoverable loading, empty, and error states.

The create response remains backend-authoritative for status and queue
priority. The frontend provides a pre-submit queue warning and displays the
returned status/priority after success. Same-Mall validation, current Unit
eligibility, queue priority, Unit transition, concurrency retry, and atomicity
remain enforced by `POST /bookings` and its serializable transaction.

Closure evidence:

- Backend focused tests: 5 suites, 39/39 tests passed.
- Backend full tests: 88 suites, 588/588 tests passed.
- Frontend focused tests: 5 files, 12/12 tests passed.
- Frontend full tests: all Wave 1 tests passed; the accepted baseline remains
  exactly 9 failures in unchanged `BookingsPage.test.tsx`.
- Backend lint, backend build/typecheck, frontend build/typecheck, and
  `git diff --check`: passed.
- Responsive viewport review: **NOT VERIFIED** because no browser runtime was
  available. No responsive PASS is claimed.

Deferred without scope expansion: Customer integration, Unit rent/currency,
and NLA/GFA business defaults. Wave 2 was not started.
