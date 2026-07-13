import api from '@/lib/axios';

export const auditLogApi = {
  listLogs: (params?: Record<string, unknown>) => api.get('/audit-logs', { params }).then((r) => r.data),
  listEntityTypes: () => api.get('/audit-logs/entity-types').then((r) => r.data),
  getStats: (dateFrom?: string) => api.get('/audit-logs/stats', { params: { dateFrom } }).then((r) => r.data),
};
