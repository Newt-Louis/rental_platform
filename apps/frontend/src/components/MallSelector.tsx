import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { authApi } from '@/api/auth';
import { useMallStore } from '@/store/mall.store';
import { useAuthStore } from '@/store/auth.store';
import { Building2, ChevronDown } from 'lucide-react';

export function MallSelector() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { selectedMallId, selectedMallName, setSelectedMall, openMallContextModal } = useMallStore();

  const { data: malls, isSuccess } = useQuery({
    queryKey: ['malls'],
    queryFn: spacesApi.listMalls,
  });
  const mallList: any[] = malls?.data ?? malls ?? [];

  // Reconcile persisted context with the permission-filtered Mall list.
  useEffect(() => {
    if (!isSuccess || !user) return;

    const selectedMall = mallList.find((mall) => mall.id === selectedMallId);
    if (selectedMall) {
      if (selectedMall.name !== selectedMallName) {
        setSelectedMall(selectedMall.id, selectedMall.name);
      }
      return;
    }

    if (user.role === 'ADMIN' && selectedMallId === null) return;

    if (mallList.length === 0) {
      if (selectedMallId !== null) {
        setSelectedMall(null);
        void authApi.setActiveMall(null);
      }
      return;
    }

    const first = mallList[0];
    let cancelled = false;
    void authApi.setActiveMall(first.id).then(() => {
      if (cancelled) return;
      setSelectedMall(first.id, first.name);
      qc.invalidateQueries();
    });
    return () => { cancelled = true; };
  }, [isSuccess, mallList, qc, selectedMallId, selectedMallName, setSelectedMall, user]);

  if (isSuccess && mallList.length === 0) {
    return (
      <button
        onClick={openMallContextModal}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-amber-700 hover:bg-amber-50"
      >
        <Building2 size={14} />
        Chưa được cấp Mall
      </button>
    );
  }

  if (mallList.length === 0) return null;

  // Non-admin with only one mall — show name, no interaction needed
  if (user?.role !== 'ADMIN' && mallList.length === 1) {
    return (
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
        <Building2 size={14} className="text-gray-500" />
        {mallList[0]?.name ?? 'THISO Mall'}
      </div>
    );
  }

  return (
    <button
      onClick={openMallContextModal}
      className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors rounded-md px-2 py-1 hover:bg-gray-100"
    >
      <Building2 size={14} className="text-gray-500 shrink-0" />
      <span className="max-w-[160px] truncate">{selectedMallName}</span>
      <ChevronDown size={13} className="text-gray-400 shrink-0" />
    </button>
  );
}
