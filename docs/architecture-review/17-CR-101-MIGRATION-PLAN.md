# 17 — CR-101 Migration Plan

Design only. No code. Phases derived from the actual repository (39 controllers, ~515 routes, ~20 already correctly-scoped controllers vs. ~15 confirmed-gap route groups per `15-CR-101-ROUTE-COVERAGE.md`) rather than applied from the review's illustrative A–F lettering unmodified. Not a big-bang rewrite — each phase is independently revertible and ships zero behavior change except where explicitly noted.

## Phase 1 — Annotate already-correctly-scoped routes (mechanical, zero behavior change)

Add `@Scope(MALL, { resolver: X })` to the ~20 controllers that already call `MallAccessService` explicitly and correctly today (Billing, Booking, Contracts, Proposals, Approvals, Tenants, Tickets, Work-Orders, Inventory, Service-Contracts, Slots, Categories' pricing sub-resource, Fitout base + submittal). Add `@Scope(GLOBAL, ...)` to confirmed-global routes (Auth's public endpoints, Branding, Telemetry, Audit-Log, Users, base Categories). Fold Patrol's parallel ad hoc resolver helpers into the shared registry as named resolvers (per `16-CR-101-RESOLVER-REGISTRY.md`'s "avoiding duplicated logic" note) — same behavior, one mechanism.

**Also in this phase**: resolve the three UNKNOWN items from `15-CR-101-ROUTE-COVERAGE.md` (`deal-scoring.controller.ts`'s 3 routes, `sap.controller.ts`'s per-route detail, Spaces' Malls/Floors/Zones base routes) so the "zero UNKNOWN before implementation approval" bar is actually met before Phase 3 begins.

**Risk**: none — decorators are additive metadata, `MallAccessGuard` continues operating exactly as today until Phase 4.

## Phase 2 — Annotate genuinely-global/exempt routes with a recorded reason

For every route with zero Mall concept (health checks, base taxonomy, singleton config, user-scoped notifications), add `@Scope(GLOBAL)` or `@Scope(USER)` with a one-line reason. This phase forces a conscious decision per route — the reason string becomes a permanent, reviewable artifact, closing the "nobody decided, it just happened to work" failure mode even for routes that were never actually gapped.

**Risk**: none — same additive-metadata nature as Phase 1.

## Phase 3 — Annotate and fix the confirmed-gap routes

This is where actual behavior changes. Using `15-CR-101-ROUTE-COVERAGE.md`'s consolidated gap list and `16-CR-101-RESOLVER-REGISTRY.md`'s new-resolver definitions:

1. **Sub-phase 3a (schema-independent fixes)**: Spaces `/units/*` (P0), Analytics (P0), Reports (P0), Sales (P1), Fitout-controls/Gantt/Daily-report (P1/P2), AI (P1), CRM `getUnifiedDeals` (P1), Announcements admin CRUD (P1, simplest — field already exists), Service-Catalog (P2), Files/`FilesController` (P1). None of these require a schema change — only wiring an existing or newly-defined resolver.
2. **Sub-phase 3b (schema-dependent, blocked pending business confirmation)**: `customers.controller.ts` (blocked on `BC-016` — does `Customer` get a Mall relationship at all, and how), `parking-dashboard.controller.ts` (blocked on `BC-008` — needs a `parkingCode`→`mallId` mapping that doesn't exist yet, a genuine data-modeling task, not just an authorization fix).
3. **Sub-phase 3c (Tenant-scoping, narrower mechanism)**: Tickets' 3 endpoints + SLA-policy routes (`CONTRA-003`) — this is a `currentUser.tenantId` check, not a `@Scope(MALL,...)` resolver; small, independent fix, can land in parallel with 3a/3b.

Each route in sub-phase 3a should ship with its negative-case test (per `18-CR-101-TEST-STRATEGY.md`) BEFORE being marked done — this phase is where the actual security fix happens, and it should not be treated as lower-risk than it is.

**Risk**: medium. Mitigation: audit-log-first rollout per route or per batch (see below), not a flag day.

### Audit-log-first mitigation (for sub-phase 3a/3c specifically)

Before a newly-annotated Phase-3 route actually starts DENYING requests, ship it first in **observe-only mode**: the resolver runs, the access decision is computed and logged (route, user, role, resolved mall, resolution source, decision, reason — see the Audit Mode section below), but the request is still ALLOWED regardless of the decision. Run for one full deploy/business cycle. Review the log for any DENY-decision that actually fired against real traffic — that is empirical evidence of whether `BC-009`/`BC-013`/`BC-017`/`BC-020`'s "is this exploited in practice" question has a live answer, not just a policy one. Only after that review flips the route from observe-only to enforcing.

## Phase 4 — Startup completeness check (design)

A NestJS `OnModuleInit`/`OnApplicationBootstrap` hook, using Nest's own `DiscoveryService` + `MetadataScanner` (the same introspection APIs Nest itself uses internally to wire controllers — no new dependency), enumerates every registered route and reads its `@Scope(...)` metadata via `Reflector`. Any route with no `@Scope(...)` metadata at all is collected into a list.

- **Strict mode** (target end state): if the list is non-empty, throw during bootstrap — the application does not start. This is the actual "make the missing case impossible to ship" mechanism.
- **Warn mode** (transitional): if the list is non-empty, log each offending route at ERROR level but allow startup to continue. Used during Phases 1–3 while coverage is still being built out, so the team isn't blocked from deploying incremental progress.
- **Recommended rollout**: warn mode from the start of Phase 1 (so any NEW route added by unrelated work during the migration is immediately visible in logs, even before enforcement exists), flipped to strict mode only once Phase 3's route list is fully annotated and the warn log has been clean for one full deploy cycle.

## Phase 5 — CI static gate (design)

Runtime startup checks catch missing metadata *when the app boots* (dev, staging, prod) but not *at PR-review time*. A complementary CI check, run on every pull request:

1. Statically parse (via the TypeScript compiler API, or Nest's own AST-free route-registration introspection run in a throwaway test-bootstrap process — either is viable; recommend the throwaway-bootstrap approach since it reuses Phase 4's exact same discovery logic rather than re-implementing route enumeration in a separate static-analysis tool) every controller route in the diff.
2. Fail the PR if any new or modified route lacks `@Scope(...)` metadata.
3. This is the concrete answer to the review's "new controller route + missing scope declaration → FAIL" requirement (Section 11) — implemented as "run the same bootstrap-time discovery Phase 4 already built, in CI, before merge" rather than a second, independently-maintained static-analysis tool that could drift from the runtime check's actual behavior.

## Phase 6 — Enable fail-closed enforcement

Once Phase 4's strict mode is live and Phase 3's routes have completed their audit-log-first review window, `MallAccessGuard`'s fallback behavior changes from "if no mallId resolves, skip the check" to "if a route is `@Scope(MALL,...)` and its resolver cannot resolve a mallId, deny" (`INV-AUTH-003`). This is the literal default-deny flip the review asks for — but it is now safe specifically because Phase 4 has already guaranteed every route has explicit, reviewed metadata, so "cannot resolve" at this point means a genuine resolver failure (e.g. the referenced entity was deleted, or a bug in the resolver), not "this route was never scoped in the first place."

## Phase 7 — Remove the heuristic fallback code

Delete the `sources` object pattern in `mall-access.guard.ts:30-40` (the `path.includes(...)`/param-name matching) entirely — it is no longer read by anything once every route is metadata-driven. Pure cleanup, zero behavior change (Phase 6 already fully cut over actual behavior).

## Service-layer defense (controller guards are not always sufficient)

Verified directly this session (the background agent tasked with a full sweep failed mid-run; this is a targeted, not exhaustive, check on the two highest-risk shared services):

- **`UnitStatusService.transition()`** (`common/services/unit-status.service.ts`) — called from **7 different service files** across modules (Booking, ContractTermination, Contracts, Fitout, Proposals, Slots, Spaces), confirmed via a direct grep this session. Classification: **INTERNAL CALLABLE**. It performs no Mall-scoping check of its own — it trusts that whichever HTTP controller triggered the call chain already validated access. This is **not safe by default**: Spaces' `/units/:id/status` route (a confirmed `CONTRA-008` gap, see `15-CR-101-ROUTE-COVERAGE.md`) can reach `UnitStatusService.transition()` today with zero prior Mall validation, and any *future* eighth caller added to this widely-shared service would inherit the same risk unless its own entry point happens to be correctly scoped. **Recommendation**: once Phase 3 closes the Spaces gap at the controller layer, additionally consider a lightweight service-layer assertion in `UnitStatusService.transition()` itself (e.g. accept an already-resolved/validated `mallId` as a required parameter rather than deriving it from the Unit alone) — this is defense-in-depth for a service this widely shared, not a duplicate check, since it protects against the *next* caller, not just the ones known today.
- **`BillingService.findAllInvoices()` / `calculateRevenueShare()`** — confirmed **HTTP-ONLY SAFE**: only called from `billing.controller.ts` (guarded) and internally within `billing.service.ts` itself; no `@Cron`/`@OnEvent` caller found. No additional service-layer defense needed for these two specifically.
- **Full sweep of the remaining high-risk services** (`ContractsService`, `ProposalsService`, `TenantsService`, `TicketsService`) was not completed this session (agent failure) — flagged as a bounded, specific pre-Phase-6 task: repeat the same grep-based callability check performed above for `UnitStatusService` against each of these four services' key methods before fail-closed enforcement ships, since any INTERNAL/JOB/EVENT CALLABLE method found among them should get the same service-layer-assertion treatment recommended for `UnitStatusService`.
- **Principle for new service-layer assertions**: only add them to services confirmed INTERNAL/JOB/EVENT CALLABLE with no independent scoping today — per the review's "do not duplicate checks unnecessarily," a service reachable only via one already-correctly-guarded HTTP route needs no additional defense.

## Background jobs — explicit scoping requirement

Per `INV-AUTH-005`: no scheduled job may rely on `MallAccessGuard` (jobs don't go through HTTP, so the guard never runs for them). Every job's query must already be explicitly Mall-scoped in its own code, OR be a genuinely platform-wide operation with no per-Mall attribution risk. Per prior System Truth findings (`docs/system-truth/09-EVENT-CATALOG.md`), the ~22 scheduled jobs largely already do this correctly (most either iterate per-Mall explicitly or are genuinely platform-wide bulk operations like the outbox/email-delivery processors). This plan does not re-verify every job individually (the background research agent tasked with this failed mid-run due to an account spend limit) — **flag as an explicit pre-implementation task**: confirm each job in the System Truth catalog against `INV-AUTH-005` before Phase 6 (fail-closed enforcement) ships, since a job that was implicitly "protected" by nothing running through the guard anyway needs its own explicit scoping audit, independent of the HTTP-layer work above.

## Audit mode observability (design)

Every authorization decision made under the new mechanism (both observe-only Phase 3 rollout and steady-state Phase 6+ operation) should be logged with: `route`, `userId`, `role`, `resolvedMallId` (or null if unresolved), `resolutionSource` (which resolver fired, or "client-supplied direct field"), `decision` (ALLOW/DENY), `reason` (e.g. "UserMallAccess grant found" / "resolver returned no mallId" / "bypass role"). **Never log request/response payload bodies** — this is a decision-audit trail, not a data-access log, and must not become its own sensitive-data exposure surface. This reuses the existing `AuditLogInterceptor` pattern (`common/interceptors/audit-log.interceptor.ts`, already global, already redacts sensitive keys) as the natural home for this — extending its existing redaction/storage mechanism rather than building a second, parallel logging pipeline.

## Reconciliation / static checks (read-only, design only)

Four checks, none implemented yet, all read-only (no auto-repair, consistent with `docs/ai-governance/*` reconciliation conventions):

1. **Controller routes missing scope metadata** — the Phase 4 startup check and Phase 5 CI gate ARE this check, running continuously rather than as a periodic batch job.
2. **Entity resolver missing** — a route declares `@Scope(MALL, { resolver: 'X' })` where `X` isn't a registered resolver name; caught at startup alongside the completeness check (a malformed reference, not a missing one, but the same discovery pass can validate both).
3. **Route uses client-supplied `mallId` despite an authoritative entity relationship existing** — a static-analysis check (Phase 5's CI gate can be extended to flag this pattern: a route with an `entity`-based resolver available for its primary parameter that ALSO reads `body.mallId`/`query.mallId` as if it were authoritative, per the "never trust client-supplied mallId when authoritative entity data exists" rule).
4. **Cross-Mall query without the explicit `CROSS_MALL_READ` permission** — a runtime check: any Prisma query touching a Mall-scoped model with no Mall filter in its `where` clause, executed by a route not carrying `CROSS_MALL_READ`, is a violation. Harder to fully statically verify (would require deep Prisma-query-shape analysis); recommend this remain a code-review-time checklist item initially, with the audit-log (above) providing the empirical backstop — a route silently returning multi-Mall data without the permission would show up as a resolver that never fires (no `resolvedMallId` on requests that clearly returned broad data), a detectable-but-not-fully-automatic signal.
5. **Files owner without a resolvable Mall** — for `FilesController` specifically, a periodic (not real-time) reconciliation query: for each document-family table, count rows where the owner-entity chain (per `16-CR-101-RESOLVER-REGISTRY.md`'s `fileOwnerEntity` table) cannot resolve to a Mall at all (orphaned/dangling references) — surfaces data-integrity issues distinct from authorization-logic issues.

## Performance

Entity-based resolution (`from: 'entity'` in `16-CR-101-RESOLVER-REGISTRY.md`) adds one DB lookup per request where none existed before (for routes that previously relied on a directly-supplied `mallId`) or reuses a lookup that's often already happening anyway (the controller/service usually fetches the entity itself moments later to serve the request — e.g. `GET /contracts/:id` resolves the Contract for authorization AND then again to return it). **Recommendation**: design the resolver to be *reusable* by the subsequent service call (e.g. attach the resolved entity to the request context) rather than a throwaway lookup, avoiding a literal N+1 duplication for the common "resolve-then-fetch-the-same-thing" pattern. For LIST endpoints (no single entity to resolve), the existing `mallIds`-array-threaded-into-`where`-clause pattern (already used correctly by Billing, Tickets, etc.) has no additional per-request lookup cost beyond what a correctly-written list query needs anyway. For high-volume document-download routes (`FilesController`), the one extra lookup per download is a negligible cost relative to the file I/O itself. No obvious performance collapse risk identified; a caching layer for `UserMallAccess` lookups (per-user, short TTL) is a reasonable future optimization but not a blocking requirement for this migration.

## Rollback

Every phase up to and including Phase 5 is purely additive (decorators, a startup check in warn-only mode, a CI check) — revertible by deleting the added code/config with zero data or behavior impact. Phase 6 (the actual fail-closed flip) is the one phase with real rollback complexity: recommend a feature flag gating the guard's fallback behavior (skip-if-unresolved vs. deny-if-unresolved) so Phase 6 can be reverted to Phase-5 behavior instantly without a code deploy if a false-deny incident occurs in production. Phase 7 (cleanup) should only proceed once Phase 6 has been stable for a defined soak period.
