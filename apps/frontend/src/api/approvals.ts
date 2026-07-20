import api from '@/lib/axios';

export const approvalsApi = {
  pending: (params?: { page?: number; limit?: number; mallId?: string }) =>
    // Response interceptor đã đưa `data`, `total`, `page` lên cùng một object.
    // Giữ nguyên envelope phân trang để trang danh sách và badge dùng chung nguồn.
    api.get('/approvals/pending', { params }).then((r) => r.data),
  history: (params?: { page?: number; limit?: number; status?: string; mallId?: string }) =>
    api.get('/approvals/history', { params }).then((r) => r.data),
  getWorkflow: (id: string) => api.get(`/approvals/${id}`).then((r) => r.data),
  approve: (id: string, comment?: string) =>
    api.post(`/approvals/${id}/approve`, { comment }).then((r) => r.data),
  reject: (id: string, comment: string = '') =>
    api.post(`/approvals/${id}/reject`, { comment }).then((r) => r.data),
  listPolicyRules: () => api.get('/approvals/policy/rules').then((r) => r.data),
  createPolicyRule: (data: Record<string, unknown>) =>
    api.post('/approvals/policy/rules', data).then((r) => r.data),
  updatePolicyRule: (id: string, data: Record<string, unknown>) =>
    api.post(`/approvals/policy/rules/${id}`, data).then((r) => r.data),
};
