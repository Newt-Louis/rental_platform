import api from '@/lib/axios';

export type BookingUnitEligibilityMode = 'IMMEDIATE' | 'QUEUE' | 'BLOCKED';

export interface BookingUnitFinderRow {
  id: string;
  code: string;
  name?: string | null;
  mallId: string;
  floorId?: string | null;
  zoneId?: string | null;
  areaNLA: number;
  areaGFA: number;
  category?: string | null;
  status: string;
  leaseTermType: string;
  mall: { id: string; name: string; code?: string | null };
  floor?: { id: string; name: string; level?: string | null } | null;
  zone?: { id: string; name: string; code?: string | null } | null;
  currentEligibility: {
    selectable: boolean;
    mode: BookingUnitEligibilityMode;
    reasonCode?: string | null;
    queueCount: number;
  };
}

export interface BookingUnitFinderResponse {
  data: BookingUnitFinderRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const bookingApi = {
  findUnits: (params?: Record<string, unknown>): Promise<BookingUnitFinderResponse> =>
    api.get('/bookings/unit-finder', { params }).then((r) => r.data),
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
  cancel: (id: string, reason: string) =>
    api.patch(`/bookings/${id}/cancel`, { reason }).then((r) => r.data),
  reinstate: (id: string) =>
    api.patch(`/bookings/${id}/reinstate`).then((r) => r.data),
  convertToProposal: (id: string, data: Record<string, unknown>) =>
    api.post(`/bookings/${id}/convert-to-proposal`, data).then((r) => r.data),
  // Price approval
  getPendingPriceApproval: (params?: { mallId?: string; page?: number; limit?: number; leaseTermType?: string }) =>
    api.get('/bookings/price-approval/pending', { params }).then((r) => {
      const response = r.data;
      // Handle both array and paginated object responses
      if (Array.isArray(response)) return response;
      if (response?.data) return response;
      return { data: [], total: 0, page: 1, limit: 25, totalPages: 1 };
    }),
  approvePrice: (id: string, note?: string) =>
    api.patch(`/bookings/${id}/price/approve`, { note }).then((r) => r.data),
  rejectPrice: (id: string, reason: string) =>
    api.patch(`/bookings/${id}/price/reject`, { reason }).then((r) => r.data),
  softDelete: (id: string) =>
    api.delete(`/bookings/${id}`).then((r) => r.data),
};
