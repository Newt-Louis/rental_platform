import { create } from 'zustand';
import { User } from '@/types';
import api from '@/lib/axios';
import { useMallStore } from './mall.store';

interface AuthStore {
  user: User | null;
  token: string | null;
  isHydrated: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  isAuthenticated: () => boolean;
  setUser: (user: User) => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  isHydrated: false,
  login: (token, user) => {
    localStorage.setItem('token', token);
    set({ token, user, isHydrated: true });
  },
  logout: async () => {
    try {
      if (get().token) {
        await api.post('/auth/logout');
      }
    } catch {
      // revoke best-effort
    }
    localStorage.removeItem('token');
    set({ token: null, user: null, isHydrated: true });
  },
  isAuthenticated: () => !!get().token,
  setUser: (user) => set({ user }),
  hydrate: async () => {
    const token = get().token;
    if (!token) {
      set({ isHydrated: true });
      return;
    }
    try {
      const res = await api.get('/auth/me');
      const userData = res.data;
      set({ user: userData, isHydrated: true });
      const { activeMallId, activeMall } = userData;
      const { setSelectedMall, openMallContextModal } = useMallStore.getState();
      // Server context wins over stale browser storage; the Mall list validates access next.
      setSelectedMall(activeMallId ?? null, activeMall?.name);
      // Regular users must always have an active mall — open picker if missing
      if (userData.role !== 'ADMIN' && !activeMallId) {
        openMallContextModal();
      }
    } catch {
      localStorage.removeItem('token');
      set({ token: null, user: null, isHydrated: true });
    }
  },
}));
