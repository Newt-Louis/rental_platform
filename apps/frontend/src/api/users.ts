import api from '@/lib/axios';

export const usersApi = {
  listUsers: (params?: Record<string, unknown>) => api.get('/users', { params }).then((r) => r.data),
  getStats: () => api.get('/users/stats').then((r) => r.data),
  getUser: (id: string) => api.get(`/users/${id}`).then((r) => r.data),
  updateUser: (id: string, data: Record<string, unknown>) =>
    api.patch(`/users/${id}`, data).then((r) => r.data),
  createUser: (data: Record<string, unknown>) =>
    api.post('/users', data).then((r) => r.data),
  resetPassword: (id: string, newPassword: string) =>
    api.post(`/users/${id}/reset-password`, { newPassword }).then((r) => r.data),
  deleteUser: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
};
