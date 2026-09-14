# CR-NAV-001 — Place CRM before the sales process in the staff sidebar

## CHANGE ID
CR-NAV-001

## BUSINESS REASON
Staff should encounter prospect management before the unit-specific sales process so the sidebar reflects the real Lead-to-Lease journey and reduces navigation recall.

## CURRENT BEHAVIOR
The staff sidebar renders `Quy trình bán hàng` before `Khách hàng tiềm năng (CRM)`, although CRM owns the prospect stage that precedes Booking.

## EXPECTED BEHAVIOR
The sidebar renders `Khách hàng tiềm năng (CRM)` immediately before `Quy trình bán hàng`. All existing groups, items, routes, labels, and permission checks remain unchanged.

## PRIMARY DOMAIN
Frontend navigation / cross-domain user experience. CRM and Core Leasing are represented but their business logic is not modified.

## AFFECTED JOURNEYS
BP-001 Lead-to-Lease; GS-01 Lead → Booking → Proposal → Contract.

## UPSTREAM IMPACT
Depends only on the existing `NAV_GROUPS` configuration and per-item `canAccessModule` filtering.

## DOWNSTREAM IMPACT
`Layout` renders the reordered groups on desktop and mobile. Route guards, pages, APIs, reports, exports, notifications, SAP, and Tenant navigation are unchanged.

## DATA OWNERSHIP IMPACT
N/A — no data read or write changes.

## STATE MACHINE IMPACT
N/A — no status or transition changes.

## FINANCIAL IMPACT
N/A — no money fields or formulas are touched.

## CURRENCY IMPACT
N/A — no currency storage, propagation, formatting, calculation, or aggregation is touched.

## MALL/COMPANY IMPACT
N/A — Mall/Company visibility and isolation are unchanged.

## TENANT IMPACT
N/A — `TENANT_NAV` is unchanged; CRM is not exposed to Tenant users.

## AUTHORIZATION IMPACT
N/A — no endpoint, query, job, role grant, route guard, or module permission is changed. Existing per-item filtering remains authoritative.

## REPORTING IMPACT
N/A — no metric or report logic changes. The Pipeline Statistics item remains in the sales-process group.

## TRANSACTION IMPACT
N/A — configuration-only frontend change with no writes.

## EVENT/JOB IMPACT
N/A — no events or jobs.

## DOCUMENT IMPACT
N/A — no generated documents or exports.

## API IMPACT
N/A — no request or response changes.

## MIGRATION
N/A — no schema or data migration.

## BACKWARD COMPATIBILITY
All paths and modules remain present and unique. Saved URLs and bookmarks continue to work.

## GOLDEN E2E SCENARIOS
GS-01 remains applicable. A focused navigation regression test verifies CRM precedes the sales process while existing coverage verifies every module remains reachable and every path remains unique.

## RECONCILIATION
Verify that the reordered configuration does not add, remove, or duplicate any navigation group/item. Financial and status reconciliation is N/A.

## ROLLBACK
Restore the previous order of the `crm` and `salesProcess` entries in `NAV_GROUPS`; no data rollback is required.

## OPEN BUSINESS QUESTIONS
None. The requested ordering is explicit and agrees with BP-001 in System Truth.

---

## Severity classification
Priority: P3 — Tier: 3 (localized, reversible frontend navigation ordering).

## Gate results
- Gate 1 — PASS: `vitest run --run src/lib/permissions.test.ts` (11/11); `npx tsc --noEmit` (0 errors).
- Gate 2 — N/A: no service, repository, or backend module change.
- Gate 3 — PASS by inspection: no cross-module contract changed.
- Gate 4 — PASS for the navigation surface of GS-01: configuration and regression test preserve the ordered CRM → Booking/Proposal/Approval/Contract entry points. Full transactional GS-01 was not rerun because no journey behavior changed.
- Gates 5–6 — N/A: no failure boundary, write, event, job, or concurrency behavior.
- Gate 7 — PASS through existing navigation coverage: role permission tables and `canAccessModule` are unchanged; all declared items still map to permitted route modules.
- Gate 8 — PASS: existing uniqueness/completeness regression confirms no path/module was dropped or duplicated.
- Gate 9 — N/A: no reporting or financial metric changed.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Requester | User | 2026-09-12 | Requested CRM above sales menu |
