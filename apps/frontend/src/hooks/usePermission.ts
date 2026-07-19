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
    // Giữ giao diện đồng bộ với backend: Super Admin không bị ẩn thao tác chỉ
    // vì một component khai báo danh sách vai trò cục bộ chưa có ADMIN.
    hasRole: (roles: Role[]) => role === 'ADMIN' || (!!role && roles.includes(role)),
  };
}
