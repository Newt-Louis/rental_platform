import api from '@/lib/axios';

export const sapApi = {
  getLogs: (params?: Record<string, unknown>) =>
    api.get('/sap/logs', { params }).then((r) => r.data),
  syncCustomer: (tenantId: string) =>
    api.post('/sap/sync/customer', { tenantId }).then((r) => r.data),
  syncInvoice: (invoiceId: string) =>
    api.post('/sap/sync/invoice', { invoiceId }).then((r) => r.data),
  listReconciliation: (params?: Record<string, unknown>) =>
    api.get('/sap/reconciliation', { params }).then((r) => r.data),
  runReconciliation: () => api.post('/sap/reconciliation/run').then((r) => r.data),
  listMappings: (params?: Record<string, unknown>) =>
    api.get('/sap/mappings', { params }).then((r) => r.data),
  getMappingSummary: () =>
    api.get('/sap/mappings/summary').then((r) => r.data),
  upsertMapping: (data: Record<string, unknown>) =>
    api.post('/sap/mappings', data).then((r) => r.data),
  syncPendingMappings: () =>
    api.post('/sap/mappings/sync-pending').then((r) => r.data),
  getStats: () =>
    api.get('/sap/stats').then((r) => r.data),
};
