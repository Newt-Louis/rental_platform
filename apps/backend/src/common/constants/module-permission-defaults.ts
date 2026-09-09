import { Role } from '@prisma/client';

/**
 * Canonical default rows for the DB-backed ModulePermission table (the matrix
 * behind /admin?section=permissions and RolesGuard's dynamic module
 * override). Keys use the frontend RouteModule naming
 * (apps/frontend/src/lib/permissions.ts) since that's what the admin UI and
 * ModuleRoles() decorator both key off -- NOT the same naming as the static
 * MODULE_ROLES fallback rule in role-permissions.ts, which predates this
 * table and uses a handful of differently-cased keys (e.g. `booking` vs
 * `bookings`). For the 22 modules with a real backend enforcement point
 * (MODULE_ROLES), that list is the ground truth here (a couple of modules --
 * 'admin', 'contracts', 'fitout' -- are actually narrower on the backend than
 * the frontend nav currently shows; mirroring backend preserves real API
 * behavior rather than the more permissive, already-stale frontend list).
 * The remaining 11 modules have no backend MODULE_ROLES counterpart (gated by
 * local per-controller role consts instead) so this only affects their
 * frontend nav/route visibility -- their values mirror the frontend
 * ROUTE_PERMISSIONS list directly. ADMIN is never stored: the guard bypasses
 * it unconditionally.
 *
 * Used to seed a fresh environment (prisma/seed.ts,
 * prisma/backfill-module-permissions.js -- the latter is a standalone plain-JS
 * twin for environments with no ts-node, kept manually in sync) and to power
 * the admin "reset to default" action (PermissionsService.resetToDefault).
 */
export const MODULE_PERMISSION_DEFAULTS: Array<{ module: string; roles: Role[] }> = [
  { module: 'dashboard', roles: [Role.CEO, Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.FINANCE, Role.LEGAL, Role.OPERATION] },
  { module: 'spaces', roles: [Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.FINANCE, Role.LEGAL, Role.OPERATION] },
  { module: 'crm', roles: [Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR] },
  { module: 'bookings', roles: [Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR] },
  { module: 'proposals', roles: [Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR, Role.CEO] },
  { module: 'approvals', roles: [Role.LEASING_MANAGER, Role.MALL_DIRECTOR, Role.FINANCE, Role.LEGAL, Role.CEO, Role.OPERATION] },
  { module: 'contracts', roles: [Role.LEASING_MANAGER, Role.MALL_DIRECTOR, Role.FINANCE, Role.LEGAL] },
  { module: 'tenants', roles: [Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR, Role.FINANCE, Role.LEGAL] },
  { module: 'fitout', roles: [Role.OPERATION, Role.LEASING_MANAGER, Role.MALL_DIRECTOR] },
  { module: 'fitout-dossier-view', roles: [Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR, Role.FINANCE, Role.LEGAL, Role.FITOUT_BASIC_TEAM] },
  { module: 'tickets', roles: [Role.OPERATION, Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.TENANT] },
  { module: 'sales', roles: [Role.FINANCE, Role.MALL_DIRECTOR, Role.CEO, Role.TENANT] },
  { module: 'billing', roles: [Role.FINANCE, Role.MALL_DIRECTOR, Role.TENANT] },
  { module: 'billing-addin', roles: [Role.OPERATION, Role.MALL_DIRECTOR, Role.FINANCE] },
  { module: 'sap', roles: [Role.FINANCE] },
  { module: 'reports', roles: [Role.FINANCE, Role.MALL_DIRECTOR, Role.CEO, Role.LEASING_MANAGER] },
  { module: 'analytics', roles: [Role.FINANCE, Role.MALL_DIRECTOR, Role.CEO, Role.LEASING_MANAGER] },
  { module: 'ai', roles: [Role.LEASING_MANAGER, Role.MALL_DIRECTOR, Role.CEO] },
  { module: 'admin', roles: [] },
  { module: 'announcements', roles: [Role.MALL_DIRECTOR, Role.OPERATION, Role.LEASING_MANAGER, Role.TENANT] },
  { module: 'cross-mall', roles: [Role.CEO] },
  { module: 'audit-log', roles: [Role.CEO] },
  { module: 'parking', roles: [Role.CEO, Role.MALL_DIRECTOR, Role.FINANCE, Role.OPERATION] },
  // Frontend-only: no MODULE_ROLES counterpart -- these only gate nav/route
  // visibility until a future phase unifies the local per-controller consts.
  { module: 'crm-overview', roles: [Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR] },
  { module: 'deal-pipeline', roles: [Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR, Role.CEO] },
  { module: 'pipeline-stats', roles: [Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR, Role.CEO] },
  { module: 'fitout-approvals', roles: [Role.OPERATION, Role.LEASING_MANAGER, Role.MALL_DIRECTOR] },
  { module: 'service-contracts', roles: [Role.CEO, Role.LEASING_MANAGER, Role.MALL_DIRECTOR, Role.FINANCE, Role.LEGAL, Role.OPERATION] },
  { module: 'inventory', roles: [Role.CEO, Role.MALL_DIRECTOR, Role.FINANCE, Role.OPERATION] },
  { module: 'work-orders', roles: [Role.CEO, Role.MALL_DIRECTOR, Role.OPERATION, Role.LEASING_MANAGER] },
  { module: 'patrol', roles: [Role.CEO, Role.MALL_DIRECTOR, Role.OPERATION] },
  { module: 'parking-report', roles: [Role.CEO, Role.MALL_DIRECTOR, Role.FINANCE, Role.OPERATION] },
  { module: 'parking-transaction', roles: [Role.CEO, Role.MALL_DIRECTOR, Role.FINANCE, Role.OPERATION] },
  { module: 'tenant-portal', roles: [Role.TENANT, Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.OPERATION] },
];
