import api from '@/lib/axios';

export const categoriesApi = {
  // Category CRUD
  list: (includeInactive?: boolean) =>
    api.get('/categories', { params: includeInactive ? { includeInactive: 'true' } : undefined }).then((r) => r.data),
  getTree: (includeInactive?: boolean) =>
    api.get('/categories/tree', { params: includeInactive ? { includeInactive: 'true' } : undefined }).then((r) => r.data),
  getOptions: () => api.get('/categories/options').then((r) => r.data),
  get: (id: string) => api.get(`/categories/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/categories', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/categories/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/categories/${id}`).then((r) => r.data),

  // Category Pricing
  listPricing: (params?: { mallId?: string; categoryId?: string; includeInactive?: boolean }) =>
    api.get('/categories/pricing/list', { params }).then((r) => r.data),
  getPricing: (id: string) => api.get(`/categories/pricing/${id}`).then((r) => r.data),
  createPricing: (data: Record<string, unknown>) => api.post('/categories/pricing', data).then((r) => r.data),
  updatePricing: (id: string, data: Record<string, unknown>) =>
    api.patch(`/categories/pricing/${id}`, data).then((r) => r.data),
  deletePricing: (id: string) => api.delete(`/categories/pricing/${id}`).then((r) => r.data),

  // Price lookup
  lookupPricing: (params: { mallId: string; categoryId: string; floorId?: string; zoneId?: string }) =>
    api.get('/categories/pricing/lookup', { params }).then((r) => r.data),
  validatePrice: (data: { mallId: string; categoryId: string; floorId?: string; zoneId?: string; proposedRentPerSqm: number }) =>
    api.post('/categories/pricing/validate', data).then((r) => r.data),
  getMallPricingSummary: (mallId: string) =>
    api.get(`/categories/pricing/mall/${mallId}/summary`).then((r) => r.data),
};
