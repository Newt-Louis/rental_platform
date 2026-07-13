import api from '@/lib/axios';

export const aiApi = {
  chat: (message: string, history: { role: string; content: string }[]) =>
    api.post('/ai/chat', { message, history }).then((r) => r.data),
  suggestions: () => api.get('/ai/suggestions').then((r) => r.data),
};

export const floorPlanApi = {
  analyze: (file: File, mallId: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('mallId', mallId);
    return api
      .post('/ai/floor-plan/analyze', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
  listAnalyses: (mallId: string) =>
    api.get('/ai/floor-plan/analyses', { params: { mallId } }).then((r) => r.data),
  getAnalysis: (id: string) =>
    api.get(`/ai/floor-plan/analyses/${id}`).then((r) => r.data),
  pollStatus: (id: string) =>
    api.get(`/ai/floor-plan/analyses/${id}/status`).then((r) => r.data),
  apply: (id: string) =>
    api.post(`/ai/floor-plan/analyses/${id}/apply`).then((r) => r.data),
};
