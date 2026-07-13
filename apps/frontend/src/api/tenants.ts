import api from '@/lib/axios';

export const tenantsApi = {
  listTenants: (params?: Record<string, unknown>) =>
    api.get('/tenants', { params }).then((r) => r.data),
  getTenant: (id: string) => api.get(`/tenants/${id}`).then((r) => r.data),
  createTenant: (data: Record<string, unknown>) =>
    api.post('/tenants', data).then((r) => r.data),
  updateTenant: (id: string, data: Record<string, unknown>) =>
    api.put(`/tenants/${id}`, data).then((r) => r.data),
  deleteTenant: (id: string) => api.delete(`/tenants/${id}`).then((r) => r.data),
};
