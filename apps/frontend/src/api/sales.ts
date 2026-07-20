import api from '@/lib/axios';

export const salesApi = {
  listSales: (params?: Record<string, unknown>) =>
    api.get('/sales', { params }).then((r) => r.data),
  createSales: (data: Record<string, unknown>) =>
    api.post('/sales', data).then((r) => r.data),
  salesSummary: (period: string) =>
    api.get('/sales/summary', { params: { period } }).then((r) => r.data),
  topTenants: (period: string) =>
    api.get('/sales/top-tenants', { params: { period } }).then((r) => r.data),
  getDeadlineStatus: (period: string) =>
    api.get('/sales/deadline', { params: { period } }).then((r) => r.data),
  getSubmissionUnits: () => api.get('/sales/submission-units').then((r) => r.data),
  getAuditTrail: (id: string) =>
    api.get(`/sales/${id}/audit`).then((r) => r.data),
  approveSales: (id: string) =>
    api.post(`/sales/${id}/approve`).then((r) => r.data),
  disputeSales: (id: string, reason: string) =>
    api.post(`/sales/${id}/dispute`, { reason }).then((r) => r.data),
};
