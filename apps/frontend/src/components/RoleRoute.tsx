import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { canAccessPath, getDefaultHomePath } from '@/lib/permissions';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissionsStore } from '@/store/permissions.store';

export function RoleRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const location = useLocation();
  usePermissionsStore((state) => state.allowedModules);

  if (!canAccessPath(user?.role, location.pathname)) {
    return <ForbiddenPage />;
  }

  return <>{children}</>;
}

export function HomeRedirect() {
  const { user } = useAuthStore();
  return <Navigate to={getDefaultHomePath(user?.role)} replace />;
}
