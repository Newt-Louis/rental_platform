import api from '@/lib/axios';

export const billingApi = {
  listInvoices: (params?: Record<string, unknown>) =>
    api.get('/billing/invoices', { params }).then((r) => r.data),
  createInvoice: (data: Record<string, unknown>) =>
    api.post('/billing/invoices', data).then((r) => r.data),
  getInvoice: (id: string) =>
    api.get(`/billing/invoices/${id}`).then((r) => r.data),
  issueInvoice: (id: string) =>
    api.post(`/billing/invoices/${id}/issue`).then((r) => r.data),
  recordPayment: (id: string, data: Record<string, unknown>) =>
    api.post(`/billing/invoices/${id}/payment`, data).then((r) => r.data),
  arAging: () => api.get('/billing/ar-aging').then((r) => r.data),
  getSchedule: (contractId: string) => api.get(`/billing/schedule/${contractId}`).then((r) => r.data),
  buildSchedule: (contractId: string) => api.post(`/billing/schedule/${contractId}/build`).then((r) => r.data),
  getInvoiceSummary: (id: string) => api.get(`/billing/invoices/${id}/summary`).then((r) => r.data),
  addInvoiceLine: (id: string, data: { type: string; description: string; qty: number; unitPrice: number }) =>
    api.post(`/billing/invoices/${id}/lines`, data).then((r) => r.data),
  updateInvoiceLine: (id: string, lineId: string, data: { description?: string; qty?: number; unitPrice?: number }) =>
    api.patch(`/billing/invoices/${id}/lines/${lineId}`, data).then((r) => r.data),
  removeInvoiceLine: (id: string, lineId: string) =>
    api.delete(`/billing/invoices/${id}/lines/${lineId}`).then((r) => r.data),
  voidInvoice: (id: string, reason: string) =>
    api.post(`/billing/invoices/${id}/void`, { reason }).then((r) => r.data),
  reversePayment: (paymentId: string, reason: string) =>
    api.post(`/billing/payments/${paymentId}/reverse`, { reason }).then((r) => r.data),
  generateDueInvoices: () => api.post('/billing/schedule/generate-due').then((r) => r.data),
  listDunningPolicies: () => api.get('/billing/dunning/policies').then((r) => r.data),
  runDunning: () => api.post('/billing/dunning/run').then((r) => r.data),
  getDunningLogs: (invoiceId: string) => api.get(`/billing/dunning/logs/${invoiceId}`).then((r) => r.data),
  getCollectionKpi: (months?: number) =>
    api.get('/billing/collection-kpi', { params: months ? { months } : undefined }).then((r) => r.data),
  listPenaltyPolicies: () => api.get('/billing/penalty/policies').then((r) => r.data),
  runPenalty: () => api.post('/billing/penalty/run').then((r) => r.data),
  getBillingConfig: () => api.get('/billing/config').then((r) => r.data),
  updateBillingConfig: (data: Record<string, unknown>) =>
    api.post('/billing/config', data).then((r) => r.data),
};
