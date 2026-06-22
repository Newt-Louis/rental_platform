import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { canAccessPath, getDefaultHomePath } from '@/lib/permissions';
import ForbiddenPage from '@/components/ForbiddenPage';

export function RoleRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!canAccessPath(user?.role, location.pathname)) {
    return <ForbiddenPage />;
  }

  return <>{children}</>;
}

export function HomeRedirect() {
  const { user } = useAuthStore();
  return <Navigate to={getDefaultHomePath(user?.role)} replace />;
}
