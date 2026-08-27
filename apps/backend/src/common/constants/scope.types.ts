// CR-101 Phase 1 — descriptive scope metadata types.
//
// These types back the @Scope(...) decorator (see ../decorators/scope.decorator.ts).
// Phase 1/2 status: this metadata is PURELY DESCRIPTIVE. Nothing in the current
// request pipeline reads it to make an authorization decision -- MallAccessGuard's
// existing heuristic-based behavior is completely unchanged. Wiring this metadata
// into an enforcement decision is Phase 6 (see docs/architecture-review/17-CR-101-MIGRATION-PLAN.md)
// and is NOT authorized by the work that introduced this file.
//
// See docs/architecture-review/14-CR-101-SCOPE-MODEL.md for the full design rationale.

/**
 * The six formal scopes every route belongs to (composable via AND when more than
 * one applies -- e.g. a Tenant Portal route is both MALL_SCOPED, transitively via
 * its unit, and TENANT_SCOPED).
 *
 * COMPANY_SCOPED is reserved architecture only -- no Company entity exists in this
 * codebase today (see docs/system-truth/00-SYSTEM-OVERVIEW.md's "Major structural
 * correction"). Do not use it to introduce Company-shaped application logic; it
 * exists purely so this model doesn't need to change if a Company entity is ever
 * added.
 */
export enum ScopeType {
  GLOBAL = 'GLOBAL',
  COMPANY_SCOPED = 'COMPANY_SCOPED',
  MALL_SCOPED = 'MALL_SCOPED',
  TENANT_SCOPED = 'TENANT_SCOPED',
  USER_SCOPED = 'USER_SCOPED',
  SYSTEM_INTERNAL = 'SYSTEM_INTERNAL',
}

/**
 * Where a resolver's input value comes from on the request.
 */
export type ScopeInputSource = 'param' | 'query' | 'body';

/**
 * How a MALL_SCOPED route's Mall is determined.
 *
 * - direct: the named field on the request IS the mallId itself.
 * - entity: the named field is the ID of some other entity; `resolver` names the
 *   registered lookup (see ../services/mall-resolver-registry.ts) that maps that
 *   entity to its authoritative Mall. Per the "never trust client-supplied mallId
 *   when authoritative entity data exists" rule (docs/architecture-review/14-CR-101-SCOPE-MODEL.md),
 *   `entity` resolution is preferred over `direct` whenever an authoritative
 *   relationship exists, even if the request also happens to carry a raw mallId.
 */
export interface ScopeResolution {
  via: 'direct' | 'entity';
  from: ScopeInputSource;
  key: string;
  /** Required when via: 'entity' -- the registered resolver name (mall-resolver-registry.ts). */
  resolver?: string;
}

/**
 * The current, honestly-reported enforcement status of a MALL_SCOPED/TENANT_SCOPED
 * declaration. This lets Phase 1/2 annotate a route with the TRUTH about its
 * intended technical boundary (per Section 17 of the CR-101 Phase 1/2 review)
 * without silently implying the boundary is actually enforced today.
 *
 * - ENFORCED: the route already correctly validates this scope at runtime
 *   (verified by reading the controller/service code, not assumed).
 * - GAP: the intended boundary is clear (a resolver exists or could trivially be
 *   built), but the route does not currently enforce it -- a known, tracked
 *   CONTRA-008-class gap. Phase 1/2 must NOT close this gap; it only records it.
 * - PENDING_BUSINESS_CONFIRMATION: the intended boundary itself is not provable
 *   from code/docs alone (e.g. SAP's cross-mall FINANCE visibility question) --
 *   annotate the scope type as best understood, but flag that enforcement design
 *   cannot proceed until the linked BC-xxx item resolves.
 */
export enum EnforcementStatus {
  ENFORCED = 'ENFORCED',
  GAP = 'GAP',
  PENDING_BUSINESS_CONFIRMATION = 'PENDING_BUSINESS_CONFIRMATION',
}

export interface ScopeDeclaration {
  type: ScopeType;
  /** Required for MALL_SCOPED (and optionally TENANT_SCOPED, if resolved via an entity). */
  resolution?: ScopeResolution;
  /** Required when type === GLOBAL: why this route has no Mall/Tenant boundary. */
  globalReason?: string;
  /** Set true only for the small, explicitly-approved set of cross-Mall-read routes (see docs/architecture-review/19-CR-101-ADR.md). Declaring this here does NOT grant the permission -- see that document's "declared, not granted" note. */
  crossMallRead?: boolean;
  /** Honest, current enforcement status -- see EnforcementStatus above. Defaults to ENFORCED if omitted, so every declaration for a currently-correct route should be explicit even though it's the default, for auditability. */
  status?: EnforcementStatus;
  /** Required when status !== ENFORCED: which BC-xxx / CONTRA-xxx this gap or open question is tracked under. */
  trackedAs?: string;
}
