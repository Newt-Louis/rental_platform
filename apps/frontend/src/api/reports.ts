import api from '@/lib/axios';

export const reportsApi = {
  occupancyReport: (params?: Record<string, unknown>) =>
    api.get('/reports/occupancy', { params }).then((r) => r.data),
  pipelineReport: () => api.get('/reports/pipeline').then((r) => r.data),
  revenueReport: (params?: Record<string, unknown>) =>
    api.get('/reports/revenue', { params }).then((r) => r.data),
  tenantSalesReport: (params?: Record<string, unknown>) =>
    api.get('/reports/tenant-sales', { params }).then((r) => r.data),
  contractExpiryReport: (params?: Record<string, unknown>) =>
    api.get('/reports/contract-expiry', { params }).then((r) => r.data),
  revenueReceivablesReport: (params?: Record<string, unknown>) =>
    api.get('/reports/revenue-receivables', { params }).then((r) => r.data),
  arAgingReport: () => api.get('/reports/ar-aging').then((r) => r.data),
  complianceReport: (params?: Record<string, unknown>) =>
    api.get('/reports/compliance', { params }).then((r) => r.data),
};
