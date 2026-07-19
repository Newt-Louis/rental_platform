import api from '@/lib/axios';

export const ticketsApi = {
  listMyUnits: () => api.get('/tickets/my-units').then((r) => r.data),
  listTickets: (params?: Record<string, unknown>) =>
    api.get('/tickets', { params }).then((r) => r.data),
  createTicket: (data: Record<string, unknown>) =>
    api.post('/tickets', data).then((r) => r.data),
  getTicket: (id: string) => api.get(`/tickets/${id}`).then((r) => r.data),
  updateTicket: (id: string, data: Record<string, unknown>) =>
    api.put(`/tickets/${id}`, data).then((r) => r.data),
  addComment: (id: string, text: string, isInternal?: boolean) =>
    api.post(`/tickets/${id}/comments`, { text, isInternal }).then((r) => r.data),
  assignTicket: (id: string, userId: string) =>
    api.put(`/tickets/${id}/assign`, { userId }).then((r) => r.data),
  getStats: (mallId?: string) => api.get('/tickets/stats', { params: { mallId } }).then((r) => r.data),
  listSlaPolicies: () => api.get('/tickets/sla/policies').then((r) => r.data),
  upsertSlaPolicy: (data: Record<string, unknown>) => api.post('/tickets/sla/policies', data).then((r) => r.data),
  getSlaStats: () => api.get('/tickets/sla/stats').then((r) => r.data),
  getEscalations: (id: string) => api.get(`/tickets/${id}/escalations`).then((r) => r.data),
  transitionStatus: (id: string, status: string) =>
    api.patch(`/tickets/${id}/status`, { status }).then((r) => r.data),
  listPhotos: (id: string) => api.get(`/tickets/${id}/photos`).then((r) => r.data),
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/tickets/${id}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
};

export const maintenanceApi = {
  list: (mallId?: string) =>
    api.get('/tickets/maintenance', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/tickets/maintenance', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/tickets/maintenance/${id}`, data).then((r) => r.data),
  execute: (id: string) => api.put(`/tickets/maintenance/${id}/execute`).then((r) => r.data),
  start: (id: string) => api.post(`/tickets/maintenance/${id}/start`).then((r) => r.data),
  complete: (id: string, data: { notes?: string; checklistResult?: Record<string, boolean>; evidence: File[] }) => {
    const form = new FormData();
    if (data.notes) form.append('notes', data.notes);
    if (data.checklistResult) form.append('checklistResult', JSON.stringify(data.checklistResult));
    data.evidence.forEach((file) => form.append('evidence', file));
    return api.post(`/tickets/maintenance/${id}/complete`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  sendReminders: () => api.post('/tickets/maintenance/reminders/run').then((r) => r.data),
};
