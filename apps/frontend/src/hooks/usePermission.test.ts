import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { usePermission } from './usePermission';
import { useAuthStore } from '@/store/auth.store';
import type { User } from '@/types';

const makeUser = (role: User['role']): User => ({
  id: '1',
  email: 'test@test.com',
  fullName: 'Test',
  role,
  isActive: true,
});

describe('usePermission', () => {
  beforeEach(() => useAuthStore.setState({ user: null }));
  afterEach(() => cleanup());

  it('returns null user when not authenticated', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeUndefined();
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isStaff).toBe(false);
    expect(result.current.isTenant).toBe(false);
  });

  it('isTenant true for TENANT role', () => {
    useAuthStore.setState({ user: makeUser('TENANT') });
    const { result } = renderHook(() => usePermission());
    expect(result.current.isTenant).toBe(true);
    expect(result.current.isStaff).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });

  it('isAdmin true for ADMIN role', () => {
    useAuthStore.setState({ user: makeUser('ADMIN') });
    const { result } = renderHook(() => usePermission());
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isStaff).toBe(true);
    expect(result.current.isTenant).toBe(false);
  });

  it('isManager true for LEASING_MANAGER role', () => {
    useAuthStore.setState({ user: makeUser('LEASING_MANAGER') });
    const { result } = renderHook(() => usePermission());
    expect(result.current.isManager).toBe(true);
    expect(result.current.isStaff).toBe(true);
  });

  it('isStaff true for all non-TENANT roles', () => {
    const nonTenantRoles: User['role'][] = [
      'ADMIN', 'LEASING_EXECUTIVE', 'LEASING_MANAGER',
      'MALL_DIRECTOR', 'FINANCE', 'LEGAL', 'OPERATION', 'CEO',
    ];
    nonTenantRoles.forEach(role => {
      useAuthStore.setState({ user: makeUser(role) });
      const { result, unmount } = renderHook(() => usePermission());
      expect(result.current.isStaff).toBe(true);
      unmount();
    });
  });

  it('hasRole returns true when role matches', () => {
    useAuthStore.setState({ user: makeUser('FINANCE') });
    const { result } = renderHook(() => usePermission());
    expect(result.current.hasRole(['FINANCE', 'ADMIN'])).toBe(true);
    expect(result.current.hasRole(['TENANT', 'ADMIN'])).toBe(false);
  });

  it('hasRole returns false when no user', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.hasRole(['ADMIN'])).toBe(false);
  });
});
