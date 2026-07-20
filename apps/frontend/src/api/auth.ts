import api from '@/lib/axios';

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  setActiveMall: (mallId: string | null) =>
    api.patch('/auth/me/active-mall', { mallId }).then((r) => r.data),
};

export const authLogout = () => api.post('/auth/logout').then((r) => r.data);
