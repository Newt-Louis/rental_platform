# 00 — System Inventory

> Phase 0 of the UX/UI audit. Source: direct repository read (2026-08-18) — Prisma
> schema, backend modules/guards, frontend routes/pages/nav config. Cross-referenced
> against `docs/FULL_SYSTEM_UX_FUNCTION_AUDIT_V2.md` (prior engineering audit) where
> the two overlap; this document does not repeat V2's reliability/transactionality
> findings, only what is needed to understand *how the system behaves for a user*.

## 1. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite, TailwindCSS + shadcn/ui, react-router-dom v6, TanStack Query |
| Backend | NestJS 10 (Node.js), Prisma ORM, PostgreSQL 16, Redis (cache + token revocation) |
| Auth | JWT + RBAC (`RolesGuard`) + a second orthogonal `MallAccessGuard` for data-scoping |
| i18n | Vietnamese (primary) + English JSON locale files, per-module namespaces |
| Integrations | SAP FI/CO (mock), Anthropic Claude (AI assistant + daily proactive insight cron) |
| Deployment | Docker Compose (postgres, redis, backend, frontend/Nginx, one-shot migrate) |

## 2. How the system is actually organized

The codebase is a **single ERP instance**, not a set of independent apps. One Postgres
database (~100 Prisma models/enums per V2 audit), one NestJS API (~24 backend
modules), one React SPA (~40 page components across 28 routes). There is no
micro-frontend or per-module deployment boundary — the coupling between modules is
real (a proposal conversion writes to Contract, Tenant, Unit, and Booking tables in
one server action; a contract activation is expected to cascade into Fitout and
Billing — see §11 Information Flow).

## 3. Backend modules (27)

`ai, analytics, announcements, approvals, audit-log, auth, billing, booking, branding,
categories, contracts, crm, dashboard, fitout, inventory, notifications, parking,
parking-dashboard, patrol, proposals, reports, sales, sap, service-contracts, slots,
spaces, tenants, tickets, users, work-orders`

These map roughly 1:1 to frontend page folders, confirming the platform is currently
**organized around technical/data modules**, not around user tasks — see
[06-INFORMATION-ARCHITECTURE](06-INFORMATION-ARCHITECTURE.md).

## 4. Frontend structure

- `apps/frontend/src/App.tsx` — route table, lazy-loaded pages, every route (except
  `/login`, `/activate`, `/profile`, `*`) wrapped in a client-side `RoleRoute`.
- `apps/frontend/src/components/Layout.tsx` — shell: collapsible sidebar, top header
  (mall selector, language, theme, AI shortcut, notification bell, user menu), and an
  `ErpProcessGuide` strip rendered above every page body.
- `apps/frontend/src/lib/permissions.ts` — single source of truth for the sidebar
  (`NAV_GROUPS`, `TENANT_NAV`) and for `canAccessPath`/`canAccessModule`, which
  `RoleRoute` calls on every navigation.
- `apps/frontend/src/locales/{vi,en}/*.json` — per-module i18n dictionaries; nearly
  every status/label a user sees is looked up here, not shown as a raw enum.

**28 routes, ~40 page components.** Full inventory: [screen table in
07-... N/A — see Phase 27 table in 13-UX-BLUEPRINT.md and the research notes folded
into 04/05]. A condensed per-route table is in
[06-INFORMATION-ARCHITECTURE](06-INFORMATION-ARCHITECTURE.md) §Current IA.

## 5. Authentication & authorization

- **Auth**: JWT, 7-day expiry, Redis-backed revocation list for logout.
- **Roles** (`apps/backend/prisma/schema.prisma` `enum Role`, 9 values): `ADMIN,
  LEASING_EXECUTIVE, LEASING_MANAGER, MALL_DIRECTOR, FINANCE, LEGAL, OPERATION,
  TENANT, CEO`. There are **no** dedicated Patrol/Parking/Fitout-operator roles —
  those modules are reached through the existing `OPERATION` role, despite having
  their own top-level nav entries.
- **Two independent guard layers**:
  1. `RolesGuard` + `@Roles()` decorator — module/endpoint-level RBAC.
     `ADMIN` implicitly bypasses every `@Roles()` check (hardcoded "Super Admin"
     exception in `roles.guard.ts`).
  2. `MallAccessGuard` — orthogonal **data-scoping**: validates that a mall-scoped
     user's request actually touches a mall/unit/floor/contract/invoice/fitout
     record they are assigned to, independent of role.
- **Two hand-maintained permission tables that must stay in sync manually**:
  backend `apps/backend/src/common/constants/role-permissions.ts` (`MODULE_ROLES`)
  and frontend `apps/frontend/src/lib/permissions.ts` (`ROUTE_PERMISSIONS`). A
  confirmed drift exists today: frontend grants `TENANT` access to `/fitout`,
  backend does not grant `TENANT` the `fitout` module — see
  [04-UX-FRICTION-REPORT](04-UX-FRICTION-REPORT.md) FR-01.
- Frontend route guarding (`RoleRoute`) is **client-side only**; real enforcement is
  the backend `@Roles()` check per endpoint.

## 6. Major features (as delivered, from the README + code)

1. Dashboard (role-shaped KPIs + action list)
2. Mall Spaces (Mall → Building → Floor → Zone → Unit, floor-plan editor)
3. Leasing CRM (lead/customer pipeline)
4. Bookings (long-term unit hold + short-term slot booking — two parallel concepts)
5. Proposals (pricing, scenarios, WYSIWYG document editor, PDF)
6. Deal Approval (config-driven multi-step policy engine)
7. Contracts (lifecycle, amendments, termination, e-signature-style file signing)
8. Tenant Portal (contracts, invoices, tickets, sales entry)
9. Fit-out Management (9-stage configurable pipeline, Gantt, daily reports, D-Map issues)
10. Operation Tickets (SLA-tracked, tenant-and-staff shared status vocabulary)
11. Work Orders (internal maintenance, distinct from tenant Tickets)
12. Sales Turnover (tenant revenue reporting, percentage-rent basis)
13. Billing & AR (invoices, payments, AR aging, dunning, penalty interest, collection KPI)
14. Parking (service contracts, transactions, reporting — split across two nav groups)
15. Patrol (security checkpoints, anti-fraud QR/geofence)
16. Service Contracts (vendor contracts)
17. SAP Integration (mock sync, logs)
18. AI Assistant (chat + daily proactive insight notification)
19. Reports / Analytics / Cross-Mall Dashboard / Pipeline Stats (four separate
    reporting surfaces — see IA doc)
20. Admin (users, mall access, categories, approval policy, system settings)
21. Audit Log

## 7. Background jobs (scheduler, `Asia/Ho_Chi_Minh`)

| Time | Job | User-visible effect |
|---|---|---|
| 07:30 | CRM follow-up reminders due today | Notification to `assignedTo` |
| 08:00 | Contract expiry thresholds (180/90/60/30d) | Notification+email to manager, email to tenant ≤60d |
| 08:05 (weekdays) | AI proactive insights (Claude Haiku) | Notification to ADMIN/CEO/MALL_DIRECTOR |
| 08:10 | Auto-transition contract status (ACTIVE→EXPIRING→EXPIRED) | Status change, no direct notification |
| 08:30 | Auto-draft renewal proposal at 90 days out | New DRAFT proposal + notification |
| 09:00 | Mark invoices OVERDUE | Status change, picked up by dunning separately |
| every 2h | Ticket SLA breach check | Escalation + notification |
| daily 07:00 | Maintenance due-soon/overdue reminders | Notification |
| (fitout) | SLA/milestone breach check | Escalation + notification |

This is a genuinely proactive system for a handful of flows (contract renewal,
tenant follow-up, SLA escalation) — worth preserving and extending, not replacing.

## 8. Notifications

Single `Notification` model, free-form `type` string (not a Prisma enum), ~15 types
in active use spanning billing, fitout, patrol, proposals, tickets, work orders,
contracts, CRM, and AI. Delivered via a slide-over `NotificationCenter` panel plus a
header bell with 30s-polled unread count. See
[09-TASK-NOTIFICATION-CENTER](09-TASK-NOTIFICATION-CENTER.md) for the UX analysis —
in short, notifications and actionable tasks are not cleanly separated today.

## 9. Reporting

Four **separate** surfaces compute overlapping KPIs: Dashboard, Reports, Analytics,
Cross-Mall Dashboard, plus Pipeline Stats and Deal Pipeline for the sales funnel
specifically. V2 already flags this as a KPI-source-of-truth gap; this audit treats
it as an Information Architecture problem (users can't tell which one to open) — see
[06-INFORMATION-ARCHITECTURE](06-INFORMATION-ARCHITECTURE.md).

## 10. Seed / demo data

`apps/backend/prisma/seed.ts`: 1 mall (THISO Mall Sala), 5 floors, 30 units, 10
tenants, 20 leads, 15 contracts, 30 invoices (3 months), 20 tickets, 3 months of
sales data, 8 default role-based demo accounts (see README table).

## 11. What this inventory does *not* re-derive

`docs/FULL_SYSTEM_UX_FUNCTION_AUDIT_V2.md` already contains a rigorous
module-by-module functional/reliability audit (per-module current functions, gaps,
priority, value/effort) and a prioritized engineering delivery plan (Sprints A–F).
This audit builds on top of it for the experience-design layers V2 does not cover:
personas, JTBD, user journeys, navigation/IA redesign, dashboard-as-work-surface,
task/notification separation, screen-level wireframes, and a persona-facing
roadmap/backlog. Where a finding here overlaps a V2 finding, it is cited rather than
restated.
