import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { permissionsApi } from '@/api/permissions';
import { useAuthStore } from '@/store/auth.store';
import { useMallStore } from '@/store/mall.store';
import { usePermissionsStore } from '@/store/permissions.store';

/**
 * Keeps permissions.store in sync with the DB-backed module permission matrix
 * (/admin?section=permissions) for the current user + currently selected Mall.
 * Re-fetches whenever the selected Mall changes, so switching Malls updates
 * the sidebar/route access immediately -- no re-login required (unlike a role
 * change made to a DIFFERENT user, which that user only sees on their next
 * login/hydrate). Mount once near the app root, after auth has hydrated.
 */
export function usePermissionsSync() {
  const token = useAuthStore((s) => s.token);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const selectedMallId = useMallStore((s) => s.selectedMallId);
  const setAllowedModules = usePermissionsStore((s) => s.setAllowedModules);
  const reset = usePermissionsStore((s) => s.reset);

  const { data } = useQuery({
    queryKey: ['permissions-effective', selectedMallId],
    queryFn: () => permissionsApi.getEffective(selectedMallId),
    enabled: isHydrated && !!token,
  });

  useEffect(() => {
    if (!token) {
      reset();
      return;
    }
    if (data?.modules) setAllowedModules(data.modules);
  }, [token, data, setAllowedModules, reset]);
}
