import api from '@/lib/axios';

export const analyticsApi = {
  getOccupancyV2: (params?: { mallId?: string; floorId?: string; category?: string }) =>
    api.get('/analytics/occupancy', { params }).then((r) => r.data),
  getOccupancyTrend: (params?: { mallId?: string; months?: number }) =>
    api.get('/analytics/occupancy/trend', { params }).then((r) => r.data),
  getVacancyAnalysis: (mallId?: string) =>
    api.get('/analytics/vacancy', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  getRenewalRiskDashboard: (mallId?: string) =>
    api.get('/analytics/renewal-risk', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  calculateRenewalRisk: (contractId: string) =>
    api.post(`/analytics/renewal-risk/${contractId}`).then((r) => r.data),
  getMultiMallComparison: () => api.get('/analytics/multi-mall').then((r) => r.data),
  getMallPolicy: (mallId: string) => api.get(`/analytics/mall-policy/${mallId}`).then((r) => r.data),
  upsertMallPolicy: (mallId: string, data: { policies: Record<string, unknown>; kpiTargets?: Record<string, unknown> }) =>
    api.post(`/analytics/mall-policy/${mallId}`, data).then((r) => r.data),
  listComplianceExports: (params?: { mallId?: string; status?: string }) =>
    api.get('/analytics/compliance/exports', { params }).then((r) => r.data),
  requestComplianceExport: (data: { exportType: string; mallId?: string; periodStart: string; periodEnd: string }) =>
    api.post('/analytics/compliance/exports', data).then((r) => r.data),
  generateComplianceExport: (id: string) =>
    api.post(`/analytics/compliance/exports/${id}/generate`).then((r) => r.data),
  triggerMonthlyReports: () =>
    api.post('/analytics/compliance/exports/generate-monthly').then((r) => r.data),
  getDefaultRetention: () =>
    api.get('/analytics/compliance/retention/default').then((r) => r.data),
  getMallRetention: (mallId: string) =>
    api.get(`/analytics/compliance/retention/${mallId}`).then((r) => r.data),
  updateMallRetention: (mallId: string, retentionDays: Record<string, number>) =>
    api.put(`/analytics/compliance/retention/${mallId}`, { retentionDays }).then((r) => r.data),
};
