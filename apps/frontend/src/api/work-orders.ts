import api from "@/lib/axios";
export const workOrdersApi = {
  templates: (params?: Record<string, unknown>) =>
    api.get("/work-orders/templates", { params }).then((r) => r.data),
  createTemplate: (data: Record<string, unknown>) =>
    api.post("/work-orders/templates", data).then((r) => r.data),
  updateTemplate: (id: string, data: Record<string, unknown>) =>
    api.put(`/work-orders/templates/${id}`, data).then((r) => r.data),
  toggleTemplate: (id: string, isActive: boolean) =>
    api
      .patch(`/work-orders/templates/${id}/toggle`, { isActive })
      .then((r) => r.data),
  runTemplate: (id: string) =>
    api.post(`/work-orders/templates/${id}/run`).then((r) => r.data),
  list: (params?: Record<string, unknown>) =>
    api.get("/work-orders", { params }).then((r) => r.data),
  summary: (mallId?: string) =>
    api
      .get("/work-orders/summary", { params: mallId ? { mallId } : undefined })
      .then((r) => r.data),
  detail: (id: string) => api.get(`/work-orders/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post("/work-orders", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/work-orders/${id}`, data).then((r) => r.data),
  status: (id: string, status: string, note?: string) =>
    api
      .patch(`/work-orders/${id}/status`, { status, note })
      .then((r) => r.data),
  review: (id: string, approved: boolean, note?: string) =>
    api
      .post(`/work-orders/${id}/review`, { approved, note })
      .then((r) => r.data),
  addChecklist: (id: string, data: Record<string, unknown>) =>
    api.post(`/work-orders/${id}/checklist`, data).then((r) => r.data),
  toggleChecklist: (id: string, itemId: string, isCompleted: boolean) =>
    api
      .patch(`/work-orders/${id}/checklist/${itemId}`, { isCompleted })
      .then((r) => r.data),
  uploadEvidence: (
    id: string,
    file: File,
    evidenceType: string,
    caption?: string,
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("evidenceType", evidenceType);
    if (caption) form.append("caption", caption);
    return api.post(`/work-orders/${id}/evidence`, form).then((r) => r.data);
  },
  addComment: (id: string, content: string) =>
    api.post(`/work-orders/${id}/comments`, { content }).then((r) => r.data),
  exportCsv: (params?: Record<string, unknown>) =>
    api
      .get("/work-orders/export", { params, responseType: "blob" })
      .then((r) => r.data),
};
