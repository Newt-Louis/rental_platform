# 13 — CR-101 Architecture Implementation Plan (AUTH-01: Mall Authorization Architecture)

**Superseded/refined by documents 14–19 (2026-08-21).** This document was written at the close of CR-102's human review as a first-pass sketch. Per the subsequent CR-101 Architecture Design Review's explicit instruction not to trust it blindly, it was independently re-reviewed against fresh code evidence — the core direction held up (explicit declarative scope metadata + startup-enforced completeness check, replacing heuristic inference), but several specifics were revised: the illustrative multi-decorator naming (`@MallScoped`/`@GlobalScope`/`@TenantScoped`) was consolidated into one composable `@Scope(...)` decorator (see `14-CR-101-SCOPE-MODEL.md` for the rationale); the gap-route list grew from the original "9+ instances" to 17 confirmed-or-newly-found groups across 39 controllers (`15-CR-101-ROUTE-COVERAGE.md`, including two genuinely new findings — Announcements' admin CRUD, Service-Catalog's proposal routes); the ADMIN/CEO bypass question, left open here, was resolved with concrete evidence in `19-CR-101-ADR.md` (ADMIN confirmed consistent with documented intent, CEO's blanket bypass found to exceed its own documented persona and is now a proposed, human-confirmable narrowing). **Treat `14-CR-101-SCOPE-MODEL.md` through `19-CR-101-ADR.md` as authoritative; this document remains as the historical first draft, per the governance rule against silently rewriting history.**

**Design only. No code in this document or this phase.** This plan responds to ADR-101 (`12-ARCHITECTURE-DECISIONS-REQUIRED.md`) and root-cause cluster `AUTH-01` (`08-ROOT-CAUSE-CLUSTERS.md`). It intentionally does not treat the 9+ confirmed gap instances (`CONTRA-008`) as nine independent controller patches — it proposes one structural mechanism that closes the whole class of gap, of which the current instances are simply the first symptoms found.

## Root cause recap

`MallAccessGuard` (global `APP_GUARD`) resolves a request's target Mall by pattern-matching specific field names (`mallId`, `unitId`, `floorId`) and narrow path substrings (`contract`, `fitout`, `invoices`), always keyed to `params.id`. When nothing matches, `MallAccessService.extractAndValidateMallAccess()` **silently skips the check** rather than denying (`mall-access.service.ts:262`, `if (mallId) { ... }`, no `else`). This is a **fail-open, implicit, per-route-heuristic** design. Every confirmed gap in `CONTRA-008` is the same defect surfacing on a route whose identifying parameter or path shape the heuristic doesn't recognize — not nine separate bugs.

## Design principle

Replace implicit heuristic inference with **explicit, per-route declaration, enforced fail-closed at application startup** — the same shift TypeScript represents over untyped JavaScript: make the missing case impossible to ship silently, not merely easier to spot in review.

## Proposed mechanism

### 1. Two new route-level decorators (design, not implementation)

- **`@MallScoped(resolver)`** — declares that this route's authorization depends on a Mall, and states *how* to resolve it: which request field carries the identifier, and which entity-resolution path to use (reusing `MallAccessService`'s existing per-resource-type resolvers — unit, contract, fitoutProject, invoice, ticket, tenant, etc. — as the resolution *logic*, decoupled from the current path-string/param-name matching that currently decides *whether* to invoke them at all).
- **`@MallExempt(reason: string)`** — declares that this route is intentionally global (no Mall concept applies, or access is restricted by role alone — e.g. bypass-role-only routes like Audit Log, or genuinely cross-cutting routes like base Category taxonomy). The `reason` string is mandatory and becomes a permanent, reviewable record of *why* — preventing a future contributor from mistaking "nobody got around to scoping this" for "this was a considered decision."

### 2. Startup-time completeness check

A NestJS application-bootstrap hook enumerates every registered HTTP route (via Nest's `DiscoveryService`/`MetadataScanner`, the same mechanism Nest itself uses internally to wire controllers) and asserts each one carries **either** `@MallScoped` **or** `@MallExempt`. A route with neither fails application startup with a clear error naming the offending controller/method.

This is the mechanism that actually closes the class of defect: a route can no longer be *accidentally* unscoped and reach production, because the application will not boot. This converts the current failure mode (silent, discovered only by security review or incident) into a build-time/deploy-time failure (loud, discovered before any traffic is served).

### 3. `MallAccessGuard` simplification

Once every route carries one of the two decorators, `MallAccessGuard` no longer needs its current heuristic `sources` object (`mall-access.guard.ts:30-40`) at all — it reads the route's `@MallScoped` metadata directly to know which field to extract and which `MallAccessService` resolver to call. The existing resolver *logic* inside `MallAccessService.extractAndValidateMallAccess()` (lines 51-266) is largely reusable as-is; what changes is how the guard decides *whether and how* to invoke it, not the resolution logic itself.

## Rollout phases (each independently revertible)

1. **Phase 1 — Annotate all currently-correctly-scoped routes.** Mechanical: add `@MallScoped(...)` to the ~20 modules that already call `MallAccessService` explicitly today, using the same field/resolver each already uses. Zero behavior change — purely additive metadata. Lowest risk, can start immediately, no dependency on any BC answer.
2. **Phase 2 — Annotate genuinely global routes with `@MallExempt`.** Categories (base), Audit Log, Auth, Users, Branding, and any other route confirmed to have no Mall concept. Forces a conscious, recorded decision per route. Zero behavior change.
3. **Phase 3 — Annotate the confirmed-gap routes with `@MallScoped`.** Spaces (Units), Analytics, Reports, Sales, Parking-Dashboard, Fitout-controls/Gantt/Daily-report-photos, AI, CRM (`getUnifiedDeals`, Customers pending `BC-016`). **This phase is where actual behavior changes** — these routes go from unscoped to scoped. Sequence and exact rollout scope for each should be informed by `BC-009`/`BC-013`/`BC-017`/`BC-020`'s answers (real-world urgency), but the *mechanism* doesn't require those answers to be built — only the *rollout order* does.
4. **Phase 4 — Enable the startup check in WARN-only mode first.** Log every route missing metadata without crashing, run for a full deploy cycle to catch anything phases 1-3 missed, then flip to hard-fail-on-boot once the warn log is clean.
5. **Phase 5 — Remove the old heuristic `sources`-object code from `MallAccessGuard`/`MallAccessService`** once every route is confirmed metadata-driven. This is cleanup, not risk-bearing — the guard's *behavior* has already been fully cut over by Phase 4.

## Handling the "could break undetected legitimate cross-mall usage" risk

Phase 3's newly-enforced routes are the only ones with real behavior-change risk. Mitigation: ship Phase 3 initially in **audit-log-only mode** per newly-scoped route (log what *would* have been denied, but still allow it) for one deploy cycle, reviewed by the Security Architect before flipping to actually deny — this directly surfaces whether any currently-undetected legitimate multi-mall usage pattern exists (answering `BC-009`/`BC-013`/`BC-017`/`BC-020` empirically, not just by policy interview) before the enforcement becomes user-facing.

## Testing requirements

- Gate 7 (negative-case) test for every route brought under Phase 3 enforcement: a Mall-A-scoped user must be denied for a Mall-B resource.
- A dedicated test asserting the startup check itself works: a deliberately-unscoped test route must fail application bootstrap in a test configuration with enforcement enabled.
- Regression: full existing suite must remain green through every phase (Phases 1-2 by construction, since they're additive-only; Phase 3 requires new negative tests per route; Phase 4/5 require no test changes if 1-3 were done correctly).

## Explicit non-goals of this plan

- This plan does not decide the exact rollout order *within* Phase 3 (which of the 9+ gap routes ships first) — that is a Security Architect + Chief ERP Architect call once `BC-009`/`BC-013`/`BC-017`/`BC-020` are answered, informed by this plan's audit-log-first mitigation.
- This plan does not touch Tenant-scoping (the `TENANT` bypass-role mechanism, or the narrower `CONTRA-003` Tickets gap) — that is a related but structurally distinct mechanism (service-layer `tenantId` checks, not `MallAccessGuard`) and is out of `AUTH-01`'s scope as clustered.
- No code, decorator implementation, or guard modification is authorized by this document. This is the design to be reviewed and approved (per ADR-101) before any CR-101 implementation work begins.

## Dependencies

- **ADR-101** (`12-ARCHITECTURE-DECISIONS-REQUIRED.md`) must formally ratify this mechanism (or an alternative) before implementation starts.
- **BC-009, BC-013, BC-017, BC-020** inform Phase 3's rollout order and audit-log-review duration, but do not block Phases 1-2 or the mechanism's construction.

## Status

Design proposed. Not yet approved. No implementation authorized.
