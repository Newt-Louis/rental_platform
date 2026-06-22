import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { useAuthStore } from '@/store/auth.store';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export function MallSelector() {
  const { user } = useAuthStore();
  const { selectedMallId, setSelectedMall } = useMallStore();

  const { data: malls } = useQuery({
    queryKey: ['malls'],
    queryFn: spacesApi.listMalls,
  });

  const mallList: any[] = malls?.data ?? malls ?? [];

  // Auto-select the first mall if not yet set and not admin
  useEffect(() => {
    if (mallList.length > 0 && selectedMallId === null && user?.role !== 'ADMIN') {
      setSelectedMall(mallList[0].id, mallList[0].name);
    }
  }, [mallList, selectedMallId, user?.role, setSelectedMall]);

  if (mallList.length === 0) return null;

  if (user?.role !== 'ADMIN' && mallList.length === 1) {
    return (
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
        <Building2 size={14} className="text-gray-500" />
        {mallList[0]?.name ?? 'THISO Mall'}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Building2 size={14} className="text-gray-500 shrink-0" />
      <Select
        value={selectedMallId ?? '__all__'}
        onValueChange={(v) => {
          if (v === '__all__') {
            setSelectedMall(null, 'Tất cả Mall');
          } else {
            const m = mallList.find((x: any) => x.id === v);
            setSelectedMall(v, m?.name);
          }
        }}
      >
        <SelectTrigger className="border-0 shadow-none h-7 text-sm font-medium text-gray-700 px-1 gap-1 w-auto min-w-0 focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {user?.role === 'ADMIN' && (
            <SelectItem value="__all__">Tất cả Mall</SelectItem>
          )}
          {mallList.map((m: any) => (
            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
