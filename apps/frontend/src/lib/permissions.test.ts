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

  it('protects nested routes using their top-level module', () => {
    expect(canAccessPath('TENANT', '/fitout/project-1/gantt')).toBe(true);
    expect(canAccessPath('FINANCE', '/fitout/project-1/gantt')).toBe(false);
    expect(canAccessPath('ADMIN', '/admin/categories')).toBe(true);
    expect(canAccessPath('ADMIN', '/future-unregistered-module')).toBe(false);
  });

  it('uses a role-appropriate landing page', () => {
    expect(getDefaultHomePath('TENANT')).toBe('/tenant-portal');
    expect(getDefaultHomePath('ADMIN')).toBe('/dashboard');
    expect(getDefaultHomePath(undefined)).toBe('/dashboard');
  });
});
