import { create } from 'zustand';

interface PermissionsStore {
  // null = not fetched yet (or fetch failed) -- canAccessModule() falls back
  // to the static ROUTE_PERMISSIONS table in that case.
  allowedModules: Set<string> | null;
  setAllowedModules: (modules: string[]) => void;
  reset: () => void;
}

export const usePermissionsStore = create<PermissionsStore>((set) => ({
  allowedModules: null,
  setAllowedModules: (modules) => set({ allowedModules: new Set(modules) }),
  reset: () => set({ allowedModules: null }),
}));
