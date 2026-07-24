import api from "@/lib/axios";
export const patrolApi = {
  summary: (params?: any) =>
    api.get("/patrol/summary", { params }).then((r) => r.data),
  report: (params?: any) =>
    api.get("/patrol/report", { params }).then((r) => r.data),
  routes: (mallId?: string) =>
    api
      .get("/patrol/routes", { params: mallId ? { mallId } : undefined })
      .then((r) => r.data),
  createRoute: (data: any) =>
    api.post("/patrol/routes", data).then((r) => r.data),
  updateRoute: (id: string, data: any) =>
    api.patch(`/patrol/routes/${id}`, data).then((r) => r.data),
  addPoint: (routeId: string, data: any) =>
    api.post(`/patrol/routes/${routeId}/points`, data).then((r) => r.data),
  updatePoint: (id: string, data: any) =>
    api.patch(`/patrol/points/${id}`, data).then((r) => r.data),
  deletePoint: (id: string) =>
    api.delete(`/patrol/points/${id}`).then((r) => r.data),
  reorderPoints: (routeId: string, orderedIds: string[]) =>
    api
      .patch(`/patrol/routes/${routeId}/points/reorder`, { orderedIds })
      .then((r) => r.data),
  shifts: (params?: any) =>
    api.get("/patrol/shifts", { params }).then((r) => r.data),
  shift: (id: string) => api.get(`/patrol/shifts/${id}`).then((r) => r.data),
  createShift: (data: any) =>
    api.post("/patrol/shifts", data).then((r) => r.data),
  start: (id: string) =>
    api.patch(`/patrol/shifts/${id}/start`).then((r) => r.data),
  complete: (id: string, notes?: string) =>
    api.patch(`/patrol/shifts/${id}/complete`, { notes }).then((r) => r.data),
  cancelShift: (id: string, reason: string) =>
    api.patch(`/patrol/shifts/${id}/cancel`, { reason }).then((r) => r.data),
  reassignShift: (id: string, assigneeId: string) =>
    api
      .patch(`/patrol/shifts/${id}/assignee`, { assigneeId })
      .then((r) => r.data),
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
  schedules: (params?: any) =>
    api.get("/patrol/schedules", { params }).then((r) => r.data),
  createSchedule: (data: any) =>
    api.post("/patrol/schedules", data).then((r) => r.data),
  updateSchedule: (id: string, data: any) =>
    api.patch(`/patrol/schedules/${id}`, data).then((r) => r.data),
  deleteSchedule: (id: string) =>
    api.delete(`/patrol/schedules/${id}`).then((r) => r.data),
};
