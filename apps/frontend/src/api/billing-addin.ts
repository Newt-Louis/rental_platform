import api from '@/lib/axios';

export const billingAddInApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/billing/addin', { params }).then((r) => r.data),
  detail: (id: string) => api.get(`/billing/addin/${id}`).then((r) => r.data),
  saveDraft: (id: string, inputData: Record<string, number>, notes?: string) =>
    api.post(`/billing/addin/${id}/draft`, { inputData, notes }).then((r) => r.data),
  confirmNoCharge: (id: string) =>
    api.post(`/billing/addin/${id}/no-charge`).then((r) => r.data),
  confirm: (id: string) =>
    api.post(`/billing/addin/${id}/confirm`).then((r) => r.data),
  reopen: (id: string) =>
    api.post(`/billing/addin/${id}/reopen`).then((r) => r.data),
};
