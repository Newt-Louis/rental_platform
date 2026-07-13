import api from '@/lib/axios';

export const announcementsApi = {
  list: (mallId?: string) =>
    api.get('/announcements', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post('/announcements', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/announcements/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/announcements/${id}`).then((r) => r.data),
};
