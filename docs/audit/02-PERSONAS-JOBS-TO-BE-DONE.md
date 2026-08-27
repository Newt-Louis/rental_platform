# 02 — Personas & Jobs To Be Done

> Phase 2. Personas derived from the actual 9-role RBAC matrix and each role's
> granted routes (`apps/frontend/src/lib/permissions.ts`), not assumed generically.
> Several backend roles collapse into the same functional persona; conversely one
> role (`OPERATION`) covers what are, in practice, several very different jobs.

## Persona A — Leasing Executive (front-line sales)
**Roles:** `LEASING_EXECUTIVE`. **Access:** dashboard, spaces, crm, crm-overview,
deal-pipeline, pipeline-stats, bookings, proposals, contracts (view), tenants,
tenant-portal. **Explicitly excluded from:** approvals, billing, most operations.

- **Goals:** Fill vacant units. Move a lead from first contact to a signed proposal
  as fast as possible.
- **JTBD:** "When a prospective tenant is interested in a unit, I want to record
  them, hold the unit, and produce a priced proposal without needing anyone else's
  help, so that I don't lose the deal to a slower process."
- **Daily tasks:** update lead pipeline, create bookings, edit proposal scenarios.
- **Frequent tasks:** convert booking→proposal, chase stalled leads.
- **Occasional tasks:** none — role is narrow by design (a "front-line" scope).
- **Pain point (grounded in code):** Cannot see the approvals queue their own
  proposal is sitting in — they can submit but not track status beyond the
  proposal's own status badge. No visibility into *why* a proposal is stuck at a
  particular approver.
- **Expected dashboard:** occupancy, pipeline, their own bookings/proposals — not
  finance or operations noise. Backend `focusAreasForRole` already scopes this
  correctly (`LEASING_ROLES → ['occupancy','booking','approvals','pipeline']`).
- **Expected notifications:** proposal status changes, booking expiry countdown,
  lead follow-up reminders (already implemented via the 07:30 cron).

## Persona B — Leasing Manager / Mall Director (deal decision-maker)
**Roles:** `LEASING_MANAGER`, `MALL_DIRECTOR`. **Access:** broadest staff role —
everything Leasing Executive has, plus approvals, billing (Director only), fitout,
tickets, inventory (Director), patrol (Director), work-orders.

- **Goals:** Keep the pipeline moving without becoming a bottleneck; know what's
  actually waiting on *them* specifically vs. informational noise.
- **JTBD:** "When a proposal needs my decision, I want to see the deal terms, the
  discount/rent-free rationale, and what happens if I approve or reject, without
  hunting through tabs, so I can decide in one sitting."
- **Daily tasks:** review approvals queue, monitor occupancy, check contract expiry.
- **Frequent tasks:** approve/reject proposals, review tenant fitout progress.
- **Decisions:** discount thresholds trigger their approval step automatically
  (>5% discount or >60d rent-free routes to Mall Director; >10% routes to CEO) —
  this policy logic is invisible in the UI today; the approver sees the request but
  not *why* it reached them at this level.
- **Pain point:** `ApprovalsPage` shows the pipeline but the manager must already be
  on that page to know something is pending — dashboard's "pendingApprovals" tile is
  the only proactive signal, and it's a single number, not who/what.
- **Expected dashboard:** health score, pending approvals with context, expiring
  contracts, occupancy.

## Persona C — Finance (billing & collections)
**Roles:** `FINANCE`. **Access:** billing, sap, sales, contracts, service-contracts,
inventory, parking, reports, analytics — explicitly **no** crm/bookings/proposals.

- **Goals:** Get invoices out, get paid, keep AR aging low, reconcile with SAP.
- **JTBD:** "When rent is overdue, I want to know which tenant, how overdue, and
  what dunning stage they're at, so I can act before it becomes a write-off."
- **Daily tasks:** record payments, review AR aging, check dunning escalations.
- **Frequent tasks:** create adjustments (credit/debit notes), reconcile SAP sync
  logs.
- **Pain point:** Billing page carries 5 tabs (Invoices, AR Aging, Schedule,
  Dunning, Collection KPI) in one flat tab bar with no distinction between
  "things needing action today" (overdue, dunning escalations) and reference data
  (schedule, KPIs) — V2 independently flags this as an 11-tab-scale complexity
  problem across Billing's full surface.
- **Expected dashboard:** revenue, overdue debt, collection rate — already correctly
  scoped by `focusAreasForRole` (`FINANCE → ['billing','sales','contracts']`).

## Persona D — Legal
**Roles:** `LEGAL`. **Access:** narrowest staff role — dashboard, spaces, approvals,
contracts, service-contracts, tenants only.

- **Goals:** Make sure contracts are compliant before they go out for signature.
- **JTBD:** "When a proposal reaches the Legal Review approval step, I want the
  contract terms and any prior amendments in one view, so I can approve or flag
  issues without chasing the leasing team for context."
- **Daily/frequent tasks:** review pending legal-review approval steps, review
  contract amendments/termination terms.
- **Pain point:** Legal's entire job is approvals + contracts, yet both surfaces are
  organized for a leasing user's workflow (full pipeline visualization, sales
  terminology), not a compliance-review workflow.

## Persona E — Operation (the "everything else" role)
**Roles:** `OPERATION`. **Access:** service-contracts, inventory, work-orders,
patrol, parking, fitout, tickets, announcements, tenant-portal, parking-report,
parking-transaction — **8 functionally distinct areas under one role**.

- **Goals:** varies wildly by which sub-job the person is actually doing (a fitout
  coordinator, a ticket dispatcher, and a patrol supervisor are all "OPERATION" in
  this system, but do unrelated work day to day).
- **JTBD (ticket dispatcher lens):** "When a tenant reports an issue, I want to see
  it immediately, assign it, and know if it's about to breach SLA, so tenants don't
  escalate to management."
- **JTBD (fitout lens):** "When a tenant's fitout is at risk of missing the open
  date, I want to see which stage is stuck and who owns the delay."
- **Pain point:** because OPERATION is one role, the sidebar shows all 8 areas to
  everyone with this role regardless of which one they actually do — there is no
  further scoping. A patrol guard's login shows Fitout, Tickets, Work Orders,
  Parking, Service Contracts as equally prominent nav items even if they never
  touch them. This is the single biggest role-granularity gap in the RBAC model.
- **Expected dashboard:** `focusAreasForRole` gives OPERATION only
  `['tickets','fitout']` today — patrol and parking get **no** dashboard
  representation at all despite being full modules with their own nav items.

## Persona F — CEO / Admin (executive oversight)
**Roles:** `CEO`, `ADMIN`. **Access:** CEO gets cross-mall, analytics, approvals
(final-tier), reports, ai — deliberately excludes day-to-day operational detail
(no spaces/crm/bookings/tickets). ADMIN gets everything, including system config.

- **Goals (CEO):** Portfolio-level visibility, only get pulled in for high-stakes
  decisions (>10% discount, >60d rent-free).
- **JTBD:** "When I open the platform, I want to know in under 10 seconds if
  anything across all malls needs my personal decision, without navigating."
- **Daily tasks (Admin):** user/role management, mall access assignment, approval
  policy configuration.
- **Pain point (Admin):** Admin page is a single monolith mixing user management,
  categories, approval policy, and system settings with no permission granularity
  narrower than the whole ADMIN role — flagged independently in V2.

## Persona G — Tenant (external, self-service)
**Role:** `TENANT`. **Access:** a completely separate flat nav (`TENANT_NAV`, 5
items) and mobile bottom-tab bar — architecturally isolated from the staff sidebar,
which is the right instinct.

- **Goals:** Understand what they owe, report problems, track their fitout, submit
  required sales figures — without learning "the system."
- **JTBD:** "When something is wrong in my unit, I want to report it in under a
  minute and see when someone is coming, without calling anyone."
- **Daily/frequent tasks:** check invoices, submit tickets, upload sales figures.
- **Pain point:** Tenant sees a `/fitout` nav link (frontend grants it) but the
  backend does not grant `TENANT` the fitout module (`role-permissions.ts`) — a
  concrete broken/dead link for this exact persona (see FR-01 in the friction
  report). Tenants get their fitout status through the Tenant Portal's own embedded
  view instead, so the sidebar link is likely vestigial and should be removed or
  fixed, not left ambiguous.
- **Expected notifications:** contract expiry (already emailed), ticket status
  changes, invoice due dates.

## Cross-persona finding

Every persona above is defined by **what modules they can open**, not by **what job
they're trying to finish**. That is the structural reason the sidebar reads as
technical/module-based rather than task-based even though individual pieces (the
`ErpProcessGuide` strip, `salesProcess` nav grouping, dashboard `focusAreas`) show
real task-based thinking already exists in the codebase — it just isn't applied
consistently. See [06-INFORMATION-ARCHITECTURE](06-INFORMATION-ARCHITECTURE.md).
