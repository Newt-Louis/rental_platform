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
    // Approved Fitout policy exposes only the capability-limited root workspace
    // to TENANT; staff-only report/settings routes remain denied.
    expect(canAccessPath('TENANT', '/fitout')).toBe(true);
    expect(canAccessPath('TENANT', '/fitout?projectId=project-1')).toBe(true);
    expect(canAccessPath('TENANT', '/fitout/project-1/gantt')).toBe(false);
    expect(canAccessPath('TENANT', '/fitout/settings')).toBe(false);
    expect(canAccessPath('MALL_DIRECTOR', '/fitout/settings')).toBe(false);
    expect(canAccessPath('ADMIN', '/fitout/settings')).toBe(true);
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

  it('covers every RouteModule and keeps every navigation path unique (regression guard for the ' +
    'Wave 2 sidebar regroup — see docs/implementation/UX_DECISIONS.md DECISION-003)', () => {
    const modules = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.module));
    const paths = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.path));
    const allModules = Object.keys(ROUTE_PERMISSIONS) as (keyof typeof ROUTE_PERMISSIONS)[];
    const counts = new Map<string, number>();
    for (const m of modules) counts.set(m, (counts.get(m) ?? 0) + 1);

    for (const module of allModules) {
      expect(counts.get(module) ?? 0).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('/ai');
    expect(paths).toContain('/ai/codebase');
  });
});
