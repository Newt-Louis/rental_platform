import { create } from 'zustand';
import type { Unit } from '@/types';

interface SpacesState {
  selectedUnit: Unit | null;
  setSelectedUnit: (unit: Unit | null) => void;
  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  compareOpen: boolean;
  setCompareOpen: (v: boolean) => void;
  mergeDialogOpen: boolean;
  setMergeDialogOpen: (v: boolean) => void;
  mapEditorMode: boolean;
  setMapEditorMode: (v: boolean) => void;
  mapEditorFloorId: string | null;
  setMapEditorFloorId: (id: string | null) => void;
  reset: () => void;
}

export const useSpacesStore = create<SpacesState>()((set) => ({
  selectedUnit: null,
  setSelectedUnit: (unit) => set({ selectedUnit: unit }),

  selectionMode: false,
  setSelectionMode: (v) => set({ selectionMode: v }),

  selectedIds: new Set<string>(),
  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  selectAll: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),

  compareOpen: false,
  setCompareOpen: (v) => set({ compareOpen: v }),

  mergeDialogOpen: false,
  setMergeDialogOpen: (v) => set({ mergeDialogOpen: v }),

  mapEditorMode: false,
  setMapEditorMode: (v) => set({ mapEditorMode: v }),

  mapEditorFloorId: null,
  setMapEditorFloorId: (id) => set({ mapEditorFloorId: id }),

  reset: () =>
    set({
      selectedUnit: null,
      selectionMode: false,
      selectedIds: new Set(),
      compareOpen: false,
      mergeDialogOpen: false,
      mapEditorMode: false,
      mapEditorFloorId: null,
    }),
}));
