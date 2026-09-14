import api from '@/lib/axios';
import type {
  ProposalDocumentModel,
  ProposalDocumentSend,
  ProposalDocumentVersionSummary,
  ProposalSendContext,
  SaveProposalDocumentContentPayload,
  SendProposalDocumentPayload,
} from '@/pages/proposals/proposalDocument.types';

export const proposalsApi = {
  listProposals: (params?: Record<string, unknown>) =>
    api.get('/proposals', { params }).then((r) => r.data),
  getStats: (mallId?: string, leaseTermType?: string) => api.get('/proposals/stats/overview', { params: { mallId, leaseTermType } }).then((r) => r.data),
  createProposal: (data: Record<string, unknown>) =>
    api.post('/proposals', data).then((r) => r.data),
  getProposal: (id: string) => api.get(`/proposals/${id}`).then((r) => r.data),
  updateProposal: (id: string, data: Record<string, unknown>) =>
    api.put(`/proposals/${id}`, data).then((r) => r.data),
  /** reviewedFingerprint: the document fingerprint the author reviewed; stale → refused. */
  submitProposal: (id: string, reviewedFingerprint?: string) =>
    api.post(`/proposals/${id}/submit`, reviewedFingerprint ? { reviewedFingerprint } : {}).then((r) => r.data),
  convertProposal: (id: string, tenant?: Record<string, unknown>) =>
    api.post(`/proposals/${id}/convert`, tenant ? { tenant } : {}).then((r) => r.data),
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
  /** Canonical Tờ trình model (CR-PROPOSAL-DOCUMENT-SOURCE-001). */
  getDocument: (id: string): Promise<ProposalDocumentModel> =>
    api.get(`/proposals/${id}/document`).then((r) => r.data),
  saveDocumentContent: (id: string, body: SaveProposalDocumentContentPayload): Promise<ProposalDocumentModel> =>
    api.patch(`/proposals/${id}/document-content`, body).then((r) => r.data),
  // CR-PROPOSAL-DOCUMENT-FINALIZATION — immutable submitted versions, revision, external send.
  listDocumentVersions: (id: string): Promise<ProposalDocumentVersionSummary[]> =>
    api.get(`/proposals/${id}/document-versions`).then((r) => r.data),
  getDocumentVersion: (id: string, versionId: string): Promise<ProposalDocumentModel> =>
    api.get(`/proposals/${id}/document-versions/${versionId}`).then((r) => r.data),
  exportVersionPdf: (id: string, versionId: string) =>
    api.get(`/proposals/${id}/document-versions/${versionId}/pdf`, { responseType: 'blob' }).then((r) => r.data),
  startRevision: (id: string) => api.post(`/proposals/${id}/revise`).then((r) => r.data),
  getSendContext: (id: string): Promise<ProposalSendContext> =>
    api.get(`/proposals/${id}/send-context`).then((r) => r.data),
  sendDocument: (id: string, body: SendProposalDocumentPayload, idempotencyKey: string): Promise<ProposalDocumentSend> =>
    api.post(`/proposals/${id}/send`, body, { headers: { 'Idempotency-Key': idempotencyKey } }).then((r) => r.data),
  listSends: (id: string): Promise<ProposalDocumentSend[]> =>
    api.get(`/proposals/${id}/sends`).then((r) => r.data),
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
