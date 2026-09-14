# CR-AUTH-FITOUT-PERMISSIONS-002 — Enforce the Fitout permission matrix

## CHANGE ID
CR-AUTH-FITOUT-PERMISSIONS-002

## BUSINESS REASON
Administrators must be able to grant or revoke Fitout module access from `/admin?section=permissions`, with the same decision enforced by navigation, routes, and backend APIs.

## CURRENT BEHAVIOR
The Fitout controllers declare a dynamic class-level module permission, but several handlers replace it with static `@Roles(...)` metadata. Those handlers bypass the database-backed matrix. The frontend permission store also updates outside the components that make route/navigation decisions, so a newly loaded matrix is not guaranteed to repaint those surfaces immediately.

## EXPECTED BEHAVIOR
The live Fitout matrix is the outer module-access gate. Explicit endpoint role limits remain a stricter inner gate and cannot be widened by the matrix. Existing Tenant-only Fitout capabilities remain explicit exceptions and continue to enforce tenant ownership. The selected Mall's matrix is evaluated against the authoritative Fitout resource Mall when the route identifies a project or submittal, or the authenticated active Mall when the endpoint is global/configuration-shaped.

## PRIMARY DOMAIN
Fitout, with Authorization as a cross-cutting enforcement surface.

## AFFECTED JOURNEYS
BP-003 Contract-to-Fitout-to-Handover; GS-05 Contract → Fitout; GS-09 Cross-Mall denial; GS-10 Tenant isolation.

## UPSTREAM IMPACT
Depends on authenticated `User.role`, `UserMallAccess`, `ModulePermission`, selected Mall context, and authoritative FitoutProject/FitoutSubmittal → Unit → Mall ownership.

## DOWNSTREAM IMPACT
Fitout navigation/route visibility, Fitout and FitoutSubmittal controllers, the global role/Mall guard ordering, and admin permission-matrix propagation. Contracts, approvals, files, and Spaces remain consumers checked for unchanged access/state behavior.

## DATA OWNERSHIP IMPACT
No business entity writes are added or changed. Existing `ModulePermission` writes remain owned by Permissions/Admin.

## STATE MACHINE IMPACT
None. Fitout and submittal transitions are unchanged.

## FINANCIAL IMPACT
None.

## CURRENCY IMPACT
None.

## MALL/COMPANY IMPACT
Mall-specific Fitout permission decisions must use the authoritative resource Mall. Existing Mall A/Mall B isolation remains mandatory and is checked before controller business logic.

## TENANT IMPACT
Tenant access remains limited to the Fitout handlers that already opt in to `Role.TENANT`, followed by existing tenantId ownership checks. The admin staff matrix must neither grant broad Tenant access nor revoke these explicit portal capabilities accidentally.

## AUTHORIZATION IMPACT
Dynamic module permission and endpoint-specific role metadata are composed instead of one silently replacing the other. ADMIN retains the existing super-admin bypass. Denied reads and writes must not reach controller/service business logic.

## REPORTING IMPACT
None.

## TRANSACTION IMPACT
None. Permission denial occurs before business transactions begin.

## EVENT/JOB IMPACT
None.

## DOCUMENT IMPACT
No file content or storage behavior changes. Existing project/submittal ownership checks remain authoritative for document access.

## API IMPACT
No request or response schema changes. Authorization results change only where the configured Fitout matrix was previously bypassed.

## MIGRATION
None.

## BACKWARD COMPATIBILITY
Static module roles remain the fallback when no database configuration exists. Existing explicit Tenant Fitout endpoints remain available. Endpoint-specific staff restrictions remain ceilings.

## GOLDEN E2E SCENARIOS
GS-05, GS-09, and GS-10. Add deterministic guard/controller tests for grant, revoke, Mall-specific scope, Tenant exception, endpoint ceiling, and zero controller side effects on denial.

## RECONCILIATION
For the same role/Mall, compare admin matrix, effective-modules response, frontend route visibility, and backend Fitout API decision. All four must agree.

## ROLLBACK
Revert the decorator/guard composition, Fitout handler metadata, frontend subscription, and guard-order changes. No data rollback is required.

## OPEN BUSINESS QUESTIONS
None. The existing admin copy and permission service define this matrix as live module access; endpoint-specific restrictions and Tenant ownership remain independently authoritative.

---

## Severity classification
Priority P1 — Tier 1 authorization correction.

## Gate results
Gate 1 PASS: backend and frontend typecheck. Gate 2 PASS: Fitout plus authorization targeted suites. Gate 4 PASS at automated regression level for GS-05; browser UAT not run in this change. Gate 7 PASS: revoke, role ceiling, Tenant exception, authoritative Mall hand-off, and existing Mall/Tenant isolation tests. Full backend PASS (150 suites, 1449 tests). Full frontend retains exactly the accepted baseline 9 failures (5 Service Contract, 4 Work Order, all missing Router wrappers); no new failure.

## Commit gate — configured-empty vs unconfigured
Two authorization semantics are separated deliberately, because both are reachable from
`/admin?section=permissions` and only one of them may fall back to the static table.

**PERM-FITOUT-EMPTY-001 — configuration exists for role+Mall, Fitout revoked/empty.**
`PermissionsService.getAllowedRoles()` tracks `configuredKeys` independently of allowed
rows, so a Mall tier that exists with zero allowed roles returns an empty `Set`, not
`null`. `RolesGuard` branches on `if (dynamic)`, so an empty `Set` is still a decision:
the role is absent, `ForbiddenException` is thrown, and the static `requiredRoles`
fallback below is never reached. The frontend mirrors this — `usePermissionsStore`
holds an empty `Set` (truthy), so `canAccessModule()` returns `dynamic.has(module)`
without consulting `ROUTE_PERMISSIONS`. Navigation hides the entry and `RoleRoute`
renders `ForbiddenPage`. Static fallback cannot restore access on either side.

**PERM-FITOUT-NOCONFIG-002 — no configuration at any tier.**
`getAllowedRoles()` returns `null` only when neither the Mall tier nor the GLOBAL tier
has any row. `RolesGuard` then falls through to the static roles baked into
`@ModuleRoles` at decoration time, and the store's `null` sends `canAccessModule()` to
`ROUTE_PERMISSIONS`. This is the documented fallback: an unseeded or unreachable
configuration preserves today's behavior instead of failing open or denying everything.

Verified at service, guard, decorator, and frontend route level — see
`permissions.service.spec.ts`, `roles.guard.spec.ts`, `permissions.test.ts`, and
`RoleRoute.test.tsx`.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Engineering | Codex | 2026-09-09 | Implementation requested; release decision pending verification |
