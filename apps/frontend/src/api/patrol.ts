import api from "@/lib/axios";
export const patrolApi = {
  summary: (mallId?: string) =>
    api
      .get("/patrol/summary", { params: mallId ? { mallId } : undefined })
      .then((r) => r.data),
  routes: (mallId?: string) =>
    api
      .get("/patrol/routes", { params: mallId ? { mallId } : undefined })
      .then((r) => r.data),
  createRoute: (data: any) =>
    api.post("/patrol/routes", data).then((r) => r.data),
  shifts: (params?: any) =>
    api.get("/patrol/shifts", { params }).then((r) => r.data),
  shift: (id: string) => api.get(`/patrol/shifts/${id}`).then((r) => r.data),
  createShift: (data: any) =>
    api.post("/patrol/shifts", data).then((r) => r.data),
  start: (id: string) =>
    api.patch(`/patrol/shifts/${id}/start`).then((r) => r.data),
  complete: (id: string, notes?: string) =>
    api.patch(`/patrol/shifts/${id}/complete`, { notes }).then((r) => r.data),
  check: (id: string, data: any) =>
    api.patch(`/patrol/checks/${id}`, data).then((r) => r.data),
  evidence: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post(`/patrol/checks/${id}/evidence`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
};
