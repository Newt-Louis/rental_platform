# System Truth — 11 — Role / Permission Matrix

## Roles (9, `Role` enum, `schema.prisma:12-20`)

`ADMIN, LEASING_EXECUTIVE, LEASING_MANAGER, MALL_DIRECTOR, FINANCE, LEGAL, OPERATION, TENANT, CEO`

- `ADMIN` — universal superuser; `RolesGuard` explicitly special-cases it so `@Roles(...)` metadata can never accidentally lock it out.
- `CEO` — cross-mall aggregate roles (dashboard, proposals, reports, analytics, crossMall, auditLog, parking) but not most write-heavy operational lists.
- `TENANT` — deliberately narrow allow-list (tickets, sales-own, billing-own, announcements, notifications, tenantPortal), explicitly excluded from `salesStaff`/`billingStaff` with inline comments warning of cross-tenant leak risk.
- `MALL_DIRECTOR, LEASING_MANAGER, LEASING_EXECUTIVE, FINANCE, LEGAL, OPERATION` — mall-scoped staff, further gated per-mall via `UserMallAccess`.

`RolesGuard` is a **global `APP_GUARD`**; a route with no `@Roles()` metadata is allowed to any authenticated user (default-open if undecorated, not default-closed).

## MallAccessGuard mechanics (the platform's central authorization primitive)

Also a **global `APP_GUARD`**, runs on every request. Resolves the target Mall from:
- Automatic, path-independent: `query.mallId`/`body.mallId`/`params.mallId`, `unitId`, `floorId` — checked on **any** route that happens to have these fields.
- Narrow path-heuristics: `contractId` (only if path contains "contract"), `fitoutProjectId` (only via `query.projectId`/`body.projectId` or path matching `^/fitout(?:/|$)` with `params.id`), `fitoutSubmittalId`/`fitoutIssueId` (only if path contains those literal substrings), `invoiceId` (only if path contains `/invoices/`) — **all require `resourceId = params.id`; any route whose id param has a different name never populates it.**
- `MallAccessService.extractAndValidateMallAccess()` supports more resource types (payment, invoiceAdjustment, booking, slot, slotBooking, slotPricingRule, proposal, approvalStep/Workflow, tenant, ticket, maintenanceSchedule) — but **only when a controller explicitly calls it**; the global guard itself never populates these.
- **Bypass roles**: `[ADMIN, CEO, TENANT]` skip all Mall checks (TENANT bypasses deliberately — isolation is enforced via `tenantId` at the service layer instead, verified consistently kept, see `15-MULTI-MALL-MULTI-COMPANY.md`).
- **Fails open**: if no Mall ID resolves from any source, the check is silently skipped, not denied (`mall-access.service.ts:262-264`).

## Coverage sweep result (full detail in `15-MULTI-MALL-MULTI-COMPANY.md`)

| Verdict | Controllers |
|---|---|
| OK — explicit per-route enforcement | billing, tickets, patrol, service-contracts, tenants, proposals, contracts, work-orders, inventory, categories, booking, crm(leads), approvals, fitout(base), fitout-submittal, slots |
| OK — service internally applies scoping | dashboard |
| OK — bypass-role-only or global-taxonomy, no scoping needed | audit-log, branding, categories(base) |
| **GAP — confirmed** | analytics, reports, spaces(units), sales, parking-dashboard, fitout-controls, fitout-gantt (mutate/delete), fitout-daily-report (`:entryId/photos`), ai (chat context), crm/customers, crm `getUnifiedDeals` |

## Per-module permission highlights

- **Approvals** — role-gating enforced at BOTH controller (`@Roles`) and service layer (`step.approverRole`/`step.approverId` checks), with ADMIN as an explicit bypass repeated at both layers. Genuine defense-in-depth, best example in the platform.
- **Tickets** — TENANT is a valid caller for the whole module role-list, which is why the `escalations`/`rate`/`rating`/SLA-policy gaps are exploitable specifically by tenant accounts, not just staff.
- **CRM Customers** — no `mallId` field on the model at all; module role list (`ADMIN, LEASING_MANAGER, LEASING_EXECUTIVE, MALL_DIRECTOR`) is entirely mall-scoped roles, yet the resource itself has no mall boundary — open question, see `BUSINESS_CONFIRMATION_REQUIRED.md`.
- **Analytics `GET /analytics/multi-mall`** — grants materially the same cross-mall aggregate capability as `MODULE_ROLES.crossMall = [ADMIN, CEO]` but is gated by the much broader `MODULE_ROLES.analytics` (includes `LEASING_MANAGER`) — an inconsistency between two places the same capability exists.

## Audit Log coverage
Global interceptor, captures write methods only (POST/PUT/PATCH/DELETE), explicitly skips `/api/auth/`, `/api/health`, `/api/notifications`, `/api/ai/chat` — **login/logout/failed-login events are structurally invisible to the audit trail**. Write failures are swallowed (best-effort, not transactional with the underlying action). Redacts sensitive keys via regex before storage. `GET /audit-logs` restricted to ADMIN/CEO.

## Tenant Portal boundary verification
Confirmed consistent and correct on every traced endpoint (Tickets core CRUD, Billing/Invoices, Sales) — server always forces `currentUser.tenantId`, never trusts a client-supplied value. Only violated on the 3 Tickets endpoints noted in `06-BUSINESS-INVARIANTS.md` INV-006.

## Endpoints found with no explicit authorization guard beyond role
See the GAP list above — none of these are missing `RolesGuard`/`JwtAuthGuard` entirely (both are global), so authentication and coarse role-gating always apply. The gap in every case is specifically **Mall-scoping**, not authentication.

## Status update — CR-101 Phase 3G readiness review (2026-08-22)
This document predates CR-101 Phases 3A-3F. Two items in the "Coverage sweep result" GAP row above are now stale: **`spaces(units)`** was closed in Phase 3B (`updateUnit`/`updateUnitStatus` now `ENFORCED`), and **`ai (chat context)`** was closed in Phase 3D (`AiRequestContext` threaded through `chat`/`chatStream`/`getSuggestions`/floor-plan routes). `analytics`, `reports`, `sales`, `parking-dashboard`, `crm/customers`, and `crm getUnifiedDeals` remain confirmed-open as of a fresh code read this session. Full current-state detail: `docs/architecture-review/32-CR-101-CROSS-MALL-POLICY-READINESS.md`.

Also newly evidenced this session, not in this document's original CEO summary line (line 8 above): CEO's "cross-mall aggregate roles" list is broader in practice than a clean aggregate-only set — CEO currently has full operational write access to **Parking**, **Work Orders**, and **Proposals** (not just the listed aggregate/read-oriented modules), a confirmed contradiction with the documented CEO persona. See `docs/architecture-review/33-CR-101-CEO-CAPABILITY-MATRIX.md` for the full breakdown; not corrected in the line above per this program's convention of appending rather than silently rewriting prior findings.
