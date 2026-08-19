# UX Restructure — Decision Log

Architecture/UX decisions made during Option B implementation. Trivial code
choices are not logged here — only decisions with real alternatives.

---

## DECISION-001 — Fix FR-01 by removing TENANT from frontend `fitout` route, not by adding TENANT to backend

**Problem:** Audit flagged `ROUTE_PERMISSIONS.fitout` (frontend) granting TENANT
access to `/fitout` while `MODULE_ROLES.fitout` (backend) did not. On
re-verification during implementation, the real picture was more specific:
`fitout.controller.ts` grants `Role.TENANT` on exactly 2 endpoints (project
list/detail), while 5 sub-resource controllers (submittal, issue, gantt,
daily-report, controls) grant only `MODULE_ROLES.fitout` (no TENANT). No sidebar
item, `ErpProcessGuide` step, or in-app link ever points a tenant at `/fitout`
(`TENANT_NAV` excludes it, `ErpProcessGuide` is hidden entirely for
`isTenant`) — so this wasn't a clicked-from-the-UI dead link, but a
directly-reachable route (via typed URL/bookmark) that would 403 partway
through as soon as the tenant switched to any tab beyond the overview.

**Options:**
- A. Add `Role.TENANT` to the 5 backend sub-resource controllers to make the
  standalone `/fitout` page fully work for tenants.
- B. Remove `TENANT` from the frontend `fitout` route module, since Tenant
  Portal already has its own working embedded Fitout tab covering the same
  information a tenant needs.
- C. Leave as-is and only fix the sub-resource 403s reactively if reported.

**Selected:** B.

**Reason:** Tenant Portal's embedded Fitout tab (`TenantPortalPage.tsx`,
`fitoutApi.listFitouts`/`listStageConfigs`) already gives tenants an
appropriate, tenant-scoped view of their fitout status — building out full
tenant access to the internal project-management surface (submittals, issues,
risk register, contractor management) would expose operational detail tenants
don't need and isn't asked for anywhere in the product. Option B is also the
lowest-risk fix: frontend-only, no backend/API change, no DB migration, and
removes zero functionality a tenant could previously reach through the UI
(there was never a click path to `/fitout` for a tenant).

**Impact:** `apps/frontend/src/lib/permissions.ts` (`fitout` route no longer
includes `TENANT`), `apps/frontend/src/lib/permissions.test.ts` (updated
assertion). Backend untouched.

**Rollback:** Revert the one-line permissions.ts change; no data or API impact
to unwind.

---

## DECISION-002 — Task/Notification split computed client-side from the existing list fetch, not a new backend endpoint

**Problem:** FR-07 requires splitting the notification feed into "Việc cần làm"
(Task) and "Thông báo" (Notification) tabs. The header bell's unread count
today comes from a single backend aggregate (`notificationsApi.getUnreadCount`,
`GET /notifications/unread-count` presumably), not from the list itself.

**Options:**
- A. Add a backend `category` field or a second unread-count endpoint
  (`?category=task`) so the header bell can show two separate live badges.
- B. Classify client-side, using a static `type → category` map, applied to
  the notification list already being fetched (capped at 50, most-recent-first
  — same dataset the panel already renders); keep the header bell as one
  combined count (no change to `Layout.tsx`'s bell); show two per-tab unread
  counts *inside* the panel, computed from the already-loaded list.

**Selected:** B.

**Reason:** Section 30 of the implementation brief explicitly says not to
change API contracts unless necessary. A2/A-style backend change is not
necessary to deliver the actual user-facing capability asked for (being able
to see "things I must do" separately from "things I should know" inside the
panel) — the classification only needs to happen wherever the list is already
rendered. The header bell showing one combined number is an acceptable, minor
simplification: it still tells the user *something* is waiting, and opening
the panel immediately shows the task/notification breakdown.

**Impact:** New `apps/frontend/src/lib/notification-classification.ts` (pure
function, no API/schema change). `NotificationCenter.tsx` gains two tabs.
`Layout.tsx` bell badge unchanged.

**Rollback:** Revert `NotificationCenter.tsx`; delete the classification file.
No data model impact.

---

## DECISION-003 — Sidebar "Vận hành" (Operations) regroup: 3 task clusters + move Service Contracts to Tài chính

**Problem:** `NAV_GROUPS.operations` bundles 7 functionally unrelated items
(Hợp đồng dịch vụ, Kho vận hành, Điều phối công việc, Tuần tra an ninh, Vận
hành bãi xe, Fitout, Ticket) under one flat technical-module list, while a
separate `parkingCentral` group fragments Parking reporting/transactions away
from the main Parking item (FR-03). Persona research (audit
02-PERSONAS-JOBS-TO-BE-DONE, Persona E) found the `OPERATION` role covers
several genuinely unrelated day-to-day jobs (fitout coordinator, ticket
dispatcher, patrol guard) that all see the same 7-item flat list regardless
of which job they actually do.

**Options:**
- A. Leave `operations` as one flat group, only fix the Parking split (merge
  `parkingCentral` in) — minimal, quick-win-only change.
- B. Split into 3 task clusters as specified in `docs/redesign/navigation.md`
  (Thi công & Bàn giao / Xử lý sự cố & Bảo trì / An ninh & Bãi đỗ xe), and
  find a new home for the two items that don't fit those 3 clusters
  (`service-contracts`, `inventory`).
- C. Introduce new sub-role permissions so each Operation sub-job only sees
  its own cluster (full RBAC change).

**Selected:** B, with `service-contracts` moved into the `finance` group
(vendor/service contracts are a financial-obligation surface — its role
grant already includes FINANCE/LEGAL/CEO/MALL_DIRECTOR alongside OPERATION,
so Finance is a defensible primary home) and `inventory` folded into the new
"Xử lý sự cố & Bảo trì" cluster alongside Tickets and Work Orders (inventory
in this system is operational supplies/spare-parts tracking, which is what
work-order/ticket resolution consumes — a real task adjacency, not just a
leftover bucket).

**Reason:** C is explicitly out of scope for Option B (see FR-10 in the
friction report — flagged as strategic/P1, requires either new permission
granularity or a personal nav-pin preference, neither of which this wave
implements). A only fixes the Parking fragmentation and leaves the larger
"7 unrelated things in one list" problem — the audit's actual top navigation
finding (FR-12) — unaddressed. B directly implements the already-approved
redesign spec and requires zero RBAC/permission changes: every item's
`ROUTE_PERMISSIONS`/`MODULE_ROLES` grant is untouched, only which labeled
group it's rendered under changes.

**Impact:** `apps/frontend/src/lib/permissions.ts` `NAV_GROUPS` — no route
paths, modules, or role grants change, only grouping/labels. No route is
removed (existing rule: "Không xóa route cũ ngay nếu ảnh hưởng backward
compatibility" — moot here since no route path changes at all, only which
sidebar section renders the link).

**Rollback:** Revert `NAV_GROUPS` to the prior 8-group structure; no data or
permission impact to unwind.

---

## DECISION-004 — Contract→Fitout/Billing handoff is a visibility fix, not new automation (audit finding corrected against live code)

**Problem:** `docs/audit/11-INFORMATION-FLOW.md` and the roadmap both name
"Contract active but no Fitout/Billing started" as a real gap requiring a new
action item / manual trigger. Reading `FitoutService.handleContractActivated`
and `ContractsService.updateStatus` during Wave 4 implementation shows both
handoffs are already fully automated (event-driven fitout project creation,
unconditional billing schedule build on ACTIVE status) — the audit's premise
was wrong.

**Options:**
- A. Implement the audit's original ask literally: add a dashboard/task-list
  action item for "contract active, no fitout/billing yet," on the assumption
  the automation is missing or unreliable.
- B. Verify the automation first (found it works), then narrow the fix to
  what's actually missing: visibility on the Contract detail screen.

**Selected:** B. Per the implementation brief's own rule ("Code runtime
behavior là evidence thực tế... phải ghi lại discrepancy"), building a new
automation path for something that already works would have been redundant
and risked introducing a second, competing trigger for the same side effect
(e.g., a dashboard "fix it" action button that calls
`buildScheduleForContract` again, racing the automatic call already firing
inside `updateStatus`).

**Impact:** Documented here and in `UX_RESTRUCTURE_LOG.md` Wave 4. No dashboard
action item was added for this case (unlike the genuinely-missing
`openFitoutSlaBreaches` counter added in Wave 2) — the fix is a passive status
strip on the Contract detail view instead.

**Rollback:** N/A — this is a scope-correction decision, not a code change to
revert.

---
