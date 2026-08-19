import { describe, expect, it } from 'vitest';
import {
  canAccessModule,
  canAccessPath,
  getDefaultHomePath,
  NAV_GROUPS,
  PATH_TO_MODULE,
  ROUTE_PERMISSIONS,
  TENANT_NAV,
} from './permissions';

describe('route permissions', () => {
  it('maps every navigation item to its declared path module', () => {
    const items = [...NAV_GROUPS.flatMap((group) => group.items), ...TENANT_NAV];

    for (const item of items) {
      const segment = item.path.split('/')[1];
      expect(PATH_TO_MODULE[segment]).toBe(item.module);
      expect(ROUTE_PERMISSIONS[item.module]).toBeDefined();
    }
  });

  it('only exposes tenant navigation entries allowed to TENANT', () => {
    for (const item of TENANT_NAV) {
      expect(canAccessModule('TENANT', item.module)).toBe(true);
    }
  });

  it('strips query strings before extracting the module segment (dashboard action items link with ?status=... etc.)', () => {
    // Regression test for a real bug found during test triage: every
    // Dashboard action item whose target URL has a query string (overdue
    // invoices, expiring contracts, open tickets, expiring bookings) was
    // being silently filtered out for every role, including ADMIN, because
    // the query string was never stripped before the module lookup.
    expect(canAccessPath('ADMIN', '/billing?status=OVERDUE')).toBe(true);
    expect(canAccessPath('FINANCE', '/billing?status=OVERDUE')).toBe(true);
    expect(canAccessPath('LEASING_MANAGER', '/contracts?expiring=30')).toBe(true);
    expect(canAccessPath('OPERATION', '/tickets?queue=open')).toBe(true);
    expect(canAccessPath('LEASING_EXECUTIVE', '/bookings?expiringSoon=true')).toBe(true);
    // Still correctly denies when the role genuinely lacks the module.
    expect(canAccessPath('LEGAL', '/billing?status=OVERDUE')).toBe(false);
  });

  it('protects nested routes using their top-level module', () => {
    // TENANT does not get the standalone /fitout route: Tenant Portal has its own
    // Fitout tab, and the /fitout sub-resource tabs (submittal/issue/gantt/...) 403
    // for TENANT at the backend, so granting the route would produce a broken
    // partial-access experience. See docs/implementation/UX_DECISIONS.md DECISION-001.
    expect(canAccessPath('TENANT', '/fitout/project-1/gantt')).toBe(false);
    expect(canAccessPath('MALL_DIRECTOR', '/fitout/project-1/gantt')).toBe(true);
    expect(canAccessPath('FINANCE', '/fitout/project-1/gantt')).toBe(false);
    expect(canAccessPath('ADMIN', '/admin/categories')).toBe(true);
    expect(canAccessPath('ADMIN', '/future-unregistered-module')).toBe(false);
  });

  it('uses a role-appropriate landing page', () => {
    expect(getDefaultHomePath('TENANT')).toBe('/tenant-portal');
    expect(getDefaultHomePath('ADMIN')).toBe('/dashboard');
    expect(getDefaultHomePath(undefined)).toBe('/dashboard');
  });

  it('covers every RouteModule exactly once in NAV_GROUPS (regression guard for the ' +
    'Wave 2 sidebar regroup — see docs/implementation/UX_DECISIONS.md DECISION-003: ' +
    'a module must never be silently duplicated across groups or dropped entirely)', () => {
    const modules = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.module));
    const allModules = Object.keys(ROUTE_PERMISSIONS) as (keyof typeof ROUTE_PERMISSIONS)[];
    const counts = new Map<string, number>();
    for (const m of modules) counts.set(m, (counts.get(m) ?? 0) + 1);

    for (const module of allModules) {
      // tenant-portal and billing/sales/tickets/announcements are staff-nav items
      // too (they also appear in TENANT_NAV for the separate tenant experience,
      // which is intentional and out of scope for this NAV_GROUPS-only check).
      expect(counts.get(module) ?? 0).toBe(1);
    }
    expect(modules.length).toBe(allModules.length);
  });
});
