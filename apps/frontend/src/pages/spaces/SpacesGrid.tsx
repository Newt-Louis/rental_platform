import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { useSpacesStore } from '@/store/spaces.store';
import { UnitCard } from '@/components/spaces/UnitCard';
import { CompareModal } from '@/components/spaces/CompareModal';
import { MergeUnitsDialog } from '@/components/spaces/dialogs/MergeUnitsDialog';
import { BulkStatusDialog, BulkCategoryDialog, BulkRentDialog } from '@/components/spaces/dialogs/BulkDialogs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Building2, Plus, Columns, RefreshCw, Filter, DollarSign, GitMerge,
} from 'lucide-react';
import type { Unit, UnitSlotSummary } from '@/types';

interface SpacesGridProps {
  units: Unit[];
  slotSummaries: Record<string, UnitSlotSummary>;
  isLoading: boolean;
  isAdmin: boolean;
  mallId?: string | null;
  onUnitClick: (unit: Unit) => void;
  onEditUnit: (unit: any) => void;
  onDeleteUnit: (unit: any) => void;
  onCreateUnit: () => void;
}

export function SpacesGrid({
  units,
  slotSummaries,
  isLoading,
  isAdmin,
  mallId,
  onUnitClick,
  onEditUnit,
  onDeleteUnit,
  onCreateUnit,
}: SpacesGridProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const {
    selectionMode,
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    setSelectionMode,
    compareOpen,
    setCompareOpen,
    mergeDialogOpen,
    setMergeDialogOpen,
  } = useSpacesStore();

  const [bulkActionOpen, setBulkActionOpen] = useState<'status' | 'category' | 'rent' | null>(null);

  const bulkMutation = useMutation({
    mutationFn: (params: { unitIds: string[]; updates: any }) => spacesApi.bulkUpdateUnits(params),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: `Đã cập nhật ${result.updated} mặt bằng` });
      clearSelection();
      setSelectionMode(false);
      setBulkActionOpen(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi cập nhật', variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: 15 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-4"><Skeleton className="h-20" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Bulk Selection Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 mb-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">
              Đã chọn {selectedIds.size} mặt bằng
            </span>
            <Button variant="ghost" size="sm" onClick={() => selectAll(units.map(u => u.id))} className="text-gray-700">
              Chọn tất cả ({units.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clearSelection()} className="text-gray-700">
              Bỏ chọn
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size >= 2 && selectedIds.size <= 5 && (
              <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)} className="gap-1.5">
                <Columns size={14} /> So sánh
              </Button>
            )}
            {/* GAP #2 — Gộp sảnh: chỉ hiện khi ≥2 unit được chọn */}
            {selectedIds.size >= 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMergeDialogOpen(true)}
                className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
              >
                <GitMerge size={14} /> Gộp sảnh
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('status')} className="gap-1.5">
              <RefreshCw size={14} /> Đổi trạng thái
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('category')} className="gap-1.5">
              <Filter size={14} /> Đổi ngành hàng
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('rent')} className="gap-1.5">
              <DollarSign size={14} /> Đổi giá thuê
            </Button>
          </div>
        </div>
      )}

      {/* Unit Grid */}
      <div className="text-sm text-gray-400 mb-3">{units.length} mặt bằng</div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {units.map((unit) => (
          <UnitCard
            key={unit.id}
            unit={unit}
            onClick={() => onUnitClick(unit)}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(unit.id)}
            onToggleSelect={() => toggleSelect(unit.id)}
            slotSummary={slotSummaries[unit.id]}
          />
        ))}
      </div>

      {/* Empty state */}
      {units.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={48} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Không tìm thấy mặt bằng</p>
          {mallId && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
              onClick={onCreateUnit}
            >
              <Plus size={14} /> Thêm mặt bằng đầu tiên
            </Button>
          )}
        </div>
      )}

      {/* Bulk Action Dialogs */}
      <BulkStatusDialog
        open={bulkActionOpen === 'status'}
        count={selectedIds.size}
        onClose={() => setBulkActionOpen(null)}
        onConfirm={(status) => bulkMutation.mutate({ unitIds: Array.from(selectedIds), updates: { status } })}
        loading={bulkMutation.isPending}
      />
      <BulkCategoryDialog
        open={bulkActionOpen === 'category'}
        count={selectedIds.size}
        onClose={() => setBulkActionOpen(null)}
        onConfirm={(category) => bulkMutation.mutate({ unitIds: Array.from(selectedIds), updates: { category } })}
        loading={bulkMutation.isPending}
      />
      <BulkRentDialog
        open={bulkActionOpen === 'rent'}
        count={selectedIds.size}
        onClose={() => setBulkActionOpen(null)}
        onConfirm={(rent, cam) => bulkMutation.mutate({ unitIds: Array.from(selectedIds), updates: { baseRentPerSqm: rent, camPerSqm: cam } })}
        loading={bulkMutation.isPending}
      />

      {/* Compare Modal */}
      <CompareModal
        unitIds={Array.from(selectedIds)}
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
      />

      {/* Merge Units Dialog */}
      <MergeUnitsDialog
        open={mergeDialogOpen}
        units={units.filter((u) => selectedIds.has(u.id))}
        mallId={mallId ?? ''}
        onClose={() => setMergeDialogOpen(false)}
      />
    </>
  );
}
