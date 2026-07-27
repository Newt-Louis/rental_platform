import api from '@/lib/axios';

export const contractsApi = {
  listContracts: (params?: Record<string, unknown>) =>
    api.get('/contracts', { params }).then((r) => r.data),
  getContract: (id: string) => api.get(`/contracts/${id}`).then((r) => r.data),
  createContract: (data: Record<string, unknown>) =>
    api.post('/contracts', data).then((r) => r.data),
  uploadFile: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post(`/contracts/${id}/files`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  expiring: (mallId?: string, days?: number) => api.get('/contracts/expiring', { params: { mallId, days } }).then((r) => r.data),
  listTemplates: () => api.get('/contracts/templates').then((r) => r.data),
  getTemplate: (id: string) => api.get(`/contracts/templates/${id}`).then((r) => r.data),
  renderTemplate: (contractId: string, templateId: string) =>
    api.post(`/contracts/${contractId}/render-template`, { templateId }).then((r) => r.data),
  listAmendments: (contractId: string) =>
    api.get(`/contracts/${contractId}/amendments`).then((r) => r.data),
  createAmendment: (contractId: string, data: Record<string, unknown>) =>
    api.post(`/contracts/${contractId}/amendments`, data).then((r) => r.data),
  submitAmendment: (contractId: string, amendmentId: string) =>
    api.post(`/contracts/${contractId}/amendments/${amendmentId}/submit`).then((r) => r.data),
  approveAmendment: (contractId: string, amendmentId: string) =>
    api.post(`/contracts/${contractId}/amendments/${amendmentId}/approve`).then((r) => r.data),
  getEvents: (contractId: string) => api.get(`/contracts/${contractId}/events`).then((r) => r.data),
  listFiles: (contractId: string) => api.get(`/contracts/${contractId}/files`).then((r) => r.data),
  deleteFile: (contractId: string, fileId: string) =>
    api.delete(`/contracts/${contractId}/files/${fileId}`).then((r) => r.data),
  signFile: (contractId: string, fileId: string, body: { signerName: string; signerRole: string }) =>
    api.post(`/contracts/${contractId}/files/${fileId}/sign`, body).then((r) => r.data),
  verifyFile: (verifyCode: string) => api.get(`/contracts/verify/${verifyCode}`).then((r) => r.data),
  getActivationReadiness: (contractId: string) =>
    api.get(`/contracts/${contractId}/activation-readiness`).then((r) => r.data),
  updateStatus: (contractId: string, status: string) =>
    api.patch(`/contracts/${contractId}/status`, { status }).then((r) => r.data),
};

export const terminationApi = {
  get: (contractId: string) => api.get(`/contracts/${contractId}/termination`).then((r) => r.data),
  initiate: (contractId: string, data: Record<string, unknown>) =>
    api.post(`/contracts/${contractId}/termination`, data).then((r) => r.data),
  update: (contractId: string, data: Record<string, unknown>) =>
    api.patch(`/contracts/${contractId}/termination`, data).then((r) => r.data),
  complete: (contractId: string) =>
    api.post(`/contracts/${contractId}/termination/complete`).then((r) => r.data),
  cancel: (contractId: string) =>
    api.post(`/contracts/${contractId}/termination/cancel`).then((r) => r.data),
};
