# System Truth — 15 — Multi-Mall / Multi-Company

> Current-state correction (2026-08-24): CR-101 Phase 3G closed the broad Reports/Analytics read gaps described in this reconstruction by resolving explicit/accessible Mall scopes through `MallAccessService`. Analytics Compliance export list/request/generate/manual-monthly remains a narrower open gap. See `docs/golden/AUTHORIZATION-AUDIT.md` Wave 5 for current evidence.

## Structural correction

**There is no "Multi-Company" model.** No `Company` Prisma entity exists; `Mall` is flat and ungrouped. This document covers Multi-Mall only. See `00-SYSTEM-OVERVIEW.md` and `SYSTEM_SCOPE_MAP.md`.

## Isolation model as implemented

- Staff access to a Mall is granted via `UserMallAccess { userId, mallId, isActive }` — a join table, not a field on `User`.
- `MallAccessGuard` is a **global `APP_GUARD`** (runs on every request), a structural improvement over what a prior incident (per project memory: cross-tenant leaks "root-caused to MallAccessGuard") implies was a per-route/opt-in guard previously. This closes the "guard forgotten on a controller" failure mode.
- **A new, narrower failure mode replaces it**: the global guard's resource-type inference is heuristic — only recognizes specific param/query/body field names (`mallId`, `unitId`, `floorId`) or narrow path-substring patterns (`contract`, `fitout`, `invoices`), and always requires `resourceId = params.id` specifically for the path-heuristic branches. `MallAccessService.extractAndValidateMallAccess()` additionally **fails open**: if no Mall ID resolves, the check is silently skipped rather than denied.

## Confirmed gaps (ranked by severity)

1. **Spaces — Units** (`spaces.controller.ts`): no mall check on any `/spaces/units/:id*` route (get/update/status/delete/media/history/map-position) — the id param is named `id`, which the automatic extraction doesn't map to a unit lookup, and the controller adds no compensating check. `getUnits`/`getFloors`/`getZones` list endpoints also don't intersect with the caller's accessible-mall-set when `mallId` is omitted. **P0** — full CRUD exposure across Malls for MALL_DIRECTOR/LEASING_MANAGER/OPERATION/FINANCE/LEGAL roles.
2. **Analytics + Reports controllers**: no `MallAccessService` usage at all; omitting `mallId` returns unfiltered all-mall data (no fallback to accessible-mall-set, unlike Dashboard). `GET /analytics/multi-mall` in particular grants the same capability as the CEO/ADMIN-only cross-mall dashboard to the broader `MODULE_ROLES.analytics` role list. **P0** — direct financial/occupancy data exposure across Malls.
3. **Fitout-controls controller** (`fitouts/:projectId/controls/...`): `projectId` param name never matches the guard's heuristics; zero `MallAccessService` calls in the controller. Risks/change-orders across any Mall are readable/writable by any `fitout`-role staff member. **P1.**
4. **Fitout-gantt mutate/delete routes** (`PATCH/DELETE /fitout-tasks/:id`): `id` here refers to the task, not the project; the guard's `fitoutProjectId` heuristic doesn't fire. **P1.**
5. **Fitout-daily-report photo routes** (`:entryId/photos`): same class of gap. **P2** (narrower blast radius — photos only).
6. **Sales module**: no `mallId` filtering anywhere for internal (non-TENANT) roles; `findAll`/`getSummary`/`getTopTenants`/`getDeadlineStatus` return all-mall data. **P1** — tenant revenue data exposure across Malls.
7. **Parking-Dashboard**: no mall check on the `parkingCode` param at all (only a module-role gate) — any `parking`-role user can query any facility's gate-transaction financial data regardless of Mall assignment. **P1.**
8. **AI chat context** (`AiService.buildContext()`): unscoped by mall, unlike Dashboard. **P2** (read-only, conversational surface, but exposes the same underlying revenue/occupancy figures).
9. **CRM `getUnifiedDeals`/Customers**: no DB-level mall filter (`getUnifiedDeals` only post-filters in-memory if the caller happens to pass a mallId); `CustomersController` has zero mall scoping at all, and `Customer` has no `mallId` field on the model — this last point may be by design (see `BUSINESS_CONFIRMATION_REQUIRED.md`). **P1** for `getUnifiedDeals` (confirmed gap in a model that does have `mallId`); **UNKNOWN** for Customers.

## Correctly-scoped positive examples

- **Dashboard** — `DashboardService` internally calls `MallAccessService`, correctly falls back to the caller's accessible-mall-set when `mallId` is omitted.
- **Announcements** — correctly restricts Tenant-role viewers to malls where they have an active Unit.
- **Billing, Tickets, Patrol, Service-Contracts, Tenants, Contracts, Proposals, Work-Orders, Inventory, Booking, Approvals, Slots, Fitout (base + submittal)** — all consistently apply explicit per-route `MallAccessService` calls.

## Cross-Mall capability (the one legitimate portfolio-wide view)

- `MODULE_ROLES.crossMall = [ADMIN, CEO]`, used only at `GET /dashboard/cross-mall`.
- **Inconsistency**: the same effective capability exists, ungated to this same allow-list, via Analytics/Reports (see gaps #2 above) — meaning the platform has one deliberately-designed cross-Mall view and several accidental ones.

## Assessment

The global `MallAccessGuard` closed the specific historical failure mode (guard entirely absent from a controller) but the platform still has a **structurally identical class of gap** today, caused by the guard's heuristic, param-name-dependent resource resolution rather than a fail-closed, explicitly-declared-per-route scoping requirement. This is logged as the platform's top architecture contradiction — see `ARCHITECTURE_CONTRADICTIONS.md` `CONTRA-008`.
