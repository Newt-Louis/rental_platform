# 01 — Platform Scope

## Status of this document

This is a **hypothesis inventory**, verified once at authoring time
(2026-08-20) directly against the filesystem. It is a starting point for
System Truth reconstruction, not a substitute for it. Counts and groupings
below WILL drift as the codebase changes — treat any number here as stale
the moment `apps/backend/src/modules/` or `apps/frontend/src/pages/`
changes.

**Verified backend module count at authoring time: 30**
(`apps/backend/src/modules/*`)

**Verified frontend page-directory count at authoring time: 31**
(`apps/frontend/src/pages/*`, excluding the standalone `NotFoundPage.tsx`)

The original governance brief that seeded this document estimated
"approximately 31–32 modules" and separately noted the list it supplied
might itself contain 32 named items though described as 31. Both of those
were unverified estimates. The verified backend/frontend counts above
supersede them, but backend module count and frontend page-directory count
are **not the same thing** — several frontend page directories
(`admin`, `cross-mall`, `deal-pipeline`, `deals`, `pipeline-stats`,
`profile`) do not correspond 1:1 to a backend module of the same name, and
some backend modules (`categories`, `branding`, `telemetry`) have no
dedicated top-level frontend page directory. **The authoritative module
inventory, with real domain/ownership mapping, must be produced by
`docs/system-truth-templates/MODULE_INVENTORY.md` via
`10-SYSTEM-TRUTH-RECONSTRUCTION-PROMPT.md` — do not treat this file's
lists as final.**

## Backend modules (verified directory listing, `apps/backend/src/modules/`)

```text
ai                    fitout               proposals
analytics              inventory            reports
announcements          notifications        sales
approvals              parking              sap
audit-log              parking-dashboard    service-contracts
auth                   patrol               slots
billing                sap                  spaces
booking                                     telemetry
branding                                    tenants
categories                                  tickets
contracts                                   users
crm                                         work-orders
dashboard
```

## Frontend page directories (verified, `apps/frontend/src/pages/`)

```text
admin                  contracts            proposals
ai                     crm                  reports
analytics              cross-mall           sales
announcements          dashboard            sap
approvals              deal-pipeline        service-contracts
audit-log              deals                spaces
auth                   fitout               tenant-portal
billing                inventory            tenants
bookings               parking              tickets
                        parking-dashboard    work-orders
                        patrol
                        pipeline-stats
                        profile
```

## Grouping (as-supplied hypothesis, for orientation only — re-verify per domain in System Truth)

**Core Leasing**: CRM, Bookings, Proposals, Approvals, Contracts, Billing

**Space / Mall Operations**: Spaces, Slots, Fitout, Work Orders, Tickets,
Patrol, Inventory

**Other Financial Domains**: Service Contracts, Parking (+
Parking Dashboard), Sales, SAP

**Tenant**: Tenants, Tenant Portal

**Reporting**: Dashboard, Reports, Analytics, Pipeline Stats

**Platform / Administration**: Auth, Users, Categories, Branding,
Announcements, Audit Log, Notifications, AI, Telemetry

This grouping is a hypothesis for onboarding purposes only. Actual domain
boundaries, ownership, and coupling must come from
`docs/system-truth-templates/02-DOMAIN-OWNERSHIP.md` and
`PLATFORM_DEPENDENCY_MATRIX.md` once reconstructed.

## Cross-cutting capabilities

These are platform-wide capabilities that no single domain owns, but which
almost every domain depends on. Any change to one of these is presumed
platform-level (Tier 0/1, see `09-ERP-CHANGE-SEVERITY.md`) until proven
otherwise:

- **Files** — document/attachment storage used by Contracts, Fitout,
  Tickets, Tenant Portal, and others.
- **Email** — outbound transactional/notification email.
- **Outbox** — reliable event-publication pattern for cross-module effects.
- **Retry Queue** — retry/backoff handling for async jobs and integrations.
- **Distributed Lock** — concurrency control for cross-process critical
  sections (e.g. booking slot allocation, billing generation).
- **Job Ledger** — record of scheduled/async job execution for
  idempotency and audit.
- **Search** — cross-entity lookup/indexing.
- **Export** — data export (CSV/Excel/PDF) used by Reports, Billing,
  Contracts.
- **Reconciliation** — scheduled or on-demand consistency checks between
  modules (e.g. Billing totals vs. Reports totals).
- **Configuration** — runtime/platform configuration store.
- **Feature Flags** — controlled rollout mechanism.
- **Monitoring** — Telemetry module and any external APM/logging.
- **Backup/Restore** — data durability and recovery.

Existence and actual implementation of each capability above must be
confirmed, not assumed — record findings in
`docs/system-truth-templates/00-SYSTEM-OVERVIEW.md`.

## Verification instructions for future System Truth work

Re-derive the authoritative inventory from:

```text
apps/backend/src/modules/
apps/frontend/src/pages/
```

plus:

- route registration (NestJS module imports / controllers)
- scheduled jobs (`@Cron`, queue processors)
- shared/cross-cutting services not under a single module directory
- frontend routes not reflected 1:1 in `pages/` directory names

Do not treat this file's counts as current beyond the date at the top of
System Truth reconstruction.
