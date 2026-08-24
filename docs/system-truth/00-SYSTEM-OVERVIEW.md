# System Truth — 00 — System Overview

## Reconstruction metadata
- Date reconstructed: 2026-08-21
- Method: 5 parallel read-only research passes (Core Leasing; Financial Core; Space/Mall Ops; Tenant & Security; Reporting/Integration) + orchestrator synthesis. Audit-only — no code, schema, migration, test, or config changes made.
- Scope covered: all 31 backend modules, matching frontend page directories, shared `apps/backend/src/common/` infrastructure.
- Prior version: none (first reconstruction).

## Platform identity

THISO Leasing Platform is a NestJS + React mall-leasing ERP covering the full lifecycle from CRM lead through lease contract, billing/collections, tenant fit-out, and day-to-day mall operations (tickets, patrol, work orders, inventory), plus adjacent revenue lines (parking, service contracts, sales/revenue-share, short-term slot bookings) and management reporting. It is **actively mid-rollout on multi-currency support** (VND/USD/MMK) across the core leasing chain, with currency support notably incomplete in several adjacent revenue modules.

## Runtime architecture

- **Backend**: NestJS. **Data layer is Prisma** (`apps/backend/prisma/schema.prisma`), **not TypeORM** — this corrects an assumption in `docs/ai-governance/01-PLATFORM-SCOPE.md`, which did not specify an ORM. "Entities" throughout this System Truth set means Prisma models.
- **Frontend**: React, page-directory routing under `apps/frontend/src/pages/`.
- **Auth**: Passport JWT, stateless bearer token (7-day TTL, no refresh rotation), re-fetches the user row from Postgres on every request (`jwt.strategy.ts:20-38`) so role/mall/tenant changes take effect immediately — no stale-JWT privilege window.
- **Deployment topology**: not independently re-verified this pass (out of scope for the code-only audit); see `docs/golive/PRODUCTION_INFRASTRUCTURE.md` for existing coverage.

## Cross-cutting capability inventory (verified)

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Files | PARTIAL | Referenced across Contracts/Fitout/Tickets/Tenant Portal | Static-serving guard-bypass risk flagged in `docs/readiness/SECURITY_READINESS.md:17` (P1: `/uploads` served before Nest guards) — **not independently re-verified this pass**, carried forward as an open risk, see `ARCHITECTURE_CONTRADICTIONS.md`. |
| Email | EXISTS | `notifications/email-delivery.service.ts` | Outbox-style delivery, exponential backoff, `FAILED` status persisted, not silently swallowed. |
| Outbox | EXISTS | `common/services/outbox.service.ts` | `@Cron('*/10s')`, locked via `SchedulerLockService`, exponential backoff, `FAILED` status. Only **two** call sites enqueue events platform-wide: `approvals.service.ts:252,313` and `contracts.service.ts:421`. |
| Retry Queue | PARTIAL | Outbox + EmailDelivery share the retry/backoff pattern | No generic retry-queue abstraction beyond these two consumers; SAP module implements its own separate retry/circuit-breaker (see `09-EVENT-CATALOG.md`). |
| Distributed Lock | EXISTS | `common/services/scheduler-lock.service.ts` | Redis-backed, `runExclusive`/`runAndRecord`, with a documented single-instance fallback if Redis is unavailable. Used by ~20 of ~22 scheduled jobs found. |
| Job Ledger | EXISTS | `SchedulerLockService.runAndRecord()` → `JobExecution` table | Surfaced via `GET /operations/jobs` (ADMIN/CEO only), tracks `lastStatus`/`lastErrorSummary`/`consecutiveFailures`. Strongest cross-cutting observability mechanism found. |
| Search | NOT VERIFIED | — | Out of scope for this pass. |
| Export | EXISTS | Per-module Excel/CSV exports (Billing, Parking, Service Contracts, Inventory, Reports) | No shared export service — each module implements its own; several have currency-column gaps (see `16-MULTI-CURRENCY-SEMANTICS.md`). |
| Reconciliation | PARTIAL | `sap-reconciliation.service.ts` (SAP-only) | No general cross-module reconciliation mechanism found; is manual-trigger-only, not scheduled (see `09-EVENT-CATALOG.md`, `ARCHITECTURE_CONTRADICTIONS.md`). |
| Configuration | NOT VERIFIED | Env-var based (`SAP_ENABLED`, `JWT_EXPIRES_IN`, etc.) | No centralized config-service found; out of deep scope this pass. |
| Feature Flags | PARTIAL | `SAP_ENABLED` env flag is the only confirmed example | Not a general feature-flag system. |
| Monitoring | EXISTS | `operational-metrics.service.ts` + `operational.controller.ts` | In-process, non-persistent counters (reset on restart); named-counter map used by Billing/Contracts/Proposals for specific failure metrics. `telemetry.controller.ts` logs frontend errors server-side only, not persisted. |
| Backup/Restore | NOT VERIFIED | — | Out of scope; see `docs/golive/RESTORE_DRILL.md` for existing coverage. |

## Confirmed module count

- **Backend modules: 31**, verified `ls apps/backend/src/modules` on 2026-08-21: `ai, analytics, announcements, approvals, audit-log, auth, billing, booking, branding, categories, contracts, crm, dashboard, fitout, inventory, notifications, parking, parking-dashboard, patrol, proposals, reports, sales, sap, service-contracts, slots, spaces, telemetry, tenants, tickets, users, work-orders`.
- **Frontend page directories: 31** (excluding `NotFoundPage.tsx`), verified 2026-08-20.
- **Discrepancy from `docs/ai-governance/01-PLATFORM-SCOPE.md`**: that document recorded "30" backend modules from a prior count; the correct, twice-independently-verified count is **31**. `01-PLATFORM-SCOPE.md` should be corrected to 31 (flagged, not auto-fixed — documentation-only correction, low severity).

## Major structural correction to prior governance assumptions

**There is no `Company` Prisma model.** `Mall` is a flat, ungrouped top-level entity — confirmed by schema grep. The "Mall/Company" two-tier hierarchy assumed in `docs/ai-governance/00-START-HERE.md`'s platform vocabulary and `docs/ai-erp-team/05-ERP-MASTER-DATA.md`'s master-data candidate list **does not exist in code**. What plays the "Company-level" role instead is the `[ADMIN, CEO]` role pair, which bypasses per-mall access checks entirely (`BYPASS_ROLES`, `mall-access.service.ts:9`) and is separately gated to a `MODULE_ROLES.crossMall` allow-list for the one purpose-built cross-mall view (`dashboard.controller.ts`'s `GET /dashboard/cross-mall`). See `SYSTEM_SCOPE_MAP.md` and `15-MULTI-MALL-MULTI-COMPANY.md` for full detail, and `ARCHITECTURE_CONTRADICTIONS.md` for this finding's severity.

## Open questions raised during this document's reconstruction

See `BUSINESS_CONFIRMATION_REQUIRED.md` for the full register (24 items raised across all five research streams). None block this document.
