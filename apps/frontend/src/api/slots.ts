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
  calculatePrice: (slotId: string, type: string, startDatetime: string, endDatetime: string, area?: number) =>
    api.get(`/slots/${slotId}/price`, {
      params: { type, start: startDatetime, end: endDatetime, ...(area ? { area } : {}) },
    }).then((r) => r.data),
  createBooking: (slotId: string, data: Record<string, unknown>) =>
    api.post(`/slots/${slotId}/bookings`, data).then((r) => r.data),
  listAllBookings: (params: { unitId?: string; mallId?: string; status?: string; type?: string }) =>
    api.get(`/slots/bookings/all`, { params }).then((r) => r.data),
  getSummaries: (unitIds: string[]) =>
    api.get(`/slots/summaries`, { params: { unitIds: unitIds.join(',') } }).then((r) => r.data),
  updateSlotBooking: (bookingId: string, data: {
    installationStartDatetime?: string;
    installationEndDatetime?: string;
    startDatetime?: string;
    endDatetime?: string;
    dismantlingStartDatetime?: string;
    dismantlingEndDatetime?: string;
    discountPct?: number;
    notes?: string;
  }) =>
    api.patch(`/slots/bookings/${bookingId}`, data).then((r) => r.data),
  confirmBooking: (bookingId: string) =>
    api.patch(`/slots/bookings/${bookingId}/confirm`).then((r) => r.data),
  convertToProposal: (bookingId: string, data: { businessModel?: string; notes?: string }) =>
    api.post(`/slots/bookings/${bookingId}/convert-to-proposal`, data).then((r) => r.data),
  cancelBooking: (bookingId: string, reason?: string) =>
    api.patch(`/slots/bookings/${bookingId}/cancel`, { reason }).then((r) => r.data),
  deleteSlotBooking: (bookingId: string) =>
    api.delete(`/slots/bookings/${bookingId}`).then((r) => r.data),

  // Phe duyet mot cap: gui duyet -> duyet / tu choi; xung dot do nguoi co tham quyen xac nhan khoa / mo lai
  submitBooking: (bookingId: string) =>
    api.post(`/slots/bookings/${bookingId}/submit`).then((r) => r.data),
  approveBooking: (bookingId: string) =>
    api.post(`/slots/bookings/${bookingId}/approve`).then((r) => r.data),
  rejectBooking: (bookingId: string, reason?: string) =>
    api.post(`/slots/bookings/${bookingId}/reject`, { reason }).then((r) => r.data),
  confirmLock: (bookingId: string, reason?: string) =>
    api.post(`/slots/bookings/${bookingId}/confirm-lock`, { reason }).then((r) => r.data),
  dismissConflict: (bookingId: string) =>
    api.post(`/slots/bookings/${bookingId}/dismiss-conflict`).then((r) => r.data),
  reopenBooking: (bookingId: string) =>
    api.post(`/slots/bookings/${bookingId}/reopen`).then((r) => r.data),
  listNeedsAttention: (mallId?: string) =>
    api.get('/slots/bookings/needs-attention', { params: { mallId } }).then((r) => r.data),

  // Ngay le theo Mall (tinh gia cuoi tuan/le)
  listHolidays: (mallId: string) =>
    api.get('/slots/holidays', { params: { mallId } }).then((r) => r.data),
  addHoliday: (mallId: string, data: { date: string; name: string }) =>
    api.post('/slots/holidays', data, { params: { mallId } }).then((r) => r.data),
  deleteHoliday: (holidayId: string) =>
    api.delete(`/slots/holidays/${holidayId}`).then((r) => r.data),
};
