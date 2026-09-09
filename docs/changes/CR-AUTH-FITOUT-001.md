# CR-AUTH-FITOUT-001 — Fitout dossier view capability

## CHANGE ID
CR-AUTH-FITOUT-001

## BUSINESS REASON
The basic-construction Fitout team must retrieve completed Fitout dossiers for Malls assigned to them without receiving general Tenant-management, finance, Fitout mutation, stage-transition, approval, or configuration access.

## CURRENT BEHAVIOR
The Tenant Fitout archive endpoint inherits the broad `tenants` module role gate. The platform has no `FITOUT_BASIC_TEAM` role and no action-level dossier-view module key, so a basic-construction user either cannot reach the archive or would need an excessive Tenant/Operation grant.

## EXPECTED BEHAVIOR
The repository action key `fitout-dossier-view` represents the conceptual `FITOUT_DOSSIER_VIEW` permission. `FITOUT_BASIC_TEAM` can list/search completed dossiers and open retained Fitout-submittal file versions only within assigned Malls. The role receives no `tenants`, general `fitout`, approval, mutation, stage-advance, override, or configuration permission.

## PRIMARY DOMAIN
Fitout, with authorization and authenticated Files as cross-cutting enforcement surfaces. Tenants remains a consuming staff surface only.

## AFFECTED JOURNEYS
GS-05 Contract → Fitout, GS-08 Fitout → Handover, GS-09 Cross-Mall denial.

## UPSTREAM IMPACT
Uses User.role, UserMallAccess, ModulePermission, FitoutProject → Unit Mall ownership, FitoutSubmittal terminal status, ApprovalWorkflow/Step, EntityComment, and UnifiedDocument ownership.

## DOWNSTREAM IMPACT
Authentication/JWT role serialization, admin account role selection, dynamic permission defaults, route/navigation filtering, the archive API/UI, and UnifiedDocument Fitout-submittal download authorization.

## DATA OWNERSHIP IMPACT
No business data writes. Adds one Role enum value and permission-default rows. Dossier data remains owned by Fitout/Files/Approvals.

## STATE MACHINE IMPACT
None. The new role cannot transition Fitout stages or approve/reject/publish dossiers.

## FINANCIAL IMPACT
None. The archive response explicitly excludes Tenant financial, invoice, payment, AR, revenue, bank, and payment-detail fields.

## CURRENCY IMPACT
None.

## MALL/COMPANY IMPACT
Every list, search, count, and file request derives scope from server-side UserMallAccess. Authorization scope is applied before search/count/pagination. ADMIN retains its existing bypass; FITOUT_BASIC_TEAM never bypasses Mall checks.

## TENANT IMPACT
No Tenant Portal change and no general Tenant module permission. The existing Tenant-detail archive remains available to its existing staff audience through the same action permission.

## AUTHORIZATION IMPACT
Adds Role `FITOUT_BASIC_TEAM`, action/module key `fitout-dossier-view`, handler-level authorization for the narrow Tenant archive API, a dedicated restricted Fitout dossier API/UI route, and a completed-dossier-only file capability. Direct IDs are resolved to authoritative submittal/project/unit ownership before access.

## REPORTING IMPACT
None.

## TRANSACTION IMPACT
Read-only apart from the existing successful file-download counter increment. Denied file requests must not increment it.

## EVENT/JOB IMPACT
None.

## DOCUMENT IMPACT
No copies or blobs. Historical versions remain UnifiedDocument rows and follow existing `isActive`/retention/storage policy. Storage paths and hashes are never returned by archive APIs.

## API IMPACT
The existing `GET /tenants/:id/fitout-archive` gains a narrow handler-level action gate. A dedicated `GET /tenants/fitout-archive` endpoint (served to the UI at `/fitout-dossiers`) exposes the same bounded read model across authorized Malls, optionally filtered by tenant/search/page/limit. The route name reuses the existing Tenant archive service but does not grant or return general Tenant details.

## MIGRATION
Additive PostgreSQL Role enum value `FITOUT_BASIC_TEAM`; regenerate Prisma client. No existing rows are rewritten.

## BACKWARD COMPATIBILITY
Existing roles keep current archive access. Existing dynamic module matrices require an additive `fitout-dossier-view` default row; no `tenants` or `fitout` grant is added for FITOUT_BASIC_TEAM.

## GOLDEN E2E SCENARIOS
DOSSIER-001…018 plus GS-09: Mall A user cannot infer/list/count/open Mall B data by tenant, search text, dossier/history/comment/file/version ID.

## RECONCILIATION
Compare archive attachment IDs/versions to authoritative UnifiedDocument rows; verify no new document/blob table or copied row. Verify general Tenant API and route remain denied to FITOUT_BASIC_TEAM.

## ROLLBACK
Remove the route/action defaults and role from assignable UI. PostgreSQL enum values are not safely removed in-place after assignment; production rollback should revoke the capability and leave the unused enum value.

## OPEN BUSINESS QUESTIONS
None for this gate. Business explicitly approved completed-dossier view only for authorized Malls, without general Tenant access.

---

## Severity classification
Priority P1 — Tier 1 authorization change.

## Gate results
Pending implementation and DOSSIER-001…018 verification.
