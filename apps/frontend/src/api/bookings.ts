import api from '@/lib/axios';

export const bookingApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/bookings', { params }).then((r) => r.data),
  stats: (mallId?: string) =>
    api.get('/bookings/stats', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  getUnitQueue: (unitId: string) =>
    api.get(`/bookings/unit/${unitId}/queue`).then((r) => r.data),
  get: (id: string) => api.get(`/bookings/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post('/bookings', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/bookings/${id}`, data).then((r) => r.data),
  updatePriority: (id: string, priority: number) =>
    api.patch(`/bookings/${id}/priority`, { priority }).then((r) => r.data),
  extend: (id: string, additionalDays: number, reason?: string) =>
    api.patch(`/bookings/${id}/extend`, { additionalDays, reason }).then((r) => r.data),
  cancel: (id: string, reason?: string) =>
    api.patch(`/bookings/${id}/cancel`, { reason }).then((r) => r.data),
  reinstate: (id: string) =>
    api.patch(`/bookings/${id}/reinstate`).then((r) => r.data),
  convertToProposal: (id: string, data: Record<string, unknown>) =>
    api.post(`/bookings/${id}/convert-to-proposal`, data).then((r) => r.data),
  // Price approval
  getPendingPriceApproval: (params?: { mallId?: string; page?: number; limit?: number }) =>
    api.get('/bookings/price-approval/pending', { params }).then((r) => r.data),
  approvePrice: (id: string, note?: string) =>
    api.patch(`/bookings/${id}/price/approve`, { note }).then((r) => r.data),
  rejectPrice: (id: string, reason: string) =>
    api.patch(`/bookings/${id}/price/reject`, { reason }).then((r) => r.data),
  softDelete: (id: string) =>
    api.delete(`/bookings/${id}`).then((r) => r.data),
};
