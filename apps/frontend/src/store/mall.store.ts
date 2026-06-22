import { create } from 'zustand';

interface MallStore {
  selectedMallId: string | null;
  selectedMallName: string;
  setSelectedMall: (id: string | null, name?: string) => void;
}

export const useMallStore = create<MallStore>((set) => ({
  selectedMallId: null,
  selectedMallName: 'Tất cả Mall',
  setSelectedMall: (id, name = 'Tất cả Mall') =>
    set({ selectedMallId: id, selectedMallName: name }),
}));
