import { create } from 'zustand';
import type { ActionFlags } from '@/api/permissions';

interface PermissionsStore {
  // null = not fetched yet (or fetch failed) -- canAccessModule() falls back
  // to the static ROUTE_PERMISSIONS table in that case.
  allowedModules: Set<string> | null;
  // module -> View/Create/Update/Delete for the current user (role matrix with
  // the user's own overrides applied). null = not fetched yet.
  moduleActions: Record<string, ActionFlags> | null;
  setAllowedModules: (modules: string[]) => void;
  setModuleActions: (actions: Record<string, ActionFlags>) => void;
  reset: () => void;
}

export const usePermissionsStore = create<PermissionsStore>((set) => ({
  allowedModules: null,
  moduleActions: null,
  setAllowedModules: (modules) => set({ allowedModules: new Set(modules) }),
  setModuleActions: (moduleActions) => set({ moduleActions }),
  reset: () => set({ allowedModules: null, moduleActions: null }),
}));
