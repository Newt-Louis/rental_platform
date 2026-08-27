# 14 — CR-101 Scope Model

Design only. No code. This document defines the formal authorization scope model and the concrete NestJS decorator/metadata mechanism that replaces `MallAccessGuard`'s current heuristic inference.

## Reconstructed current authorization path (verified fresh this session)

```text
HTTP Request
  ↓
ThrottlerGuard            (rate limiting — not an authz concern)
  ↓
JwtAuthGuard               [AUTHN]   — global APP_GUARD, app.module.ts:107-109
  · validates JWT via Passport strategy, checks Redis token-blacklist
  · @Public() (IS_PUBLIC_KEY reflector metadata) exempts a route entirely
  · attaches req.user = { id, email, role, tenantId, activeMallId, ... } (re-fetched from DB in JwtStrategy.validate(), not decoded from stale JWT claims)
  ↓
RolesGuard                 [ROLE AUTH]   — global APP_GUARD, app.module.ts:110-113
  · reads @Roles(...) reflector metadata (class-level, overridable per-method)
  · no @Roles() on a route → ALLOW to any authenticated user (default-open, not default-closed)
  · user.role === ADMIN → unconditional bypass, regardless of @Roles() content (roles.guard.ts:36-38)
  · otherwise: user.role must be in the route's declared @Roles() list, else 403
  ↓
MallAccessGuard             [MALL AUTH]   — global APP_GUARD, app.module.ts:114-117
  · user.role in [ADMIN, CEO, TENANT] → unconditional bypass (mall-access.service.ts:9)
  · otherwise: attempts to resolve a mallId from a fixed set of query/body/param field
    names and narrow path-substring heuristics (mall-access.guard.ts:30-40)
  · if NO mallId resolves at all → check is silently SKIPPED (mall-access.service.ts:262,
    `if (mallId) {...}`, no else-throw) — this is the confirmed fail-open defect (CONTRA-008)
  · if a mallId DOES resolve → UserMallAccess{userId, mallId, isActive:true} lookup, 403 if absent
  ↓
Controller method
  ↓
(No further guard layer — from here on, "authorization" is whatever the controller/service chooses to do)
  ↓
Service method
  · TENANT AUTH is enforced here, ad hoc, per-method: e.g. Tickets/Billing/Sales explicitly
    force currentUser.tenantId server-side rather than trusting a client-supplied value —
    this is NOT a guard, it is application code inside each service, correctly applied on
    most paths (confirmed) but with 3 confirmed gaps (CONTRA-003) where a method forgot to
    receive/check currentUser at all
  · ENTITY-LEVEL AUTH (does THIS SPECIFIC ROW belong to a mall/tenant the caller may see) is
    partially done by MallAccessGuard's entity-lookup resolvers (for the ~15 resource types
    MallAccessService.extractAndValidateMallAccess() knows how to resolve) and partially by
    the service's own `where` clause construction (e.g. billing.service.ts threading a
    `mallIds` array into a Prisma `where: { OR: [...] }`) — these are two DIFFERENT
    mechanisms today, not one, which is itself a source of the inconsistency
  ↓
Database query
```

## Why these five concepts must not be conflated (per the review's instruction)

| Concept | What it answers | Current mechanism | Failure mode if missing |
|---|---|---|---|
| AUTHN | Is this a real, currently-valid session? | `JwtAuthGuard` | Anonymous access |
| ROLE AUTH | Does this user's role generally permit this *kind* of action? | `RolesGuard` + `@Roles()` | Wrong-role access to an entire capability |
| MALL AUTH | Does this user have standing access to *this Mall*? | `MallAccessGuard` + `UserMallAccess` | Cross-Mall data exposure (the confirmed defect class) |
| TENANT AUTH | If the user is a Tenant-Portal user, is this *their own* tenant's data? | Ad hoc service-layer `currentUser.tenantId` checks | Cross-tenant data exposure |
| ENTITY-LEVEL AUTH | Does the specific row/record the request targets actually belong to the Mall/Tenant the broader checks established? | Split between `MallAccessGuard`'s entity resolvers and each service's own query construction | The row exists but nothing actually confirmed it's in-scope — this is exactly where `CONTRA-008`'s gaps live: MALL AUTH ran, found no resolvable mallId, and skipped — ENTITY-LEVEL AUTH never happened either |

A design that only fixes MALL AUTH's resolution heuristic but leaves ENTITY-LEVEL AUTH split across two inconsistent mechanisms will still produce gaps. The scope model below unifies both into one declaration per route.

## Formal scope model

Every route belongs to **exactly one** primary scope, chosen from:

```text
GLOBAL          — no Mall/Tenant/Company concept applies (e.g. login, health, base taxonomy)
COMPANY-SCOPED  — would apply if a Company entity existed; it does not (see docs/system-truth/00-SYSTEM-OVERVIEW.md's
                  "Major structural correction") — retained as a defined-but-currently-unused scope level so the
                  model doesn't need to change if a Company entity is ever introduced; no route uses it today
MALL-SCOPED     — the primary case; access requires standing UserMallAccess to the resolved Mall
TENANT-SCOPED   — access requires the request to belong to the authenticated Tenant-Portal user's own Tenant
USER-SCOPED     — access requires the record to belong to the authenticated user themself (e.g. "my notifications," "my profile") — distinct from TENANT-SCOPED because it applies to staff users too, not only Tenant-Portal users
SYSTEM/INTERNAL — not a real user-facing HTTP capability; reachable only by scheduled jobs, event listeners, or other backend services — see 16-CR-101-RESOLVER-REGISTRY.md's service-layer section
```

### Composition rule

A route may require **more than one** scope simultaneously (e.g. a Tenant Portal ticket route is both MALL-SCOPED, transitively via the ticket's unit, AND TENANT-SCOPED). When composed, **all applicable scopes must independently pass** — composition is logical AND, never OR. The existing codebase already does this correctly in spirit (Tickets checks both an implicit Mall relationship and an explicit `tenantId`), just not through one unified mechanism. This design keeps that AND semantics but makes it a single declared, machine-checkable fact per route instead of two independently-remembered pieces of code.

### No UNKNOWN-SCOPE at runtime

Every route must resolve to exactly one of the scopes above at application startup (see `10-CR-101-STARTUP-CHECK` in the migration plan) — "nobody decided yet" is not a runtime-legal state once enforcement is enabled. During the transition (before enforcement), routes may be *temporarily* unclassified in the codebase, but the startup/CI checks (Section 10/11 of the review) exist precisely to shrink that set to zero before flipping enforcement on.

## Decorator / metadata design

Following the codebase's own established pattern (`@Public()` / `IS_PUBLIC_KEY`, already a `Reflector`-based metadata decorator applied class- or method-level and read by a guard) — this design is consistent with existing conventions, not a new pattern being introduced.

```text
@Scope(GLOBAL)
@Scope(MALL, { resolver: <ResolverSpec> })
@Scope(TENANT, { field: 'tenantId' | via-entity })
@Scope(USER)
@Scope(INTERNAL, { reason: string })          // not HTTP-reachable in practice; documents why a method exists on a service without a controller route, or is deliberately excluded from the HTTP surface
```

A single `@Scope(...)` decorator (rather than four separately-named decorators like `@MallScoped`/`@GlobalScope`/`@TenantScoped`/`@InternalScope`) is recommended over the illustrative names in the review prompt, for three reasons:
1. **One reflector key, one metadata shape** — the startup completeness check (Section 10) and the CI static gate (Section 11) both need to answer "does this route have scope metadata at all," which is simpler against one decorator family than four independent ones.
2. **Composition is explicit in the call, not implicit in stacking decorators** — `@Scope(MALL, {...})` combined with `@Scope(TENANT, {...})` on the same route is visually and structurally the same pattern as one, whereas `@MallScoped() @TenantScoped()` stacked separately invites the question "does order matter? do they compose AND or OR?" without an explicit answer.
3. Mirrors `@Roles(...)`'s existing shape (one decorator, an array/config argument) — matches codebase convention.

Class-level `@Scope(...)` sets a controller-wide default (mirroring how `@Roles(...MODULE_ROLES.spaces)` is already applied class-level in most controllers today); a method-level `@Scope(...)` overrides it for that one route. This lets a controller declare "MALL-SCOPED by default" once and only annotate the exceptions — matching the low-friction pattern the codebase already uses for `@Roles()`.

### `ResolverSpec` (the "how do I find the Mall" part)

```text
{ from: 'param', key: string, via: 'direct' | EntityResolverName }
{ from: 'query', key: string, via: 'direct' | EntityResolverName }
{ from: 'body',  key: string, via: 'direct' | EntityResolverName }
{ from: 'entity', resolver: EntityResolverName, idFrom: { from: 'param'|'query'|'body', key: string } }
```

- `via: 'direct'` — the field IS the mallId itself (today's `query.mallId`/`body.mallId`/`params.mallId` case).
- `via: EntityResolverName` / `from: 'entity'` — the field is an ID of some OTHER entity (a contract, a unit, a ticket, a file); the named resolver (see `16-CR-101-RESOLVER-REGISTRY.md`) looks up that entity and returns its Mall. This directly replaces the current path-substring heuristic (`path.includes('contract')`) with an explicit, per-route declaration of exactly which resolver applies and which field carries the ID — eliminating the "route's id param isn't named what the guard expects" failure class that caused most of `CONTRA-008`'s instances (Spaces units, Fitout-controls' `:riskId`, Fitout-gantt's task `:id`, etc. — all of these become simply `@Scope(MALL, { resolver: 'unit', idFrom: { from: 'param', key: 'id' } })` or the appropriate resolver name, decoupled entirely from what the param happens to be named).

## Never trust client-supplied mallId when an authoritative entity exists (explicit rule)

Per the review's instruction (Section 8): when a `ResolverSpec` uses `from: 'entity'`, the resolved Mall comes from the DATABASE record, never from a client-supplied `mallId` on the same request, even if one is present. A route may accept a client `mallId` as a **filter** (e.g. "only show me Mall X's results," which then gets ANDed with the user's accessible-mall-set), but never as the **authorization decision itself** once an authoritative entity relationship exists. This is already correctly the case for a few resource types in the current `MallAccessService` (Invoice/Payment/InvoiceAdjustment resolve from the entity first, only falling back to `sources.mallId` if no entity ID was given at all) — this design generalizes that already-correct pattern to every resolver, rather than leaving it inconsistent per resource type as today.

## Invariants (formal)

```text
INV-AUTH-001  A user cannot READ a Mall-scoped entity outside their authorized Mall scope.
INV-AUTH-002  A user cannot MUTATE (create/update/delete/approve) a Mall-scoped entity outside their authorized Mall scope.
INV-AUTH-003  An unresolved Mall scope may never default to ALLOW — an unresolvable resolver result is always DENY, once Phase 6 (17-CR-101-MIGRATION-PLAN.md) is live.
INV-AUTH-004  Cross-Mall authorization must be explicit (a declared CROSS_MALL_READ/-OPERATE permission), never inferred from a role's name or from role-list membership in an unrelated module.
INV-AUTH-005  Background jobs must explicitly constrain any Mall-scoped business query themselves — MallAccessGuard does not run for non-HTTP invocations, so a job has no implicit protection at all.
```

These are the formal counterparts to `INV-CUR-001` (currency, established in CR-102) — this is the authorization-domain equivalent, establishing the same "no implicit/default-permissive behavior" discipline for Mall scope that `INV-CUR-001` established for money. Enforcement mechanism for each: INV-AUTH-001/002 via the `@Scope(...)`+resolver+guard mechanism (Phases 1-6); INV-AUTH-003 via Phase 6's fail-closed flip specifically; INV-AUTH-004 via the `CROSS_MALL_READ` explicit-permission design (`19-CR-101-ADR.md`); INV-AUTH-005 via the background-job audit task (`17-CR-101-MIGRATION-PLAN.md`).

## Status

Design proposed. See `17-CR-101-MIGRATION-PLAN.md` for rollout and `19-CR-101-ADR.md` for the formal decision record.
