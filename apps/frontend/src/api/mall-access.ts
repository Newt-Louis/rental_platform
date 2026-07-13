import api from '@/lib/axios';

export const mallAccessApi = {
  getMyMalls: () => api.get('/mall-access/my-malls').then((r) => r.data),
  getUsersForMall: (mallId: string) =>
    api.get(`/mall-access/mall/${mallId}/users`).then((r) => r.data),
  listForUser: (userId: string) =>
    api.get(`/mall-access/users/${userId}`).then((r) => r.data),
  grant: (data: { userId: string; mallId: string; role: string }) =>
    api.post('/mall-access/grant', data).then((r) => r.data),
  revoke: (userId: string, mallId: string) =>
    api.delete(`/mall-access/${userId}/${mallId}`).then((r) => r.data),
};
