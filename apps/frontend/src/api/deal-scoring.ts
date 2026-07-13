import api from '@/lib/axios';

export const dealScoringApi = {
  listCriteria: () => api.get('/deal-scoring/criteria').then((r) => r.data),
  upsertCriterion: (data: Record<string, unknown>) =>
    api.post('/deal-scoring/criteria', data).then((r) => r.data),
  scoreProposal: (id: string) => api.post(`/deal-scoring/proposals/${id}`).then((r) => r.data),
};
