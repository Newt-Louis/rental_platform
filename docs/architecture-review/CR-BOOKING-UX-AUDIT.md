# CR-BOOKING-UX — Booking Creation / Unit Finder Audit

**Phase:** A — audit only
**Date:** 2026-08-23
**Change authorization:** NOT GRANTED
**Implementation status:** NOT STARTED

## Executive conclusion

The current `Tạo Booking / Giữ Lô` experience is not merely a long-dropdown problem. The repository contains two different booking-creation experiences that expose different business capabilities:

- The Bookings-page dialog can select only a Lead, even though the backend accepts either `leadId` or `customerId`.
- The Spaces dialog supports Lead or Customer, but loads up to 200 of each into ordinary Select controls.
- The Bookings-page unit picker requests only the first 20 `VACANT` units. It hides `BOOKING` units even though the backend deliberately allows another customer to join that unit's queue.
- Both customer/lead and unit lookup patterns become difficult at 10,000+ records. The Bookings-page dialog is server-filtered but fires on every keystroke without debounce; the Spaces dialog preloads large fixed lists without search or pagination.
- The Unit model stores monetary rent fields but has no currency field. A Unit Finder must not label `baseRentPerSqm` as VND, USD, or MMK without a confirmed source of truth.

The recommended design is a responsive split-screen ERP workspace, implemented as one shared booking-creation component used by both Bookings and Spaces. It should use a server-paginated party finder and unit table, preserve a persistent WHO/WHERE/WHAT/HOW MUCH/UNTIL WHEN/STATUS summary, and keep `POST /bookings` as the sole authority for the final booking outcome.

Implementation is **CONFIRMATION REQUIRED** because Customer mall ownership is unresolved (`BC-016`), Lead-to-Unit cross-mall compatibility is not enforced on create, and Unit rent currency is absent from the data model.

## Evidence reviewed

### Governance and system truth

All files under `docs/ai-governance/`, `docs/ai-erp-team/`, and `docs/system-truth/` were reviewed, together with `AGENTS.md` and `RUN-FIRST.md`. Particularly relevant verified facts are:

- BP-001 / GS-01 is CRM → Booking → Proposal → Approval → Contract.
- Booking create is a Serializable transaction with bounded retry and atomically writes Booking, Unit status, Lead status, and activity history.
- Unit lifecycle writes are owned by `UnitStatusService`.
- Booking endpoints and Spaces unit-list endpoints are mall-scoped at the API/data-access layer.
- `Customer` has no `mallId`; its intended scope remains `UNKNOWN — BUSINESS CONFIRMATION REQUIRED` (`BC-016`).
- Unit money fields have no currency field and must not be presented as a known Money pair.

### Code and UX sources

- `apps/frontend/src/pages/bookings/CreateBookingDialog.tsx`
- `apps/frontend/src/components/spaces/dialogs/CreateBookingDialog.tsx`
- `apps/frontend/src/pages/bookings/BookingsPage.tsx`
- `apps/frontend/src/pages/bookings/CreateBookingDialog.test.tsx`
- `apps/frontend/src/api/bookings.ts`, `crm.ts`, `spaces.ts`
- `apps/frontend/src/components/ui/{dialog,input,select,table,badge,async-state,sheet}.tsx`
- `apps/frontend/src/lib/currency.ts`
- `apps/frontend/src/pages/spaces/spaces.constants.tsx`
- `apps/frontend/src/store/mall.store.ts`
- `apps/backend/src/modules/booking/`
- `apps/backend/src/modules/crm/`
- `apps/backend/src/modules/tenants/`
- `apps/backend/src/modules/spaces/`
- `apps/backend/src/modules/proposals/`
- `apps/backend/src/common/services/unit-status.service.ts`
- `apps/backend/src/common/services/mall-access.service.ts`
- `apps/backend/prisma/schema.prisma`
- Booking, CRM, concurrency, failure, UX, currency, money, and authorization documents under `docs/program/`, `docs/redesign/`, `docs/audit/`, and `docs/architecture-review/`.

Code was treated as final evidence where older documentation was stale.

## 1. Current Booking journey

### 1.1 Bookings-page entry point

```text
BookingsPage
→ click “Tạo booking lô”
→ CreateBookingDialog opens
→ three queries start in parallel
   GET /spaces/units?mallId=...&status=VACANT&limit=20
   GET /crm/leads?limit=20
   GET /users?limit=100
→ user selects Unit
→ user selects Lead
→ user optionally enters booking/commercial fields
→ POST /bookings
→ BookingController validates Unit mall access
→ BookingService validates Unit and party
→ Serializable transaction creates UnitBooking
→ priority 1 becomes ACTIVE; otherwise PENDING
→ priority 1 transitions Unit to BOOKING
→ linked Lead moves to PROPOSAL for an ACTIVE booking
→ success closes dialog and refreshes Booking queries
```

### 1.2 Current interaction count

Measured mouse-click baseline from the Bookings page, excluding keystrokes:

| Path | Clicks | Notes |
|---|---:|---|
| Desired Unit and Lead already visible | 4 | Open dialog → select Unit → select Lead → create |
| Search both Unit and Lead | 6 | Adds focus into both search fields; keystrokes are not counted |
| Existing Customer from Bookings page | Not possible | This dialog never sends `customerId` |
| Existing Customer through Spaces | At least 5 plus navigation | Navigate/select Unit → start Booking → switch to Customer → open/select Customer → create; the Customer list is capped at 200 and is not searchable |

The raw minimum of four clicks is not the main defect. The material friction is ambiguous results, incomplete result sets, missing Customer support, repeated scrolling, and no persistent context.

### 1.3 Visible controls and required fields

The Bookings-page dialog exposes 11 controls:

1. Unit search/selection
2. Lead search/selection
3. Requested area
4. Requested term
5. Hold days
6. Currency
7. Expected rent per m²
8. Proposed rent per m²
9. Proposed CAM per m²
10. Notes
11. Assigned salesperson

Actual API requirements from `CreateBookingDto`:

- Required: `unitId`.
- Required mutually exclusive party rule: at least one of `leadId` or `customerId`.
- Optional: `assignedToId`, requested area, requested term, expected rent, currency, proposed rent, proposed CAM, hold days, notes.
- Backend defaults: `holdDays = 30`, `currencyCode = VND`.
- Numeric validation explicitly enforces `requestedTerm >= 1` and `holdDays >= 1`. Other optional numeric fields are typed but have no declared positive minimum in the DTO.

Current frontend validation is narrower and inconsistent with the API: it requires Unit + Lead specifically, never offers Customer, and displays only two bottom-of-dialog hints. Submission errors are shown in a toast.

### 1.4 Current async states

| State | Current behavior |
|---|---|
| Unit loading | No visible loading state |
| Unit error | No visible error or retry |
| Unit empty | Shown only after non-empty unit search |
| Lead loading | No visible loading state |
| Lead error | No visible error or retry |
| Lead empty | No explicit message |
| Users loading/error | No state; dropdown simply remains incomplete/empty |
| Submit loading | Button disabled and label changes |
| Submit API error | Destructive toast using backend message when available |
| Success | Generic success toast; does not say ACTIVE vs PENDING or queue position |

## 2. Customer / Lead / Tenant search audit

### 2.1 Current Bookings-page behavior

- Searches Leads only via `GET /crm/leads`.
- Server-side paginated query with `limit=20`.
- Query fires once on open with an empty search and again for every typed character.
- No debounce, minimum search length, pagination UI, or “more results” indicator.
- Result rows show only brand, contact name, and raw Lead status.
- The query does not pass the active `mallId`, so a multi-mall user can receive Leads across all accessible malls while Unit results may be constrained to the currently selected Mall.

### 2.2 Searchable fields proven by current APIs

| Business field | Lead API search | Customer API search | Tenant API search | Can display from response? |
|---|---|---|---|---|
| Customer code | No direct Lead search | Yes (`customerCode`) | N/A | Yes for Customer; linked Customer code is included with Lead |
| Customer/company name | Yes (`company`) | Yes (`companyName`) | Yes (`companyName`) | Yes |
| Tenant | No relation search | No relation search | Tenant endpoint searches its own record | Lead/Customer responses include linked Tenant context, but Booking does not accept `tenantId` directly |
| Brand | Yes (`brandName`) | Yes (`brandName`) | Yes (`brandName`) | Yes |
| Phone | No | No | No | Yes on Lead/Customer/Tenant records, but not searchable |
| Email | Yes | Yes | Yes (`contactEmail`) | Yes |
| Tax code | No | No | No | Customer/Tenant can display it, but current list search does not match it |
| Contact person | Yes (`contactName`) | Yes (`contactName`) | Yes (`contactName`) | Yes |

Unsupported search claims must not appear in placeholders. In particular, “phone / tax code” must not be advertised until the backend query actually supports them.

### 2.3 Identification quality

Current Lead results are ambiguous when brands or contacts repeat. The minimum useful row should use only existing response fields:

```text
Brand / company
Lead status · Contact name
Email or phone (display context only)
Linked customer code / linked tenant, when present
```

Customer results can be stronger:

```text
Company name · Brand
Customer code · Customer status
Contact name · Email or phone
Linked tenant, when present
```

### 2.4 Architecture recommendation

Use server-side search with debounce and pagination for both Lead and Customer tabs. Do not create a direct Tenant selector because `CreateBookingDto` has no `tenantId`; Tenant is downstream context resolved through a linked Lead/Customer.

Recommended request policy:

- 300 ms debounce.
- Minimum 2 characters before a broad search, with a small “recent/default” first page allowed when the dialog opens.
- Page size 20 or 25.
- Explicit loading, empty, error, retry, and total/more-results states.
- Always pass the chosen Mall to Lead search when the Mall is known.
- Customer search remains blocked for final implementation scope until `BC-016` confirms Customer visibility/scoping.

## 3. Unit Finder audit

### 3.1 Current Bookings-page behavior

- Calls the server-side paginated Spaces endpoint, but renders only page 1 and never exposes pagination.
- Hard-filters `status=VACANT` and `limit=20`.
- Search is server-side, but each keystroke immediately creates a new query.
- Search matches Unit code, Unit name, or legacy category only.
- Row context is Unit code/name, Floor, and GFA.
- It does not show Mall, Zone, NLA, Category, Status, queue state, rent, or currency.
- It does not force `leaseTermType=LONG`, although `BookingService.create()` rejects a SHORT-term Unit.
- It uses GFA in selection labels even though the Spaces-originated booking form defaults the requested lease area from NLA.

### 3.2 Existing server support

The existing Spaces APIs already support server pagination and the following real fields:

| Filter / display | Backed by code? | Notes |
|---|---|---|
| Mall | Yes | `mallId`; accessible-mall fallback is enforced server-side |
| Floor | Yes | `floorId`, and Floor relation is returned |
| Zone | Yes | `zoneId`, and Zone relation is returned |
| Unit code/name | Yes | Combined `search` |
| Category | Yes | Search and exact filter; both legacy string and `categoryId` exist in schema |
| Area | Yes | `minArea`/`maxArea` apply to NLA; GFA and NLA are returned |
| Status | Yes | Basic endpoint accepts one status; advanced endpoint accepts one or multiple statuses |
| Base rent range | Yes | `minRent`/`maxRent` on `baseRentPerSqm` |
| Currency | No | Unit has no currency field |
| Sorting | Advanced endpoint | Code, rent, area, lease end, updated |
| Pagination | Yes | `page`, `limit`, `total`, `totalPages` |

Floor and Zone names are not part of the free-text search. They must be represented as filters, not falsely advertised in the search placeholder.

### 3.3 Unit availability and lifecycle

Authoritative rules are in `BookingService.create()` and `UnitStatusService.isLockedForBooking()`:

| Unit status | Current create behavior | Target Finder behavior |
|---|---|---|
| `VACANT` | Bookable; normally creates priority 1 `ACTIVE` booking and transitions Unit to `BOOKING` | Selectable, label as immediate-hold candidate |
| `BOOKING` | Bookable; creates a later-priority `PENDING` booking | Selectable with queue warning and current queue count if returned |
| `NEGOTIATING` | Rejected as locked | View-only/disabled with backend reason |
| `CONTRACTED` | Rejected as committed/locked | View-only/disabled |
| `UNDER_FITOUT` | Rejected as committed/locked | View-only/disabled |
| `OCCUPIED` | Rejected as committed/locked | View-only/disabled |
| `MERGED` | Rejected as locked | View-only/disabled |

Additional authoritative gates:

- Unit must exist and be active.
- Long-term Booking accepts only `leaseTermType=LONG`.
- Final status and queue position are race-sensitive; the POST response is authoritative.

The frontend should not embed a second independent locked-status list. A finder response should expose server-derived eligibility and reason codes using the same backend rule source, while `POST /bookings` revalidates everything transactionally.

### 3.4 Rent and currency limitation

`Unit.baseRentPerSqm`, `askingRentPerSqm`, and `camPerSqm` are bare numeric fields. `Unit` has no `currencyCode`. Existing Spaces UI hardcodes VND, but System Truth explicitly classifies this as a model/business-intent gap, not reliable evidence.

Therefore:

- A Unit Finder must not render `120,000,000 | VND` for Unit base rent unless the currency source is confirmed.
- Booking-entered `expectedRent` and `proposedRentPerSqm` can be rendered with `Booking.currencyCode` via the canonical `formatMoney` utility.
- The Unit Rent/Currency columns remain blocked pending `BC-BOOKING-UX-003` below.

## 4. UX alternatives

| Criterion | A. Single-page workspace | B. Stepper | C. Split-screen ERP workspace |
|---|---|---|---|
| Speed | High | Medium; Next/Back adds actions | Highest on desktop; results and form stay visible |
| Click count | Low | Highest | Low |
| Cognitive load | Medium on a long vertical form | Low per step, but context is hidden between steps | Low when summaries remain pinned |
| Error prevention | Good | Good, but stale selections are easier to forget | Best; Customer, Unit, status, and terms stay visible |
| 10,000-record search | Good with embedded finders | Good, but each step needs its own state | Best fit for a paginated Unit table |
| Small screens | Natural vertical flow | Strongest | Requires responsive stacking |
| Current architecture fit | Moderate | Requires new navigation/state machinery | Strong: current Dialog, Table, AsyncState, Select, Badge, and form primitives can be reused |
| Implementation complexity | Medium | Medium-high | Medium-high but localized |

### Selected approach

**C — Split-screen ERP workspace**, responsive to a single-column layout below desktop width.

Recommended structure:

```text
Mall context (inherited; required if current context is “All Malls”)
Customer/Lead finder and persistent selected-party summary

┌──────────────────────────────────┬───────────────────────────────┐
│ Unit search + real filters       │ Selected Customer / Lead      │
│ Paginated Unit results table     │ Selected Unit summary         │
│ Status / queue eligibility       │ Booking details               │
│                                  │ Review + Create               │
└──────────────────────────────────┴───────────────────────────────┘
```

On narrow screens, the order becomes Customer → Unit Finder → persistent summary → Booking details → Review/Create. This is a responsive representation of the same state, not a separate Stepper.

## 5. Target information model

The workspace must continuously answer:

- **WHO:** Lead or Customer, code/type, brand/company, contact, linked Tenant if any.
- **WHERE:** Mall, Unit, Floor, Zone.
- **WHAT:** NLA/GFA distinction, category, long-term classification.
- **HOW MUCH:** Booking expected/proposed values plus explicit Booking currency. Unit base rent only after its currency is authoritative.
- **UNTIL WHEN:** hold days and calculated expiry date preview; backend response remains authoritative.
- **STATUS:** Unit status, selectable/disabled reason, and actual Booking result (`ACTIVE` or `PENDING`) after creation.

## 6. Error prevention and authority boundaries

| Risk | Backend current authority | Required frontend behavior |
|---|---|---|
| Unit already reserved | Queue calculation in Serializable create transaction | Show `BOOKING` as queue-capable; after submit, display actual `PENDING` priority returned |
| Unit changed status | `BookingService` and `UnitStatusService` revalidate; failed transition rolls back transaction | Preserve form, refresh selected Unit, show backend message inline and in toast |
| Concurrent booking | Serializable transaction + P2034 retry; exactly one priority 1 | Never predict final priority as guaranteed; use POST response |
| Duplicate party+Unit booking | Backend 409 Conflict for existing ACTIVE/PENDING match | Show specific duplicate message and link to/open existing queue when possible |
| Booking queue | Backend priority/status | Display queue warning; never calculate priority client-side |
| Expired booking | Hourly locked job, per-booking transaction/revalidation | No rule change; new create UX must not alter expiry handling |
| Cross-Mall Unit access | BookingController validates selected Unit | Finder must use scoped API; never trust hidden rows/client filtering |
| Cross-Mall Lead pairing | Not explicitly validated on create | Blocked pending confirmation and backend design; frontend Mall filter alone is insufficient |
| Unauthorized Unit | MallAccessService | Treat 403 as authorization failure; remove stale selection |
| Invalid Customer/Lead | BookingService existence check | Display backend message and retain other inputs |
| API/network failure | Transaction rollback / HTTP error | Explicit retry and retained workspace state |
| Price approval | BookingService validates VND category rules | Preserve existing approval warnings; do not apply VND pricing rules to USD/MMK |

## 7. Performance findings

### Current

- Bookings dialog: first 20 Units and Leads; no pagination control.
- Every unit/lead keystroke can create another network request.
- No cancellation/debounce policy is implemented at the component level.
- Spaces booking dialog: up to 200 Leads + 200 Customers are loaded into the browser on open.
- Assigned salesperson list loads at most 100 Users and is not searchable.

### Target

- Server-side search and filtering for all large entity sets.
- 300 ms debounce and stable query keys.
- Page size 20/25; Unit table exposes total and pagination.
- Do not load all Customers, Leads, or Units into the browser.
- Scope all requests by chosen Mall where the business entity supports Mall scope.
- Keep selected records in local workspace state while search pages change.
- Query Floor/Zone options only for the selected Mall; reset dependent filters when Mall/Floor changes.
- Avoid a new search infrastructure or index in this CR; existing Prisma contains queries and indexes are sufficient for the first implementation. Production query plans at representative volume remain a verification gate.

## 8. Shared component reuse

Reuse:

- `components/ui/dialog.tsx` for the desktop workspace container.
- `components/ui/table.tsx` for Unit results.
- `components/ui/input.tsx`, `select.tsx`, `badge.tsx`, `button.tsx`.
- `components/ui/async-state.tsx` for loading/error/empty states.
- `components/ui/sheet.tsx` only if the responsive implementation needs it; do not create a parallel drawer primitive.
- `lib/currency.ts::formatMoney` and `CURRENCIES` for Booking money.
- Existing `STATUS_CONFIG` labels/colors may be extracted to a shared Unit-status presentation module; do not duplicate status labels inside Booking.

Missing reusable primitives:

- No shared SearchInput abstraction was found.
- No standalone Pagination component was found; current pages compose Buttons directly.
- The shared Table is a styled HTML primitive, not a sortable data grid.
- No canonical `MoneyAmount` React component exists yet; CR-109 separately recommends one. This CR must consume whichever canonical money presentation is approved rather than adding another formatter.

## 9. Root causes

1. Booking creation evolved independently in Bookings and Spaces, creating two different sources of UX truth.
2. The Bookings dialog was optimized as a small modal, while the data and workflow now require an ERP finder.
3. Backend search/pagination exists, but current UI does not expose its pagination or advanced filters.
4. Frontend status filtering (`VACANT` only) drifted from backend booking rules (`VACANT` and `BOOKING` accepted).
5. Customer, Tenant, and Lead are distinct entities, but the Bookings dialog labels Lead as “Lead / Customer” and hides the real choice.
6. Unit pricing was added without a currency field, preventing a financially safe Unit rent display.

## 10. Proposed change classification

| Proposed item | Classification |
|---|---|
| Shared split-screen Booking workspace | UI ONLY |
| Persistent selected Customer/Unit summaries | UI ONLY |
| Debounced server search, filters, pagination, responsive state | FRONTEND LOGIC |
| Lead vs Customer selection and correct POST payload | FRONTEND LOGIC |
| Unit finder response with backend-derived booking eligibility/reason | BACKEND API |
| Reuse/extract current bookability predicate without changing allowed statuses | BUSINESS LOGIC (refactor only; no intended behavior change) |
| Add Unit currency | DATABASE + SCHEMA + BUSINESS LOGIC — explicitly out of scope and blocked |
| Change Unit lifecycle or Booking queue rules | BUSINESS LOGIC — explicitly out of scope |

## 11. Cross-module impact map

| Domain | Impact |
|---|---|
| CRM | Lead/Customer search and selected-party identity; Lead status still changes only in BookingService |
| Tenants | Display-only linked Tenant context; no direct Tenant booking input |
| Booking | Primary UI and read API; create transaction and queue rules must remain unchanged |
| Spaces | Unit master data/search input; no ownership transfer or Unit write from Finder |
| UnitStatusService | Existing bookability/transition rules reused, not changed |
| Categories | Existing VND-only price validation remains unchanged |
| Proposals | Booking conversion snapshots party/terms; no API or calculation change in this CR |
| Approvals | No direct change; price-approval status must remain intact |
| Contracts | No direct change; downstream Proposal/Contract currency propagation checked |
| Billing | No direct change; Booking money remains `(amount, currency)` upstream |
| Mall authorization | All finder/list/detail/submit operations remain server-scoped |
| Reports/Dashboard | No metric or status interpretation change |

## 12. Golden E2E and regression scope

Required scenarios for a later implementation:

- **GS-01:** Lead → Booking → Proposal → Contract, including the Customer-originated Booking variant.
- **GS-02:** two concurrent creates for one Unit produce one ACTIVE and one PENDING booking.
- **GS-09:** a Mall-A-only user cannot find, select, fetch, or submit a Mall-B Unit.
- **GS-11/12/13:** VND/USD/MMK Booking values keep their explicit currency into Proposal/Contract where supported.
- **GS-15:** retry after commit/network loss does not create contradictory queue state.

Additional targeted cases:

- `VACANT` selection creates ACTIVE when no race occurs.
- `BOOKING` selection creates PENDING and reports actual priority.
- status changes after selection but before submit fail safely and refresh the row.
- duplicate party+Unit returns a clear 409 state.
- Lead and Customer search pagination at >20 results.
- Customer/Lead/Unit search loading, empty, error, retry.
- selected context persists while filters/pages change.
- mobile stacked flow is keyboard and screen-reader usable.

## 13. Business confirmations required

### BC-BOOKING-UX-001 — Customer Mall scope in Booking search

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

`Customer` has no `mallId`, and `CustomersController` is explicitly pending `BC-016`. Confirm whether Customers are global CRM master data available to all CRM roles, or must be restricted through Lead/Tenant/Contract Mall relationships. This blocks final authorization design for the Customer tab.

### BC-BOOKING-UX-002 — Lead and Unit cross-Mall compatibility

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

Confirm whether a Mall-scoped Lead may book a Unit in another Mall when the staff user has access to both. Current create validates the Unit and Lead independently but does not require their Mall identities to match; `Lead.mallId` is nullable. Frontend filtering cannot decide this business rule.

### BC-BOOKING-UX-003 — Unit rent currency

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

Confirm the currency source for `Unit.baseRentPerSqm`, `askingRentPerSqm`, and `camPerSqm`. Options include a fixed VND-only Unit master, Mall configuration, or a new transaction/reference currency field. Until confirmed, Unit Finder Rent/Currency columns must be omitted.

### BC-BOOKING-UX-004 — Unit area shown as booking authority

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

Confirm whether the primary finder/summary area should be NLA, GFA, or both. Existing Bookings dialog displays GFA; the Spaces booking dialog prefills requested lease area from NLA; server area-range filters use NLA.

### BC-BOOKING-UX-005 — Queue visibility policy

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

Confirm that users should deliberately select a Unit already in `BOOKING` status to join the queue. The backend currently supports this and the current dialog copy promises queuing, but the Unit picker hides all `BOOKING` units.

## 14. Audit gate result

**BOOKING UX AUDIT COMPLETED**

- Current flow: one compact dialog, three initial GETs, Unit + Lead selection, optional details, `POST /bookings`, atomic queue/status transition.
- Customer search findings: Bookings dialog is Lead-only; Customer support exists only in a separate Spaces dialog; search fields and scoping differ by entity.
- Unit search findings: first 20 VACANT units only, no pagination/debounce, insufficient identifying context, and UI/backend availability drift.
- Performance findings: no full 10,000-record browser load in the Bookings dialog, but request-per-keystroke and unexposed pagination; the Spaces dialog does preload fixed 200-record lists.
- Recommended UX: responsive split-screen ERP Booking workspace shared by both entry points.
- Before clicks: 4 minimum / approximately 6 for a normal searched path, excluding typing and optional fields.
- Expected after clicks: 4 mouse clicks in a selected-Mall, keyboard-first path (open, select party, select Unit, create); +1 if Mall context must first be chosen. The main gain is context and accuracy, not an artificial click-count claim.

### Implementation readiness

**CONFIRMATION REQUIRED**

### Implementation authorization

**NOT GRANTED**
