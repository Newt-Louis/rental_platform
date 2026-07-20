import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { authApi } from '@/api/auth';
import { useMallStore } from '@/store/mall.store';
import { useAuthStore } from '@/store/auth.store';
import { Building2, ChevronDown } from 'lucide-react';

export function MallSelector() {
  const { user } = useAuthStore();
  const { selectedMallId, selectedMallName, setSelectedMall, openMallContextModal } = useMallStore();

  const { data: malls } = useQuery({
    queryKey: ['malls'],
    queryFn: spacesApi.listMalls,
  });
  const mallList: any[] = malls?.data ?? malls ?? [];

  // Auto-select first mall for non-admin on first login (no activeMallId yet)
  useEffect(() => {
    if (mallList.length === 0 || selectedMallId !== null || user?.role === 'ADMIN') return;
    const first = mallList[0];
    setSelectedMall(first.id, first.name);
    authApi.setActiveMall(first.id);
  }, [mallList]);

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
