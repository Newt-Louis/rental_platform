# 18 — CR-101 Test Strategy

Design only. No code, no tests written in this phase.

## Reusable authorization test harness (design)

Rather than ~200 hand-written route-specific tests, define one **parameterized test generator** that consumes the same `@Scope(...)` metadata the runtime guard reads (per `14-CR-101-SCOPE-MODEL.md`), driven off the route inventory Phase 4's discovery mechanism already produces (`17-CR-101-MIGRATION-PLAN.md`). For every route classified `MALL-SCOPED`, the harness auto-generates:

```text
T-A  User with Mall-A access + entity belonging to Mall A  → ALLOW
T-B  User with Mall-A access + entity belonging to Mall B  → DENY
T-C  Bypass-role user (ADMIN; CEO only where its narrowed policy — see 19-CR-101-ADR.md — grants it) + entity in any Mall → per policy, not blanket ALLOW once ADR-CR101 narrows CEO's scope
T-D  Resolver cannot resolve a Mall for the entity (e.g. dangling reference) → DENY (INV-AUTH-003)
T-E  Unauthenticated request → DENY (already covered by existing JwtAuthGuard tests, included here for completeness of the generated suite, not re-implemented)
```

For `TENANT-SCOPED` routes, the equivalent generated set:

```text
T-F  Tenant Portal user + own-tenant entity  → ALLOW
T-G  Tenant Portal user + a different tenant's entity → DENY
T-H  Non-tenant staff role attempting a tenant-only route → per its own role/mall policy, not automatically ALLOW
```

This is a **generator**, not 200 literal files: one parameterized Jest test suite iterating the discovered route+resolver metadata, instantiating T-A..T-E (or T-F..T-H) per route with mocked Prisma responses shaped by each route's declared resolver. New routes get this coverage automatically once annotated — no per-route test-writing burden going forward, which is also what makes Phase 3's "ship a negative test before marking a gap route done" requirement (`17-CR-101-MIGRATION-PLAN.md`) actually tractable across ~15 gap route groups instead of a bespoke test per route.

## Coverage this replaces vs. supplements

- **Supplements** existing service-level unit tests (e.g. `billing.receivables.spec.ts`) — those verify business logic correctness; this harness verifies the authorization *decision* specifically, decoupled from business logic.
- **Does not replace** Gate 7 (`docs/ai-governance/05-E2E-QUALITY-GATES.md`) — Gate 7 is the platform-wide quality-gate requirement that authorization negative-cases exist; this harness is the concrete mechanism that makes satisfying Gate 7 for every Mall/Tenant-scoped route tractable rather than aspirational.

## Startup-check test

A dedicated test (not generated — hand-written once) asserts the Phase 4 completeness check itself works: spin up a minimal test Nest application with one deliberately-unscoped controller route registered, assert that bootstrap throws in strict mode and logs an ERROR in warn mode. This guards against the guard mechanism itself regressing silently.

## CI static gate test

A test verifying the CI gate script (Phase 5) correctly flags a PR-diff containing a new unscoped route and correctly passes a diff containing a properly-scoped one — run against fixture diffs, not the live repository, so it's fast and deterministic in CI.

## Background job scoping tests

For each job flagged in `17-CR-101-MIGRATION-PLAN.md`'s "background jobs — explicit scoping requirement" section as needing pre-Phase-6 confirmation: a test asserting the job's query is constructed with an explicit per-Mall filter (or an explicit assertion that the job is intentionally platform-wide with no per-Mall attribution in its output). This is the concrete mechanism satisfying `INV-AUTH-005`.

## What this strategy does NOT attempt

- Does not propose testing every one of the ~515 individual routes with a bespoke scenario — the generator pattern exists specifically to avoid that becoming the team's only option.
- Does not propose a live-environment E2E test suite as part of CR-101 itself (consistent with CR-102's precedent — live E2E requires infrastructure not available in this design phase; the generated harness runs against mocked Prisma, matching the existing `billing.receivables.spec.ts` pattern).
- Does not test FX/currency behavior (out of scope — this is CR-101, not CR-102/103).

## Status

Design proposed. No test code written. Ready to be implemented starting Phase 1 of the migration plan (the harness itself can be built alongside Phase 1's mechanical annotation work, since Phase 1's routes are the first ones it will exercise).
