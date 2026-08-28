import api from "@/lib/axios";

export interface DepartmentListParams {
  mallId: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface DepartmentPayload {
  name: string;
  mallId?: string;
  parentId?: string | null;
  description?: string | null;
}

export const departmentsApi = {
  malls: () => api.get("/departments/malls").then((response) => response.data),
  list: (params: DepartmentListParams) =>
    api.get("/departments", { params }).then((response) => response.data),
  options: (mallId: string) =>
    api
      .get("/departments/options", { params: { mallId } })
      .then((response) => response.data),
  get: (id: string) =>
    api.get(`/departments/${id}`).then((response) => response.data),
  create: (data: DepartmentPayload & { mallId: string }) =>
    api.post("/departments", data).then((response) => response.data),
  replace: (id: string, data: DepartmentPayload) =>
    api.put(`/departments/${id}`, data).then((response) => response.data),
  update: (id: string, data: DepartmentPayload) =>
    api.patch(`/departments/${id}`, data).then((response) => response.data),
  remove: (id: string) =>
    api.delete(`/departments/${id}`).then((response) => response.data),
};
