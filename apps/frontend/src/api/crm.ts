import api from '@/lib/axios';

export const crmApi = {
  listLeads: (params?: Record<string, unknown>) =>
    api.get('/crm/leads', { params }).then((r) => r.data),
  createLead: (data: Record<string, unknown>) =>
    api.post('/crm/leads', data).then((r) => r.data),
  updateLead: (id: string, data: Record<string, unknown>) =>
    api.put(`/crm/leads/${id}`, data).then((r) => r.data),
  deleteLead: (id: string) => api.delete(`/crm/leads/${id}`).then((r) => r.data),
  pipeline: (limit?: number, mallId?: string) => api.get('/crm/pipeline', { params: { limit, mallId } }).then((r) => r.data),
  stats: (mallId?: string) => api.get('/crm/stats', { params: { mallId } }).then((r) => r.data),
  getLead: (id: string) => api.get(`/crm/leads/${id}`).then((r) => r.data),
  getLeadTimeline: (id: string) => api.get(`/crm/leads/${id}/timeline`).then((r) => r.data),
  getDeals: (params?: Record<string, unknown>) =>
    api.get('/crm/deals', { params }).then((r) => r.data),
  addActivity: (leadId: string, data: Record<string, unknown>) =>
    api.post(`/crm/leads/${leadId}/activities`, data).then((r) => r.data),
  createCustomerProfile: (leadId: string) =>
    api.post(`/crm/leads/${leadId}/customer-profile`).then((r) => r.data),
  syncLeadToCustomer: (leadId: string, customerId: string) =>
    api.post(`/crm/leads/${leadId}/sync-customer`, { customerId }).then((r) => r.data),
  moveLead: (id: string, status: string, position: number) =>
    api.put(`/crm/leads/${id}/move`, { status, position }).then((r) => r.data),
  bulkAction: (action: string, leadIds: string[], data?: Record<string, unknown>) =>
    api.post('/crm/leads/bulk', { action, leadIds, data }).then((r) => r.data),
  pipelineStats: (mallId?: string) => api.get('/crm/pipeline/stats', { params: { mallId } }).then((r) => r.data),
  staleLeads: (days?: number, mallId?: string) => api.get('/crm/stale-leads', { params: { days, mallId } }).then((r) => r.data),
  autoMoveStale: (days?: number) => api.post('/crm/leads/auto-move-stale', null, { params: days ? { days } : undefined }).then((r) => r.data),
  autoAssign: (id: string) => api.post(`/crm/leads/${id}/auto-assign`).then((r) => r.data),
  autoFollowUp: (id: string, daysFromNow?: number, note?: string) =>
    api.post(`/crm/leads/${id}/auto-followup`, { note }, { params: daysFromNow ? { daysFromNow } : undefined }).then((r) => r.data),
};

export const customersApi = {
  listCustomers: (params?: Record<string, unknown>) =>
    api.get('/crm/customers', { params }).then((r) => r.data),
  getCustomer: (id: string) =>
    api.get(`/crm/customers/${id}`).then((r) => r.data),
  createCustomer: (data: Record<string, unknown>) =>
    api.post('/crm/customers', data).then((r) => r.data),
  updateCustomer: (id: string, data: Record<string, unknown>) =>
    api.put(`/crm/customers/${id}`, data).then((r) => r.data),
  deleteCustomer: (id: string) =>
    api.delete(`/crm/customers/${id}`).then((r) => r.data),
  stats: () => api.get('/crm/customers/stats').then((r) => r.data),
  addActivity: (id: string, data: Record<string, unknown>) =>
    api.post(`/crm/customers/${id}/activities`, data).then((r) => r.data),
  linkTenant: (id: string, tenantId: string) =>
    api.patch(`/crm/customers/${id}/link-tenant`, { tenantId }).then((r) => r.data),
};

export const followUpApi = {
  list: (params?: Record<string, unknown>) => api.get('/crm/follow-ups', { params }).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/crm/follow-ups', data).then((r) => r.data),
  complete: (id: string) => api.put(`/crm/follow-ups/${id}/complete`).then((r) => r.data),
  delete: (id: string) => api.delete(`/crm/follow-ups/${id}`).then((r) => r.data),
};
