import api from '@/lib/axios';

export const dashboardApi = {
  getDashboard: (mallId?: string) =>
    api.get('/dashboard', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  getCrossMallDashboard: () => api.get('/dashboard/cross-mall').then((r) => r.data),
};
