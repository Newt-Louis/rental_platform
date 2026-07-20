import api from '@/lib/axios';

export const proposalsApi = {
  listProposals: (params?: Record<string, unknown>) =>
    api.get('/proposals', { params }).then((r) => r.data),
  getStats: () => api.get('/proposals/stats/overview').then((r) => r.data),
  createProposal: (data: Record<string, unknown>) =>
    api.post('/proposals', data).then((r) => r.data),
  getProposal: (id: string) => api.get(`/proposals/${id}`).then((r) => r.data),
  updateProposal: (id: string, data: Record<string, unknown>) =>
    api.put(`/proposals/${id}`, data).then((r) => r.data),
  submitProposal: (id: string) =>
    api.post(`/proposals/${id}/submit`).then((r) => r.data),
  convertProposal: (id: string) =>
    api.post(`/proposals/${id}/convert`).then((r) => r.data),
  exportPdf: (id: string) =>
    api.get(`/proposals/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data),
  listVersions: (id: string) => api.get(`/proposals/${id}/versions`).then((r) => r.data),
  getVersion: (id: string, version: number) =>
    api.get(`/proposals/${id}/versions/${version}`).then((r) => r.data),
  compareVersions: (id: string, from: number, to: number) =>
    api.get(`/proposals/${id}/versions/compare`, { params: { from, to } }).then((r) => r.data),
  rejectProposal: (id: string, rejectionReason: string) =>
    api.post(`/proposals/${id}/reject`, { rejectionReason }).then((r) => r.data),
  deleteProposal: (id: string) =>
    api.delete(`/proposals/${id}`).then((r) => r.data),
  saveEditorContent: (id: string, editorContent: any) =>
    api.patch(`/proposals/${id}/editor-content`, { editorContent }).then((r) => r.data),
  updateDocFields: (id: string, data: Record<string, unknown>) =>
    api.patch(`/proposals/${id}/doc-fields`, data).then((r) => r.data),
};

export const proposalScenariosApi = {
  list: (proposalId: string) => api.get(`/proposals/${proposalId}/scenarios`).then((r) => r.data),
  create: (proposalId: string, data: Record<string, unknown>) =>
    api.post(`/proposals/${proposalId}/scenarios`, data).then((r) => r.data),
  update: (proposalId: string, scenarioId: string, data: Record<string, unknown>) =>
    api.patch(`/proposals/${proposalId}/scenarios/${scenarioId}`, data).then((r) => r.data),
  select: (proposalId: string, scenarioId: string) =>
    api.post(`/proposals/${proposalId}/scenarios/${scenarioId}/select`).then((r) => r.data),
  delete: (proposalId: string, scenarioId: string) =>
    api.delete(`/proposals/${proposalId}/scenarios/${scenarioId}`).then((r) => r.data),
};
