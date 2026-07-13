import React, { useState } from 'react';
import Selecto from 'react-selecto';
import { useDragSelect, DRAG_SELECT_CLASS } from '@/hooks/useDragSelect';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { useSpacesStore } from '@/store/spaces.store';
import { BulkSelectionBar } from '@/components/BulkSelectionBar';
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

  const { gridRef, selectoRef, selectoProps } = useDragSelect({
    onSelect: selectAll,
    onClear: clearSelection,
    idAttribute: 'data-unit-id',
  });

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
      {/* Floating Bulk Selection Bar */}
      {selectionMode && (
        <BulkSelectionBar
          selectedCount={selectedIds.size}
          totalCount={units.length}
          onSelectAll={() => selectAll(units.map(u => u.id))}
          onClear={clearSelection}
        >
          {selectedIds.size >= 2 && selectedIds.size <= 5 && (
            <Button size="sm" variant="ghost" className="text-white hover:bg-gray-800 gap-1.5 shrink-0" onClick={() => setCompareOpen(true)}>
              <Columns size={14} /> So sánh
            </Button>
          )}
          {selectedIds.size >= 2 && (
            <Button size="sm" variant="ghost" className="text-violet-300 hover:bg-gray-800 gap-1.5 shrink-0" onClick={() => setMergeDialogOpen(true)}>
              <GitMerge size={14} /> Gộp sảnh
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-white hover:bg-gray-800 gap-1.5 shrink-0" onClick={() => setBulkActionOpen('status')}>
            <RefreshCw size={14} /> Đổi trạng thái
          </Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-gray-800 gap-1.5 shrink-0" onClick={() => setBulkActionOpen('category')}>
            <Filter size={14} /> Đổi ngành hàng
          </Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-gray-800 gap-1.5 shrink-0" onClick={() => setBulkActionOpen('rent')}>
            <DollarSign size={14} /> Đổi giá thuê
          </Button>
        </BulkSelectionBar>
      )}

      {/* Unit Grid */}
      <div className="text-sm text-gray-400 mb-3">{units.length} mặt bằng</div>
      {selectionMode && (
        <Selecto ref={selectoRef} container={gridRef.current} {...selectoProps} />
      )}
      <div
        ref={gridRef}
        className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 select-none"
      >
        {units.map((unit) => (
          <div key={unit.id} className={`${DRAG_SELECT_CLASS} h-full`} data-unit-id={unit.id}>
            <UnitCard
              unit={unit}
              onClick={() => onUnitClick(unit)}
              selectionMode={selectionMode}
              isSelected={selectedIds.has(unit.id)}
              onToggleSelect={() => toggleSelect(unit.id)}
              slotSummary={slotSummaries[unit.id]}
            />
          </div>
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
