# 03 — Mall Authorization Architecture Review

## Architecture, not per-controller patches

`MallAccessGuard` (`apps/backend/src/common/guards/mall-access.guard.ts`) is registered as a **global `APP_GUARD`** (`app.module.ts`), running on every authenticated request. It delegates resolution to `MallAccessService.extractAndValidateMallAccess()` (`common/services/mall-access.service.ts:51-266`, re-read in full this session).

**How scope is enforced today — re-verified this session**: **E — inconsistently**, but not randomly inconsistent; it follows a precise, reproducible rule:

1. The global guard automatically extracts `mallId`/`unitId`/`floorId` from `query`/`body`/`params` **by exact field name**, and separately attempts `contractId`/`fitoutProjectId`/`fitoutSubmittalId`/`fitoutIssueId`/`invoiceId` **only** when `params.id` is set **and** the request path contains a matching substring (`mall-access.guard.ts:30-40`).
2. `MallAccessService` additionally supports resolving Mall from `paymentId, invoiceAdjustmentId, bookingId, slotId, slotBookingId, slotPricingRuleId, proposalId, approvalStepId, approvalWorkflowId, tenantId, ticketId, maintenanceScheduleId` (`mall-access.service.ts:54-75`) — **but only when a controller explicitly passes one of these keys**; the global guard itself never populates them.
3. If **none** of the above resolves a `mallId`, the check is **silently skipped** — `mall-access.service.ts:262`: `if (mallId) { await this.assertMallAccess(...) }`, no `else` branch. This is a **fail-open** design for the "could not resolve" case, contrasted with a **fail-closed** design for the "resolved an entity but it has no mall" case (Invoice/Payment/InvoiceAdjustment explicitly throw `ForbiddenException` in that specific sub-case, lines 140-143, 163-166, 182 — re-confirmed this session).

**Conclusion**: Mall scope is enforced **B — per controller, but only where a developer explicitly added it**, with a fail-open global fallback that silently produces a no-op check rather than a denial whenever a route's identifying parameter isn't one the guard recognizes by name. This is architecturally a hybrid of B (per-controller) and D (per-query, for the ~20 explicit call sites) with a fail-open gap where neither is present.

## MALL_AUTHORIZATION_COVERAGE_MATRIX

`ENFORCED` = explicit, verified scoping. `PARTIAL` = scoping exists but has a gap (e.g. optional/unenforced filter). `MISSING` = confirmed no scoping. `N/A` = no Mall concept applies. `UNKNOWN` = not independently re-verified this session (carried from the System Truth pass without fresh confirmation).

| Domain | READ | CREATE | UPDATE | DELETE | APPROVE | EXPORT | DOCUMENT ACCESS | BACKGROUND JOB |
|---|---|---|---|---|---|---|---|---|
| CRM (Lead) | PARTIAL (`getUnifiedDeals` in-memory-only) | ENFORCED | ENFORCED | N/A | N/A | UNKNOWN | N/A | N/A |
| CRM (Customer) | MISSING (no `mallId` field on model) | MISSING | MISSING | MISSING | N/A | UNKNOWN | N/A | N/A |
| Booking | ENFORCED | ENFORCED | ENFORCED | N/A | N/A | UNKNOWN | N/A | ENFORCED (locked scheduler) |
| Proposals | ENFORCED | ENFORCED | ENFORCED | N/A | N/A | UNKNOWN | N/A | N/A |
| Approvals | ENFORCED | N/A | ENFORCED (approve/reject) | N/A | ENFORCED (role+ownership, best example) | N/A | N/A | N/A |
| Contracts | ENFORCED | ENFORCED | ENFORCED | N/A | N/A | UNKNOWN | ENFORCED (tenant-scoped via `ContractFile`) | ENFORCED (locked scheduler) |
| Billing | ENFORCED (`mallIds` threaded into `where`, re-confirmed) | ENFORCED | ENFORCED | N/A | N/A | PARTIAL (currency, not Mall — see `04-`) | ENFORCED (tenant-scoped, see `02-`) | ENFORCED (locked, per-item isolated) |
| Service Contracts | ENFORCED | ENFORCED | ENFORCED | N/A | N/A | UNKNOWN | ENFORCED (role-only, appropriate) | ENFORCED (locked) |
| Parking | ENFORCED | ENFORCED | ENFORCED | N/A | N/A | UNKNOWN | ENFORCED (role-only) | PARTIAL (locked, but no per-item isolation) |
| Parking-Dashboard | **MISSING** (only `parkingCode`, no mallId mapping) | N/A | N/A | N/A | N/A | UNKNOWN | N/A | N/A |
| Sales | **MISSING** (no `mallId` filter for internal roles) | UNKNOWN | UNKNOWN | N/A | ENFORCED (own-tenant, for TENANT role) | UNKNOWN | N/A | N/A |
| Slots | ENFORCED | ENFORCED | ENFORCED | ENFORCED | N/A | UNKNOWN | N/A | N/A |
| Spaces (Mall/Floor/Zone) | UNKNOWN (not re-verified; System Truth found no gap here specifically) | UNKNOWN | UNKNOWN | UNKNOWN | N/A | UNKNOWN | N/A | N/A |
| **Spaces (Unit)** | **MISSING — re-confirmed this session, see `01-P0-VERIFICATION.md` P0-002** | ENFORCED (mall required at create) | **MISSING** | **MISSING** | N/A | UNKNOWN | ENFORCED (`unit-media` is intentionally public, see `02-`) | N/A |
| Fitout (base) | ENFORCED | ENFORCED (event-driven) | ENFORCED | N/A | ENFORCED (via Approvals) | UNKNOWN | ENFORCED at the `FitoutDocument` retrieval layer (tenant/role); **PARTIAL at Mall level** (`AUTH-01`, see `02-`) | ENFORCED (locked) |
| Fitout-controls (risks/change-orders) | **MISSING** (`:projectId` param unmatched by guard) | **MISSING** | **MISSING** | N/A | **MISSING** (`decide`) | N/A | N/A | N/A |
| Fitout-gantt | ENFORCED for list/create (`query.projectId`/`body.projectId` matched) | ENFORCED | **MISSING** (`:id` = task, not project) | **MISSING** | N/A | N/A | N/A | ENFORCED (locked) |
| Fitout-daily-report | ENFORCED for list/create | ENFORCED | N/A | N/A | N/A | N/A | **MISSING** (`:entryId/photos`) | N/A |
| Work Orders | ENFORCED | ENFORCED | ENFORCED | N/A | ENFORCED (review) | ENFORCED | ENFORCED (role-only) | ENFORCED (locked) |
| Tickets | ENFORCED (core CRUD) | ENFORCED | ENFORCED | N/A | N/A | UNKNOWN | ENFORCED (tenant-scoped) | ENFORCED (locked) |
| Patrol | ENFORCED | ENFORCED | ENFORCED | N/A | N/A | UNKNOWN | ENFORCED (role-only) | ENFORCED (locked) |
| Inventory | ENFORCED | ENFORCED | ENFORCED | ENFORCED | N/A | UNKNOWN | N/A | N/A |
| Tenants | ENFORCED | ENFORCED | ENFORCED | N/A | N/A | UNKNOWN | N/A | N/A |
| Dashboard | ENFORCED (service-internal, correctly falls back to accessible-mall-set) | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| **Reports** | **MISSING — re-confirmed this session (zero `MallAccessService`/`CurrentUser` references in `reports.controller.ts`)** | N/A | N/A | N/A | N/A | **MISSING** | N/A | N/A |
| **Analytics** | **MISSING — re-confirmed this session (zero `MallAccessService` references; one `@CurrentUser()` injected but unused for scoping)** | N/A | N/A | N/A | N/A | **MISSING** | N/A | PARTIAL (locked, but no Mall filter on occupancy-snapshot/renewal-risk batch scope) |
| **AI** | **MISSING — re-confirmed this session (zero `MallAccessService` references in `ai.controller.ts`)** | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| SAP | ENFORCED at trigger (not independently re-verified this session) | N/A | N/A | N/A | N/A | UNKNOWN | N/A | N/A (manual-trigger only, see `06-`) |
| Auth / Users | N/A (identity/global) | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| Categories | N/A (base, global) / ENFORCED (`CategoryMallPricing`) | N/A / ENFORCED | N/A / ENFORCED | N/A / ENFORCED | N/A | N/A | N/A | N/A |
| Audit Log | N/A (ADMIN/CEO only, bypass roles) | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| Announcements | ENFORCED (positive example — Tenant restricted to malls with an active Unit) | ENFORCED | ENFORCED | ENFORCED | N/A | N/A | N/A | N/A |

## BC-009 investigation — is the Spaces gap exploitable given real `UserMallAccess` assignment patterns?

**Not resolvable from code alone.** Whether MALL_DIRECTOR/LEASING_MANAGER accounts in the actual user base are provisioned with narrow (single-Mall) or broad (multi-Mall or effectively-all-Mall) `UserMallAccess` grants is operational/HR data, not something derivable from the application code or schema. **Classification: BUSINESS-CONFIRMATION-REQUIRED, category A** (see `07-BUSINESS-CONFIRMATION-TRIAGE.md`) — however, the code-level fact stands regardless of the answer: the *capability* to exploit this gap exists for any account provisioned narrowly, and multi-Mall operators (a real, confirmed use case — Dashboard's cross-Mall view and multiple malls in the schema) make narrow provisioning plausible by default, not an edge case. **Recommendation: treat as CONFIRMED-P0 for remediation prioritization regardless of BC-009's answer** — the fix (structural Mall-scoping) is the same either way, and the cost of being wrong (assuming it's dormant when it isn't) is asymmetric.

## BC-013 investigation — is Reports/Analytics' missing Mall enforcement an intentional design choice?

**Partially resolvable from code.** Evidence against intentionality: (a) `Dashboard` — functionally the closest sibling to Reports/Analytics — correctly implements the accessible-mall-set fallback, showing the pattern was known and available; (b) `MODULE_ROLES.crossMall = [ADMIN, CEO]` exists specifically to gate the one deliberately cross-Mall view, and Analytics'/Reports' role lists include `LEASING_MANAGER`/`MALL_DIRECTOR`/`FINANCE`/`LEGAL` — roles never granted `crossMall` elsewhere in the codebase; (c) no code comment, ADR, or doc anywhere in `docs/program/`, `docs/audit/`, `docs/readiness/` was found asserting this is intentional. **This pattern (a working example exists next door, the broader role list contradicts the one place cross-Mall is deliberately gated, and no design record defends the gap) is the same shape as every other confirmed-not-intentional gap in this review.** **Classification: BUSINESS-CONFIRMATION-REQUIRED, category A** for final sign-off, but the code evidence leans strongly toward "unintentional regression," not "accepted design" — flag this lean explicitly to whoever confirms BC-013 rather than presenting it as a neutral open question.

## Cross-cutting observation

Every confirmed MISSING cell above shares the identical root cause: **the global guard's resource-resolution is a fixed, hardcoded list of field names and path substrings, not an extensible or fail-closed contract.** Adding Mall-scoping to any of the specific gaps above as an isolated patch would not prevent the next new route from having the same gap. This is why root-cause cluster `AUTH-01` (`08-ROOT-CAUSE-CLUSTERS.md`) proposes an architectural fix, not per-route patches, consistent with this review's mandate.
