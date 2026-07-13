import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';

export function usePermission() {
  const user = useAuthStore(s => s.user);
  const role = user?.role;

  return {
    user,
    role,
    isAdmin: role === 'ADMIN',
    isManager: role === 'LEASING_MANAGER',
    isStaff: !!role && role !== 'TENANT',
    isTenant: role === 'TENANT',
    hasRole: (roles: Role[]) => !!role && roles.includes(role),
  };
}
