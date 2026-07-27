import api from '@/lib/axios';

export const dashboardApi = {
  getDashboard: (mallId?: string, forceRefresh?: boolean) =>
    api.get('/dashboard', { params: { mallId: mallId || undefined, refresh: forceRefresh ? 'true' : undefined } }).then((r) => r.data),
  getCrossMallDashboard: () => api.get('/dashboard/cross-mall').then((r) => r.data),
};
