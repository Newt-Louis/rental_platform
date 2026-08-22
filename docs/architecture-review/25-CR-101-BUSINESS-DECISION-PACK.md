# 25 — CR-101 Business Decision Pack

Audit only. No decisions made here — every item below is prepared for a human decision-maker, with concrete evidence, not a vague question.

## BC-CEO-SCOPE — concrete decision matrix

Definitive `Role.CEO` module membership, from a full grep of `apps/backend/src/common/constants/role-permissions.ts` this session (not inferred):

| Domain | Current CEO Read | Current CEO Write | Documented persona requirement (`docs/audit/02-PERSONAS-JOBS-TO-BE-DONE.md:107-110`) | Consistent? |
|---|---|---|---|---|
| Dashboard | YES | N/A (no write routes in this module) | "cross-mall" — explicitly required | ✅ Consistent |
| Reports | YES | N/A (read-only module) | "reports" — explicitly required | ✅ Consistent |
| Analytics | YES | **YES** — `upsertMallPolicy`, `requestExport`/`generateExport`/`triggerMonthlyReports`, `updateMallRetention`, `calculateRenewalRisk` are all reachable | "analytics" — required, but the doc frames CEO as executive-oversight, not operational config-writer | ⚠️ **Broader than documented** — CEO can currently write Mall policy and data-retention configuration, not just view analytics |
| CRM | **NO** (confirmed absent from `MODULE_ROLES.crm`) | NO | "deliberately excludes... crm" | ✅ Consistent |
| Booking | **NO** (absent from `MODULE_ROLES.booking`) | NO | "deliberately excludes... bookings" | ✅ Consistent |
| Proposal | **YES** — full module access (`MODULE_ROLES.proposals` includes CEO) | **YES** — all 20 `proposals.controller.ts` routes, including create/update/submit/reject | "approvals (final-tier)" — the doc implies CEO's proposal-adjacent involvement is at the *approval* step only | ❌ **Contradiction, confirmed precisely** — CEO has full CRUD on Proposals, not merely final-tier approval authority |
| Contract | **NO** (absent from `MODULE_ROLES.contracts`) | NO | Not explicitly addressed by the persona doc | ⚠️ Gap either direction — worth confirming whether CEO needs at least read access to high-value contracts |
| Billing | **NO** (absent from `MODULE_ROLES.billing`) | NO | Not explicitly addressed | Neutral — CEO sees financial data via Reports/Analytics instead |
| Fitout | **NO** (absent from `MODULE_ROLES.fitout`) | NO | "deliberately excludes... day-to-day operational detail" (Fitout is operational) | ✅ Consistent |
| Parking | **YES** — full module access (`MODULE_ROLES.parking` includes CEO) | **YES** — contract/rate creation, payment recording, all mutating `parking.controller.ts` routes | "deliberately excludes... day-to-day operational detail" | ❌ **Contradiction, confirmed precisely** — Parking is an operational domain with full CEO write access |
| Service Contracts | **NO** (absent) | NO | Not addressed | Neutral |
| Users/Admin | **NO** (`users.controller.ts` is `@Roles(Role.ADMIN)` only) | NO | "ADMIN gets everything, including system config" (implicitly excluding CEO) | ✅ Consistent |

**Also confirmed this session**: `Role.CEO` is a member of `BYPASS_ROLES` in `mall-access.service.ts`, meaning for every domain where CEO *does* have module access, that access is **entirely unrestricted by Mall** — a CEO can read/write Proposals or Parking for any Mall on the platform, not just Malls with a documented executive-oversight need.

### Options

**OPTION A — CEO global read, restricted operational write.** CEO keeps read access to Dashboard/Reports/Analytics/CrossMall/AuditLog platform-wide (matches documented intent), and Proposals/Parking become read-only for CEO (removing the currently-contradictory write access), while Analytics' config-write routes (`upsertMallPolicy`, retention settings) move to an ADMIN/MALL_DIRECTOR-only gate. Cross-Mall bypass is retained only for the confirmed-read domains.
**Consequences**: Removes a live capability (CEO can no longer create/edit Proposals or Parking contracts directly) — requires confirming no current workflow depends on this. Closes the two confirmed contradictions cleanly.

**OPTION B — CEO only documented capabilities.** CEO's module list is trimmed to exactly Dashboard, Analytics (read-only), Reports, Approvals (final-tier step only, not full Proposals CRUD), AI. Parking and full Proposals access are removed entirely.
**Consequences**: Most faithful to the persona document; largest behavior change; highest risk of breaking an undocumented-but-real workflow (e.g., if a CEO in practice does use Parking write access for a legitimate reason not captured in the persona doc).

**OPTION C — current blanket behavior, formally ratified.** Keep CEO's module list and Mall-bypass exactly as-is; update the persona document instead of the code, treating today's broader grant as the *actual* intended scope and the audit document as stale.
**Consequences**: Zero behavior change, zero regression risk — but leaves the confirmed cross-Mall exposure for Proposals/Parking in place indefinitely, and doesn't resolve why the persona doc and the code disagree (was the doc aspirational, or did the code drift from it over time — unknown either way).

**Security/operational consequences common to all options**: whichever is chosen, `MODULE_ROLES.analytics`'s CEO write access to Mall policy/retention config should be re-examined regardless — none of the three options above explicitly addresses whether that specific capability (distinct from Proposals/Parking) is intentional; flagged as its own sub-question.

**Not decided here.** This is `BC-CEO-SCOPE`, category A (must confirm before any Phase 3 batch touching CEO's role list).

## BC-009 — Spaces gap real-world exploitability

**Question**: is the confirmed Spaces authorization gap (P0-002 and the newly-found Mall-entity-level gap) exploitable in production given actual `UserMallAccess` assignment patterns?
**Resolvable technically?** No — this depends on the actual current provisioning data (are MALL_DIRECTOR/LEASING_MANAGER accounts assigned to one Mall or many in practice), which is operational data not present in the codebase.
**Recommendation carried forward unchanged**: treat as CONFIRMED-P0 for remediation prioritization regardless of the answer, since the code-level capability is exploitable by any narrowly-provisioned account and the cost of being wrong is asymmetric. **Remains BC REQUIRED**, category A, but non-blocking for starting remediation design.

## BC-013 — Reports/Analytics missing Mall enforcement

**Question**: is the absence of Mall-scoping on Reports/Analytics (unlike Dashboard, which correctly falls back to the accessible-mall-set) an intentional design choice or a regression?
**Resolvable technically?** Partially — this session adds one more data point: `Analytics` grants CEO (a documented cross-Mall-appropriate role) write access to Mall policy config, which is a *different* capability than the read-only occupancy/revenue endpoints the original P0 finding concerned. The core question (should `LEASING_MANAGER`/`MALL_DIRECTOR`/`FINANCE` — non-bypass roles present in `MODULE_ROLES.reports`/`.analytics` — see all-Mall data by default) remains a genuine policy call.
**Remains BC REQUIRED**, category A. Evidence continues to lean toward "unintentional" (no design record found defending it, a working correct-pattern sibling exists in Dashboard) but is not resolved from evidence alone.

## BC-017 — Fitout-controls/gantt/daily-report missing enforcement

**Question**: accepted risk (unguessable cuid IDs) or unnoticed regression?
**Resolvable technically?** No new evidence found this session beyond what was already documented. **Remains BC REQUIRED**, category A.

## BC-020 — Tickets tenant-isolation gap intent

**Question**: intentional simplification (frontend never exposes these to tenants) or oversight?
**Resolvable technically?** The Phase 1/2 pass already established the current frontend (`TenantPortalPage.tsx`) never calls the 3 gap endpoints — this was already known and doesn't newly resolve *intent*, only *current blast radius via the official frontend* (an API client bypassing the frontend is unaffected by this fact). **Remains BC REQUIRED**, category A.

## BC-008 — Parking-Dashboard schema-dependent blocker

**Current schema limitation**: `parkingCode` (the external MSSQL system's facility identifier) has no mapping to any internal `mallId` anywhere in the schema or codebase — confirmed absent in both the original System Truth pass and this session's resolver-registry work.
**Required relationship**: a new `parkingCode → mallId` mapping, either as a new small lookup table or a column added to an existing Mall-adjacent config table.
**Affected routes**: all 6 `parking-dashboard.controller.ts` routes.
**Affected domain**: Parking (the external gate-transaction reporting system, distinct from the internal `ParkingCustomerContract` subsystem).
**Migration implications**: additive only (a new table or nullable column) — no destructive change.
**Historical data implications**: existing transaction records in the *external* MSSQL system are untouched by this platform's schema either way; the mapping only affects how this platform's *reporting layer* attributes them to a Mall going forward.
**Safe rollout options**: populate the mapping table manually (small, finite number of physical parking facilities) before enabling any Mall-filter enforcement on these routes; until populated, routes could reasonably default to "no Mall filter, ADMIN/CEO-equivalent visibility only" as an interim state rather than blocking the feature entirely.

## BC-016 — Customer schema-dependent blocker

**Current schema limitation**: `Customer` has no `mallId` field and no direct Mall relation; the only path to a Mall is transitively via `Customer.tenantId → Tenant → active Contract → Unit → Mall`, and `tenantId` is nullable (a Customer may not yet be linked to a Tenant).
**Required relationship**: either (a) add a direct `mallId` to `Customer` (simplest, but raises the question of what Mall a not-yet-tenant-linked Customer belongs to), or (b) formally adopt the transitive `tenantId` chain as the resolver, with an explicit fallback rule for the common case where `tenantId` is still null (pre-conversion prospects).
**Affected routes**: `customers.controller.ts`'s 8 routes.
**Affected domain**: CRM.
**Migration implications**: option (a) requires a migration + backfill decision for existing rows (nullable column, default null, acceptable). Option (b) requires no migration at all.
**Historical data implications**: option (a)'s backfill would need a business rule for historical Customers with no obvious Mall (e.g., inferred from their originating Lead's `mallId`, which does exist).
**Safe rollout options**: option (b) (transitive resolution) is the lower-risk starting point since it requires zero schema change; option (a) can be revisited later if a direct field proves necessary for query performance or for prospects with no Tenant link yet.

## Summary

| Item | Class | Resolved this session? |
|---|---|---|
| BC-CEO-SCOPE | A | Concrete decision package prepared (this document); not decided |
| BC-009 | A | Recommendation reaffirmed; not resolvable from evidence alone |
| BC-013 | A | One new data point added (Analytics write-access); not resolved |
| BC-017 | A | Unchanged |
| BC-020 | A | Unchanged |
| BC-008 | A (schema) | Concrete requirement/migration/rollout package prepared |
| BC-016 | A (schema) | Concrete requirement/migration/rollout package prepared, with a recommended lower-risk option identified |
