import api from "@/lib/axios";
export const parkingApi = {
  dashboard: (params?: any) =>
    api.get("/parking/dashboard", { params }).then((r) => r.data),
  alerts: (mallId?: string) =>
    api
      .get("/parking/alerts", { params: mallId ? { mallId } : undefined })
      .then((r) => r.data),
  contracts: (params?: any) =>
    api.get("/parking/contracts", { params }).then((r) => r.data),
  contract: (id: string) =>
    api.get(`/parking/contracts/${id}`).then((r) => r.data),
  createContract: (data: any) =>
    api.post("/parking/contracts", data).then((r) => r.data),
  updateStatus: (id: string, status: string) =>
    api
      .patch(`/parking/contracts/${id}/status`, { status })
      .then((r) => r.data),
  adjustQuantity: (id: string, data: any) =>
    api.post(`/parking/contracts/${id}/adjustments`, data).then((r) => r.data),
  generateStatement: (id: string, data: any) =>
    api.post(`/parking/contracts/${id}/statements`, data).then((r) => r.data),
  uploadDocument: (id: string, file: File, documentType = "CONTRACT") => {
    const form = new FormData();
    form.append("file", file);
    form.append("documentType", documentType);
    return api
      .post(`/parking/contracts/${id}/documents`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  statements: (params?: any) =>
    api.get("/parking/statements", { params }).then((r) => r.data),
  updateActual: (id: string, data: any) =>
    api.patch(`/parking/statements/${id}/actual`, data).then((r) => r.data),
  reconcile: (id: string, status: string) =>
    api
      .patch(`/parking/statements/${id}/reconcile`, { status })
      .then((r) => r.data),
  payment: (id: string, data: any) =>
    api.post(`/parking/statements/${id}/payments`, data).then((r) => r.data),
  exportReceivables: (params?: any) =>
    api
      .get("/parking/reports/receivables.csv", { params, responseType: "blob" })
      .then((r) => r.data),
  exportVehicles: (params?: any) =>
    api
      .get("/parking/reports/vehicles.csv", { params, responseType: "blob" })
      .then((r) => r.data),
};
