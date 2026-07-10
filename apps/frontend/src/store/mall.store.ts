import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MallStore {
  selectedMallId: string | null;
  selectedMallName: string;
  setSelectedMall: (id: string | null, name?: string) => void;
}

export const useMallStore = create<MallStore>()(
  persist(
    (set) => ({
      selectedMallId: null,
      selectedMallName: 'Tất cả Mall',
      setSelectedMall: (id, name = 'Tất cả Mall') =>
        set({ selectedMallId: id, selectedMallName: name }),
    }),
    {
      name: 'thiso-selected-mall',
      partialize: (state) => ({
        selectedMallId: state.selectedMallId,
        selectedMallName: state.selectedMallName,
      }),
    },
  ),
);
