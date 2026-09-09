import api from '@/lib/axios';

export const tenantsApi = {
  listTenants: (params?: Record<string, unknown>) =>
    api.get('/tenants', { params }).then((r) => r.data),
  getTenant: (id: string) => api.get(`/tenants/${id}`).then((r) => r.data),
  getFitoutArchive: (id: string, params?: { search?: string; page?: number; limit?: number }) =>
    api.get(`/tenants/${id}/fitout-archive`, { params }).then((r) => r.data),
  searchFitoutArchive: (params?: { tenantId?: string; mallId?: string; search?: string; page?: number; limit?: number }) =>
    api.get('/tenants/fitout-archive', { params }).then((r) => r.data),
  createTenant: (data: Record<string, unknown>) =>
    api.post('/tenants', data).then((r) => r.data),
  updateTenant: (id: string, data: Record<string, unknown>) =>
    api.put(`/tenants/${id}`, data).then((r) => r.data),
  deleteTenant: (id: string) => api.delete(`/tenants/${id}`).then((r) => r.data),
  resetPortalPassword: (id: string) =>
    api.post(`/tenants/${id}/portal/reset-password`).then((r) => r.data),
  createPortalAccount: (id: string) =>
    api.post(`/tenants/${id}/portal/account`).then((r) => r.data),
  setPortalPassword: (id: string, newPassword: string) =>
    api.patch(`/tenants/${id}/portal/password`, { newPassword }).then((r) => r.data),
};
