import { applyDecorators, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import { MODULE_ROLES, ModuleKey } from '../constants/role-permissions';
import { ROLES_KEY } from './roles.decorator';

export const MODULE_KEY = 'moduleKey';
export const MODULE_FIXED_ROLES_KEY = 'moduleFixedRoles';
export const MODULE_ROLE_CEILING_KEY = 'moduleRoleCeiling';

interface ModuleRolesOptions {
  /** Roles that retain an explicit capability even when absent from the staff module matrix. */
  fixedRoles?: Role[];
  /** A stricter endpoint-level ceiling that the module matrix cannot widen. */
  roleCeiling?: Role[];
}

/**
 * A handful of MODULE_ROLES keys don't match the frontend RouteModule name
 * for the same feature (apps/frontend/src/lib/permissions.ts). The DB-backed
 * ModulePermission table and the admin UI use the frontend name, so this maps
 * it back to the MODULE_ROLES key used for the static fallback below.
 */
const FRONTEND_TO_MODULE_ROLES_KEY: Partial<Record<string, ModuleKey>> = {
  bookings: 'booking',
  'billing-addin': 'billingAddIn',
  'tenant-portal': 'tenantPortal',
  'cross-mall': 'crossMall',
  'audit-log': 'auditLog',
  'fitout-dossier-view': 'fitoutDossierView',
};

/** The 21 modules with a clean 1:1 frontend<->backend mapping — see the permissions plan. */
export type DynamicModuleKey =
  | 'dashboard' | 'spaces' | 'crm' | 'bookings' | 'proposals' | 'approvals' | 'contracts'
  | 'tenants' | 'fitout' | 'tickets' | 'sales' | 'billing' | 'billing-addin' | 'sap'
  | 'reports' | 'analytics' | 'ai' | 'admin' | 'announcements' | 'tenant-portal'
  | 'cross-mall' | 'audit-log' | 'parking' | 'fitout-dossier-view';

/**
 * Same enforcement as @Roles(...MODULE_ROLES.xxx), but also tags the route
 * with its (frontend-named) module key so RolesGuard can look up a live
 * override from ModulePermission (DB) at request time. MODULE_ROLES.xxx is
 * still set as the ROLES_KEY metadata, so a missing/unseeded DB row falls
 * back to today's exact static behavior instead of failing open.
 */
export function ModuleRoles(key: DynamicModuleKey, options: ModuleRolesOptions = {}) {
  const staticKey = FRONTEND_TO_MODULE_ROLES_KEY[key] ?? (key as ModuleKey);
  const fallbackRoles = options.roleCeiling ?? MODULE_ROLES[staticKey];
  const requiredRoles = Array.from(new Set([...fallbackRoles, ...(options.fixedRoles ?? [])]));
  return applyDecorators(
    SetMetadata(MODULE_KEY, key),
    SetMetadata(ROLES_KEY, requiredRoles),
    SetMetadata(MODULE_FIXED_ROLES_KEY, options.fixedRoles ?? []),
    SetMetadata(MODULE_ROLE_CEILING_KEY, options.roleCeiling),
  );
}
