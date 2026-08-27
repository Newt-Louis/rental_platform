import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check, Globe } from 'lucide-react';
import { spacesApi } from '@/api';
import { authApi } from '@/api/auth';
import { useMallStore } from '@/store/mall.store';
import { useAuthStore } from '@/store/auth.store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function MallContextModal() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { selectedMallId, setSelectedMall, isMallContextModalOpen, closeMallContextModal } = useMallStore();

  const isAdmin = user?.role === 'ADMIN';
  const hasSelection = selectedMallId !== null || isAdmin;
  const canClose = isAdmin || hasSelection;

  const { data: malls, isLoading } = useQuery({
    queryKey: ['malls'],
    queryFn: spacesApi.listMalls,
    enabled: isMallContextModalOpen,
  });
  const mallList: any[] = malls?.data ?? malls ?? [];

  async function select(mallId: string | null, name?: string) {
    setSelectedMall(mallId, name ?? 'Tất cả Mall');
    await authApi.setActiveMall(mallId);
    qc.invalidateQueries();
    closeMallContextModal();
  }

  return (
    <Dialog
      open={isMallContextModalOpen}
      onOpenChange={(open) => { if (!open && canClose) closeMallContextModal(); }}
    >
      <DialogContent
        className="max-w-md p-0 overflow-hidden"
        onInteractOutside={(e) => { if (!canClose) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!canClose) e.preventDefault(); }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Building2 size={18} className="text-gray-500" />
            Chọn Mall làm việc
          </DialogTitle>
          {!hasSelection && (
            <p className="text-sm text-gray-500 mt-1">Bạn cần chọn mall để tiếp tục.</p>
          )}
        </DialogHeader>

        <div className="py-3 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">Đang tải...</div>
          ) : (
            <>
              {isAdmin && (
                <MallOption
                  icon={<Globe size={18} className="text-blue-500" />}
                  name="Tất cả Mall"
                  description="Xem dữ liệu toàn hệ thống"
                  selected={selectedMallId === null}
                  onSelect={() => select(null)}
                />
              )}
              {mallList.map((m: any) => (
                <MallOption
                  key={m.id}
                  icon={<Building2 size={18} className="text-gray-500" />}
                  name={m.name}
                  description={m.address ?? m.city ?? undefined}
                  selected={selectedMallId === m.id}
                  onSelect={() => select(m.id, m.name)}
                />
              ))}
              {mallList.length === 0 && !isLoading && (
                <div className="px-6 py-8 text-center text-sm text-gray-400">Không có mall nào.</div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MallOption({
  icon, name, description, selected, onSelect,
}: {
  icon: React.ReactNode;
  name: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-gray-50 ${
        selected ? 'bg-blue-50' : ''
      }`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
        selected ? 'border-blue-200 bg-blue-100' : 'border-gray-200 bg-gray-50'
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${selected ? 'text-blue-700' : 'text-gray-900'}`}>{name}</div>
        {description && <div className="text-xs text-gray-400 truncate">{description}</div>}
      </div>
      {selected && <Check size={16} className="text-blue-600 shrink-0" />}
    </button>
  );
}
