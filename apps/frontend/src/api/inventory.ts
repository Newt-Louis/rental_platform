import api from "@/lib/axios";

export const inventoryApi = {
  categories: (params?: Record<string, unknown>) =>
    api.get("/inventory/categories", { params }).then((r) => r.data),
  createCategory: (data: Record<string, unknown>) =>
    api.post("/inventory/categories", data).then((r) => r.data),
  items: (params?: Record<string, unknown>) =>
    api.get("/inventory/items", { params }).then((r) => r.data),
  createItem: (data: Record<string, unknown>) =>
    api.post("/inventory/items", data).then((r) => r.data),
  updateItem: (id: string, data: Record<string, unknown>) =>
    api.patch(`/inventory/items/${id}`, data).then((r) => r.data),
  transactions: (params?: Record<string, unknown>) =>
    api.get("/inventory/transactions", { params }).then((r) => r.data),
  createTransaction: (data: Record<string, unknown>) =>
    api.post("/inventory/transactions", data).then((r) => r.data),
  summary: (mallId?: string | null) =>
    api
      .get("/inventory/summary", { params: mallId ? { mallId } : undefined })
      .then((r) => r.data),
};
