import api from '@/lib/axios';

export const slotsApi = {
  listSlots: (unitId: string) =>
    api.get(`/slots/units/${unitId}`).then((r) => r.data),
  createSlot: (unitId: string, data: Record<string, unknown>) =>
    api.post(`/slots/units/${unitId}`, data).then((r) => r.data),
  createSlotGrid: (unitId: string, data: { rows: number; cols: number; slotType?: string }) =>
    api.post(`/slots/units/${unitId}/grid`, data).then((r) => r.data),
  updateSlot: (slotId: string, data: Record<string, unknown>) =>
    api.patch(`/slots/${slotId}`, data).then((r) => r.data),
  deleteSlot: (slotId: string) =>
    api.delete(`/slots/${slotId}`).then((r) => r.data),
  calculatePrice: (slotId: string, type: string, startDatetime: string, endDatetime: string) =>
    api.get(`/slots/${slotId}/price`, {
      params: { type, start: startDatetime, end: endDatetime },
    }).then((r) => r.data),
  createBooking: (slotId: string, data: Record<string, unknown>) =>
    api.post(`/slots/${slotId}/bookings`, data).then((r) => r.data),
  listAllBookings: (params: { unitId?: string; mallId?: string; status?: string; type?: string }) =>
    api.get(`/slots/bookings/all`, { params }).then((r) => r.data),
  getSummaries: (unitIds: string[]) =>
    api.get(`/slots/summaries`, { params: { unitIds: unitIds.join(',') } }).then((r) => r.data),
  updateSlotBooking: (bookingId: string, data: { startDatetime?: string; endDatetime?: string; discountPct?: number; notes?: string }) =>
    api.patch(`/slots/bookings/${bookingId}`, data).then((r) => r.data),
  confirmBooking: (bookingId: string) =>
    api.patch(`/slots/bookings/${bookingId}/confirm`).then((r) => r.data),
  cancelBooking: (bookingId: string, reason?: string) =>
    api.patch(`/slots/bookings/${bookingId}/cancel`, { reason }).then((r) => r.data),
  deleteSlotBooking: (bookingId: string) =>
    api.delete(`/slots/bookings/${bookingId}`).then((r) => r.data),
};
