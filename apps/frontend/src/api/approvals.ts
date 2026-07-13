import api from '@/lib/axios';

export const approvalsApi = {
  pending: () => api.get('/approvals/pending').then((r) => r.data),
  approve: (id: string, comment?: string) =>
    api.post(`/approvals/${id}/approve`, { comment }).then((r) => r.data),
  reject: (id: string, comment?: string) =>
    api.post(`/approvals/${id}/reject`, { comment }).then((r) => r.data),
  listPolicyRules: () => api.get('/approvals/policy/rules').then((r) => r.data),
  createPolicyRule: (data: Record<string, unknown>) =>
    api.post('/approvals/policy/rules', data).then((r) => r.data),
  updatePolicyRule: (id: string, data: Record<string, unknown>) =>
    api.post(`/approvals/policy/rules/${id}`, data).then((r) => r.data),
};
