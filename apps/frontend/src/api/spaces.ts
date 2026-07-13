import api from '@/lib/axios';

export const spacesApi = {
  // Malls
  listMalls: () => api.get('/spaces/malls').then((r) => r.data),
  getMall: (id: string) => api.get(`/spaces/malls/${id}`).then((r) => r.data),
  createMall: (data: Record<string, unknown>) => api.post('/spaces/malls', data).then((r) => r.data),
  setupMall: (data: Record<string, unknown>) => api.post('/spaces/malls/setup', data).then((r) => r.data),
  updateMall: (id: string, data: Record<string, unknown>) => api.patch(`/spaces/malls/${id}`, data).then((r) => r.data),
  deleteMall: (id: string) => api.delete(`/spaces/malls/${id}`).then((r) => r.data),
  // Floors
  listFloors: (mallId?: string) => api.get('/spaces/floors', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  createFloor: (data: Record<string, unknown>) => api.post('/spaces/floors', data).then((r) => r.data),
  updateFloor: (id: string, data: Record<string, unknown>) => api.patch(`/spaces/floors/${id}`, data).then((r) => r.data),
  deleteFloor: (id: string) => api.delete(`/spaces/floors/${id}`).then((r) => r.data),
  // Zones
  listZones: (params?: Record<string, unknown>) => api.get('/spaces/zones', { params }).then((r) => r.data),
  createZone: (data: Record<string, unknown>) => api.post('/spaces/zones', data).then((r) => r.data),
  updateZone: (id: string, data: Record<string, unknown>) => api.patch(`/spaces/zones/${id}`, data).then((r) => r.data),
  deleteZone: (id: string) => api.delete(`/spaces/zones/${id}`).then((r) => r.data),
  // Units
  listUnits: (params?: Record<string, unknown>) =>
    api.get('/spaces/units', { params }).then((r) => r.data),
  getUnit: (id: string) => api.get(`/spaces/units/${id}`).then((r) => r.data),
  createUnit: (data: Record<string, unknown>) => api.post('/spaces/units', data).then((r) => r.data),
  updateUnit: (id: string, data: Record<string, unknown>) => api.patch(`/spaces/units/${id}`, data).then((r) => r.data),
  updateUnitWithHistory: (id: string, data: Record<string, unknown>) => api.patch(`/spaces/units/${id}/with-history`, data).then((r) => r.data),
  deleteUnit: (id: string) => api.delete(`/spaces/units/${id}`).then((r) => r.data),
  occupancySummary: (mallId?: string | null) =>
    api.get('/spaces/units/occupancy', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  // Unit Media
  listUnitMedia: (unitId: string, type?: string) =>
    api.get(`/spaces/units/${unitId}/media`, { params: type ? { type } : undefined }).then((r) => r.data),
  uploadUnitMedia: (unitId: string, formData: FormData) =>
    api.post(`/spaces/units/${unitId}/media`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),
  updateUnitMedia: (unitId: string, mediaId: string, data: Record<string, unknown>) =>
    api.patch(`/spaces/units/${unitId}/media/${mediaId}`, data).then((r) => r.data),
  deleteUnitMedia: (unitId: string, mediaId: string) =>
    api.delete(`/spaces/units/${unitId}/media/${mediaId}`).then((r) => r.data),
  // Stale Vacant Units
  staleVacantUnits: (params?: { mallId?: string; days?: number }) =>
    api.get('/spaces/units/stale-vacant', { params }).then((r) => r.data),
  // Compare Units
  compareUnits: (unitIds: string[]) =>
    api.get('/spaces/units/compare', { params: { ids: unitIds.join(',') } }).then((r) => r.data),
  // Expiring Leases
  expiringLeases: (params?: { mallId?: string; days?: number }) =>
    api.get('/spaces/units/expiring', { params }).then((r) => r.data),
  // Unit History
  getUnitHistory: (unitId: string) =>
    api.get(`/spaces/units/${unitId}/history`).then((r) => r.data),
  // Analytics
  rentAnalytics: (mallId?: string) =>
    api.get('/spaces/analytics/rent', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  occupancyTrend: (params?: { mallId?: string; months?: number }) =>
    api.get('/spaces/analytics/occupancy-trend', { params }).then((r) => r.data),
  availabilityCalendar: (params?: { mallId?: string; months?: number }) =>
    api.get('/spaces/analytics/availability-calendar', { params }).then((r) => r.data),
  // Bulk Operations
  bulkUpdateUnits: (data: { unitIds: string[]; updates: Record<string, unknown> }) =>
    api.post('/spaces/units/bulk-update', data).then((r) => r.data),
  // Digital Map
  getFloorMapData: (floorId: string) =>
    api.get(`/spaces/floors/${floorId}/map`).then((r) => r.data),
  uploadFloorPlan: (floorId: string, formData: FormData) =>
    api.post(`/spaces/floors/${floorId}/floor-plan`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),
  deleteFloorPlan: (floorId: string) =>
    api.delete(`/spaces/floors/${floorId}/floor-plan`).then((r) => r.data),
  saveMapPositions: (floorId: string, positions: Array<{ unitId: string; polygon?: [number, number][]; x?: number; y?: number; w?: number; h?: number }>) =>
    api.patch(`/spaces/floors/${floorId}/map-positions`, { positions }).then((r) => r.data),
  updateUnitMapPosition: (unitId: string, pos: { polygon?: [number, number][] | null; x?: number | null; y?: number | null; w?: number | null; h?: number | null }) =>
    api.patch(`/spaces/units/${unitId}/map-position`, pos).then((r) => r.data),
  clearUnitMapPosition: (unitId: string) =>
    api.delete(`/spaces/units/${unitId}/map-position`).then((r) => r.data),
  // Merge / Split
  mergeUnits: (data: { unitIds: string[]; code: string; name?: string }) =>
    api.post('/spaces/units/merge', data).then((r) => r.data),
  splitUnit: (unitId: string) =>
    api.post(`/spaces/units/${unitId}/split`).then((r) => r.data),
};
