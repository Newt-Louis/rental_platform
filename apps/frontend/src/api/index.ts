import api from '@/lib/axios';

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

// Spaces
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
  deleteUnit: (id: string) => api.delete(`/spaces/units/${id}`).then((r) => r.data),
  occupancySummary: (mallId?: string | null) =>
    api.get('/spaces/units/occupancy', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  // Unit Media (Phase 1 fix)
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
  // Stale Vacant Units (Phase 1)
  staleVacantUnits: (params?: { mallId?: string; days?: number }) =>
    api.get('/spaces/units/stale-vacant', { params }).then((r) => r.data),
  // Compare Units (Phase 2)
  compareUnits: (unitIds: string[]) =>
    api.get('/spaces/units/compare', { params: { ids: unitIds.join(',') } }).then((r) => r.data),
  // Expiring Leases (Phase 2)
  expiringLeases: (params?: { mallId?: string; days?: number }) =>
    api.get('/spaces/units/expiring', { params }).then((r) => r.data),
  // Unit History (Phase 2)
  getUnitHistory: (unitId: string) =>
    api.get(`/spaces/units/${unitId}/history`).then((r) => r.data),
  // Analytics (Phase 3)
  rentAnalytics: (mallId?: string) =>
    api.get('/spaces/analytics/rent', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  occupancyTrend: (params?: { mallId?: string; months?: number }) =>
    api.get('/spaces/analytics/occupancy-trend', { params }).then((r) => r.data),
  availabilityCalendar: (params?: { mallId?: string; months?: number }) =>
    api.get('/spaces/analytics/availability-calendar', { params }).then((r) => r.data),
  // Bulk Operations (Phase 3)
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
};

// CRM - Leads
export const crmApi = {
  listLeads: (params?: Record<string, unknown>) =>
    api.get('/crm/leads', { params }).then((r) => r.data),
  createLead: (data: Record<string, unknown>) =>
    api.post('/crm/leads', data).then((r) => r.data),
  updateLead: (id: string, data: Record<string, unknown>) =>
    api.put(`/crm/leads/${id}`, data).then((r) => r.data),
  deleteLead: (id: string) => api.delete(`/crm/leads/${id}`).then((r) => r.data),
  pipeline: (limit?: number) => api.get('/crm/pipeline', { params: limit ? { limit } : undefined }).then((r) => r.data),
  stats: () => api.get('/crm/stats').then((r) => r.data),
  getLead: (id: string) => api.get(`/crm/leads/${id}`).then((r) => r.data),
  getLeadTimeline: (id: string) => api.get(`/crm/leads/${id}/timeline`).then((r) => r.data),
  getDeals: (params?: Record<string, unknown>) =>
    api.get('/crm/deals', { params }).then((r) => r.data),
  addActivity: (leadId: string, data: Record<string, unknown>) =>
    api.post(`/crm/leads/${leadId}/activities`, data).then((r) => r.data),
  moveLead: (id: string, status: string, position: number) =>
    api.put(`/crm/leads/${id}/move`, { status, position }).then((r) => r.data),
  bulkAction: (action: string, leadIds: string[], data?: Record<string, unknown>) =>
    api.post('/crm/leads/bulk', { action, leadIds, data }).then((r) => r.data),
  pipelineStats: () => api.get('/crm/pipeline/stats').then((r) => r.data),
  staleLeads: (days?: number) => api.get('/crm/leads/stale', { params: days ? { days } : undefined }).then((r) => r.data),
  autoMoveStale: (days?: number) => api.post('/crm/leads/auto-move-stale', null, { params: days ? { days } : undefined }).then((r) => r.data),
  autoAssign: (id: string) => api.post(`/crm/leads/${id}/auto-assign`).then((r) => r.data),
  autoFollowUp: (id: string, daysFromNow?: number, note?: string) =>
    api.post(`/crm/leads/${id}/auto-followup`, { note }, { params: daysFromNow ? { daysFromNow } : undefined }).then((r) => r.data),
};

// CRM - Customers
export const customersApi = {
  listCustomers: (params?: Record<string, unknown>) =>
    api.get('/crm/customers', { params }).then((r) => r.data),
  getCustomer: (id: string) =>
    api.get(`/crm/customers/${id}`).then((r) => r.data),
  createCustomer: (data: Record<string, unknown>) =>
    api.post('/crm/customers', data).then((r) => r.data),
  updateCustomer: (id: string, data: Record<string, unknown>) =>
    api.put(`/crm/customers/${id}`, data).then((r) => r.data),
  deleteCustomer: (id: string) =>
    api.delete(`/crm/customers/${id}`).then((r) => r.data),
  stats: () => api.get('/crm/customers/stats').then((r) => r.data),
  addActivity: (id: string, data: Record<string, unknown>) =>
    api.post(`/crm/customers/${id}/activities`, data).then((r) => r.data),
  linkTenant: (id: string, tenantId: string) =>
    api.patch(`/crm/customers/${id}/link-tenant`, { tenantId }).then((r) => r.data),
};

// Bookings
export const bookingApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/bookings', { params }).then((r) => r.data),
  stats: (mallId?: string) =>
    api.get('/bookings/stats', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  getUnitQueue: (unitId: string) =>
    api.get(`/bookings/unit/${unitId}/queue`).then((r) => r.data),
  get: (id: string) => api.get(`/bookings/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post('/bookings', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/bookings/${id}`, data).then((r) => r.data),
  updatePriority: (id: string, priority: number) =>
    api.patch(`/bookings/${id}/priority`, { priority }).then((r) => r.data),
  extend: (id: string, additionalDays: number, reason?: string) =>
    api.patch(`/bookings/${id}/extend`, { additionalDays, reason }).then((r) => r.data),
  cancel: (id: string, reason?: string) =>
    api.patch(`/bookings/${id}/cancel`, { reason }).then((r) => r.data),
  convertToProposal: (id: string, data: Record<string, unknown>) =>
    api.post(`/bookings/${id}/convert-to-proposal`, data).then((r) => r.data),
  // Price approval
  getPendingPriceApproval: (params?: { mallId?: string; page?: number; limit?: number }) =>
    api.get('/bookings/price-approval/pending', { params }).then((r) => r.data),
  approvePrice: (id: string, note?: string) =>
    api.patch(`/bookings/${id}/price/approve`, { note }).then((r) => r.data),
  rejectPrice: (id: string, reason: string) =>
    api.patch(`/bookings/${id}/price/reject`, { reason }).then((r) => r.data),
};

// Categories
export const categoriesApi = {
  // Category CRUD
  list: (includeInactive?: boolean) =>
    api.get('/categories', { params: includeInactive ? { includeInactive: 'true' } : undefined }).then((r) => r.data),
  getTree: (includeInactive?: boolean) =>
    api.get('/categories/tree', { params: includeInactive ? { includeInactive: 'true' } : undefined }).then((r) => r.data),
  getOptions: () => api.get('/categories/options').then((r) => r.data),
  get: (id: string) => api.get(`/categories/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/categories', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/categories/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/categories/${id}`).then((r) => r.data),

  // Category Pricing
  listPricing: (params?: { mallId?: string; categoryId?: string; includeInactive?: boolean }) =>
    api.get('/categories/pricing/list', { params }).then((r) => r.data),
  getPricing: (id: string) => api.get(`/categories/pricing/${id}`).then((r) => r.data),
  createPricing: (data: Record<string, unknown>) => api.post('/categories/pricing', data).then((r) => r.data),
  updatePricing: (id: string, data: Record<string, unknown>) =>
    api.patch(`/categories/pricing/${id}`, data).then((r) => r.data),
  deletePricing: (id: string) => api.delete(`/categories/pricing/${id}`).then((r) => r.data),

  // Price lookup
  lookupPricing: (params: { mallId: string; categoryId: string; floorId?: string; zoneId?: string }) =>
    api.get('/categories/pricing/lookup', { params }).then((r) => r.data),
  validatePrice: (data: { mallId: string; categoryId: string; floorId?: string; zoneId?: string; proposedRentPerSqm: number }) =>
    api.post('/categories/pricing/validate', data).then((r) => r.data),
  getMallPricingSummary: (mallId: string) =>
    api.get(`/categories/pricing/mall/${mallId}/summary`).then((r) => r.data),
};

// Unit Slots
export const slotsApi = {
  listSlots: (unitId: string) =>
    api.get(`/slots/units/${unitId}`).then((r) => r.data),
  createSlot: (unitId: string, data: Record<string, unknown>) =>
    api.post(`/slots/units/${unitId}`, data).then((r) => r.data),
  createSlotGrid: (unitId: string, data: { rows: number; cols: number; slotType?: string }) =>
    api.post(`/slots/units/${unitId}/grid`, data).then((r) => r.data),
  updateSlot: (slotId: string, data: Record<string, unknown>) =>
    api.patch(`/slots/${slotId}`, data).then((r) => r.data),
  deleteSlot: (slotId: string) =>
    api.delete(`/slots/${slotId}`).then((r) => r.data),
  calculatePrice: (slotId: string, type: string, startDatetime: string, endDatetime: string) =>
    api.get(`/slots/${slotId}/price`, {
      params: { type, start: startDatetime, end: endDatetime },
    }).then((r) => r.data),
  createBooking: (slotId: string, data: Record<string, unknown>) =>
    api.post(`/slots/${slotId}/bookings`, data).then((r) => r.data),
  listAllBookings: (params: { unitId?: string; mallId?: string; status?: string; type?: string }) =>
    api.get(`/slots/bookings/all`, { params }).then((r) => r.data),
  getSummaries: (unitIds: string[]) =>
    api.get(`/slots/summaries`, { params: { unitIds: unitIds.join(',') } }).then((r) => r.data),
  confirmBooking: (bookingId: string) =>
    api.patch(`/slots/bookings/${bookingId}/confirm`).then((r) => r.data),
  cancelBooking: (bookingId: string, reason?: string) =>
    api.patch(`/slots/bookings/${bookingId}/cancel`, { reason }).then((r) => r.data),
};

// Tenants
export const tenantsApi = {
  listTenants: (params?: Record<string, unknown>) =>
    api.get('/tenants', { params }).then((r) => r.data),
  getTenant: (id: string) => api.get(`/tenants/${id}`).then((r) => r.data),
  createTenant: (data: Record<string, unknown>) =>
    api.post('/tenants', data).then((r) => r.data),
  updateTenant: (id: string, data: Record<string, unknown>) =>
    api.put(`/tenants/${id}`, data).then((r) => r.data),
  deleteTenant: (id: string) => api.delete(`/tenants/${id}`).then((r) => r.data),
};

// Proposals
export const proposalsApi = {
  listProposals: (params?: Record<string, unknown>) =>
    api.get('/proposals', { params }).then((r) => r.data),
  createProposal: (data: Record<string, unknown>) =>
    api.post('/proposals', data).then((r) => r.data),
  getProposal: (id: string) => api.get(`/proposals/${id}`).then((r) => r.data),
  updateProposal: (id: string, data: Record<string, unknown>) =>
    api.put(`/proposals/${id}`, data).then((r) => r.data),
  submitProposal: (id: string) =>
    api.post(`/proposals/${id}/submit`).then((r) => r.data),
  convertProposal: (id: string) =>
    api.post(`/proposals/${id}/convert`).then((r) => r.data),
  exportPdf: (id: string) =>
    api.get(`/proposals/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data),
  listVersions: (id: string) => api.get(`/proposals/${id}/versions`).then((r) => r.data),
  getVersion: (id: string, version: number) =>
    api.get(`/proposals/${id}/versions/${version}`).then((r) => r.data),
  compareVersions: (id: string, from: number, to: number) =>
    api.get(`/proposals/${id}/versions/compare`, { params: { from, to } }).then((r) => r.data),
  rejectProposal: (id: string, rejectionReason: string) =>
    api.post(`/proposals/${id}/reject`, { rejectionReason }).then((r) => r.data),
  saveEditorContent: (id: string, editorContent: any) =>
    api.patch(`/proposals/${id}/editor-content`, { editorContent }).then((r) => r.data),
};

export const dealScoringApi = {
  listCriteria: () => api.get('/deal-scoring/criteria').then((r) => r.data),
  upsertCriterion: (data: Record<string, unknown>) =>
    api.post('/deal-scoring/criteria', data).then((r) => r.data),
  scoreProposal: (id: string) => api.post(`/deal-scoring/proposals/${id}`).then((r) => r.data),
};

// Approvals
export const approvalsApi = {
  pending: () => api.get('/approvals/pending').then((r) => r.data),
  approve: (id: string, comment?: string) =>
    api.post(`/approvals/${id}/approve`, { comment }).then((r) => r.data),
  reject: (id: string, comment?: string) =>
    api.post(`/approvals/${id}/reject`, { comment }).then((r) => r.data),
  listPolicyRules: () => api.get('/approvals/policy/rules').then((r) => r.data),
  createPolicyRule: (data: Record<string, unknown>) =>
    api.post('/approvals/policy/rules', data).then((r) => r.data),
  updatePolicyRule: (id: string, data: Record<string, unknown>) =>
    api.post(`/approvals/policy/rules/${id}`, data).then((r) => r.data),
};

// Contracts
export const contractsApi = {
  listContracts: (params?: Record<string, unknown>) =>
    api.get('/contracts', { params }).then((r) => r.data),
  getContract: (id: string) => api.get(`/contracts/${id}`).then((r) => r.data),
  createContract: (data: Record<string, unknown>) =>
    api.post('/contracts', data).then((r) => r.data),
  uploadFile: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post(`/contracts/${id}/files`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  expiring: () => api.get('/contracts/expiring').then((r) => r.data),
  listTemplates: () => api.get('/contracts/templates').then((r) => r.data),
  getTemplate: (id: string) => api.get(`/contracts/templates/${id}`).then((r) => r.data),
  renderTemplate: (contractId: string, templateId: string) =>
    api.post(`/contracts/${contractId}/render-template`, { templateId }).then((r) => r.data),
  listAmendments: (contractId: string) =>
    api.get(`/contracts/${contractId}/amendments`).then((r) => r.data),
  createAmendment: (contractId: string, data: Record<string, unknown>) =>
    api.post(`/contracts/${contractId}/amendments`, data).then((r) => r.data),
  submitAmendment: (contractId: string, amendmentId: string) =>
    api.post(`/contracts/${contractId}/amendments/${amendmentId}/submit`).then((r) => r.data),
  approveAmendment: (contractId: string, amendmentId: string) =>
    api.post(`/contracts/${contractId}/amendments/${amendmentId}/approve`).then((r) => r.data),
  getEvents: (contractId: string) => api.get(`/contracts/${contractId}/events`).then((r) => r.data),
  listFiles: (contractId: string) => api.get(`/contracts/${contractId}/files`).then((r) => r.data),
  deleteFile: (contractId: string, fileId: string) =>
    api.delete(`/contracts/${contractId}/files/${fileId}`).then((r) => r.data),
  signFile: (contractId: string, fileId: string, body: { signerName: string; signerRole: string }) =>
    api.post(`/contracts/${contractId}/files/${fileId}/sign`, body).then((r) => r.data),
  verifyFile: (verifyCode: string) => api.get(`/contracts/verify/${verifyCode}`).then((r) => r.data),
};

// Fitout
export const fitoutApi = {
  listFitouts: (params?: Record<string, unknown>) =>
    api.get('/fitouts', { params }).then((r) => r.data),
  getFitout: (id: string) => api.get(`/fitouts/${id}`).then((r) => r.data),
  advanceStatus: (id: string, status: string) =>
    api.put(`/fitouts/${id}/status`, { status }).then((r) => r.data),
  getChecklists: (id: string) =>
    api.get(`/fitouts/${id}/checklists`).then((r) => r.data),
  createChecklist: (id: string, data: { title: string; description?: string }) =>
    api.post(`/fitouts/${id}/checklists`, data).then((r) => r.data),
  updateChecklist: (fitoutId: string, checklistId: string, isCompleted: boolean) =>
    api.patch(`/fitouts/${fitoutId}/checklists/${checklistId}`, { isCompleted }).then((r) => r.data),
  deleteChecklist: (fitoutId: string, checklistId: string) =>
    api.delete(`/fitouts/${fitoutId}/checklists/${checklistId}`).then((r) => r.data),
  assign: (fitoutId: string, operationManagerId: string) =>
    api.patch(`/fitouts/${fitoutId}/assign`, { operationManagerId }).then((r) => r.data),
  listDocuments: (id: string) => api.get(`/fitouts/${id}/documents`).then((r) => r.data),
  uploadDocument: (id: string, file: File, documentType: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('documentType', documentType);
    return api.post(`/fitouts/${id}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  reviewDocument: (id: string, docId: string, decision: 'APPROVED' | 'REJECTED', note?: string) =>
    api.put(`/fitouts/${id}/documents/${docId}/review`, { decision, note }).then((r) => r.data),
  checkGate: (id: string, targetStatus: string) =>
    api.get(`/fitouts/${id}/gate-check/${targetStatus}`).then((r) => r.data),
  getMilestones: (id: string) => api.get(`/fitouts/${id}/milestones`).then((r) => r.data),
  listGates: () => api.get('/fitouts/gates').then((r) => r.data),
  upsertGate: (data: Record<string, unknown>) => api.post('/fitouts/gates', data).then((r) => r.data),
  listSlaPolicies: () => api.get('/fitouts/sla/policies').then((r) => r.data),
  upsertSlaPolicy: (data: Record<string, unknown>) => api.post('/fitouts/sla/policies', data).then((r) => r.data),
  getProgress: () => api.get('/fitouts/progress').then((r) => r.data),
  listContractors: (projectId: string) => api.get(`/fitouts/${projectId}/contractors`).then((r) => r.data),
  createContractor: (projectId: string, data: Record<string, unknown>) => api.post(`/fitouts/${projectId}/contractors`, data).then((r) => r.data),
  updateContractor: (projectId: string, contractorId: string, data: Record<string, unknown>) => api.patch(`/fitouts/${projectId}/contractors/${contractorId}`, data).then((r) => r.data),
  deleteContractor: (projectId: string, contractorId: string) => api.delete(`/fitouts/${projectId}/contractors/${contractorId}`).then((r) => r.data),
  listWorkerLogs: (projectId: string) => api.get(`/fitouts/${projectId}/workers`).then((r) => r.data),
  logWorkerEntry: (projectId: string, data: Record<string, unknown>) => api.post(`/fitouts/${projectId}/workers`, data).then((r) => r.data),
  logWorkerExit: (projectId: string, logId: string) => api.patch(`/fitouts/${projectId}/workers/${logId}/exit`).then((r) => r.data),
};

// Tickets
export const ticketsApi = {
  listTickets: (params?: Record<string, unknown>) =>
    api.get('/tickets', { params }).then((r) => r.data),
  createTicket: (data: Record<string, unknown>) =>
    api.post('/tickets', data).then((r) => r.data),
  getTicket: (id: string) => api.get(`/tickets/${id}`).then((r) => r.data),
  updateTicket: (id: string, data: Record<string, unknown>) =>
    api.put(`/tickets/${id}`, data).then((r) => r.data),
  addComment: (id: string, text: string) =>
    api.post(`/tickets/${id}/comments`, { text }).then((r) => r.data),
  assignTicket: (id: string, userId: string) =>
    api.put(`/tickets/${id}/assign`, { userId }).then((r) => r.data),
  getStats: () => api.get('/tickets/stats').then((r) => r.data),
  listSlaPolicies: () => api.get('/tickets/sla/policies').then((r) => r.data),
  upsertSlaPolicy: (data: Record<string, unknown>) => api.post('/tickets/sla/policies', data).then((r) => r.data),
  getSlaStats: () => api.get('/tickets/sla/stats').then((r) => r.data),
  getEscalations: (id: string) => api.get(`/tickets/${id}/escalations`).then((r) => r.data),
};

// Sales
export const salesApi = {
  listSales: (params?: Record<string, unknown>) =>
    api.get('/sales', { params }).then((r) => r.data),
  createSales: (data: Record<string, unknown>) =>
    api.post('/sales', data).then((r) => r.data),
  salesSummary: (period: string) =>
    api.get('/sales/summary', { params: { period } }).then((r) => r.data),
  topTenants: (period: string) =>
    api.get('/sales/top-tenants', { params: { period } }).then((r) => r.data),
  getDeadlineStatus: (period: string) =>
    api.get('/sales/deadline', { params: { period } }).then((r) => r.data),
  getAuditTrail: (id: string) =>
    api.get(`/sales/${id}/audit`).then((r) => r.data),
  approveSales: (id: string) =>
    api.post(`/sales/${id}/approve`).then((r) => r.data),
  disputeSales: (id: string, reason: string) =>
    api.post(`/sales/${id}/dispute`, { reason }).then((r) => r.data),
};

// Billing
export const billingApi = {
  listInvoices: (params?: Record<string, unknown>) =>
    api.get('/billing/invoices', { params }).then((r) => r.data),
  createInvoice: (data: Record<string, unknown>) =>
    api.post('/billing/invoices', data).then((r) => r.data),
  getInvoice: (id: string) =>
    api.get(`/billing/invoices/${id}`).then((r) => r.data),
  issueInvoice: (id: string) =>
    api.post(`/billing/invoices/${id}/issue`).then((r) => r.data),
  recordPayment: (id: string, data: Record<string, unknown>) =>
    api.post(`/billing/invoices/${id}/payment`, data).then((r) => r.data),
  arAging: () => api.get('/billing/ar-aging').then((r) => r.data),
  getSchedule: (contractId: string) => api.get(`/billing/schedule/${contractId}`).then((r) => r.data),
  buildSchedule: (contractId: string) => api.post(`/billing/schedule/${contractId}/build`).then((r) => r.data),
  getInvoiceSummary: (id: string) => api.get(`/billing/invoices/${id}/summary`).then((r) => r.data),
  addInvoiceLine: (id: string, data: { type: string; description: string; qty: number; unitPrice: number }) =>
    api.post(`/billing/invoices/${id}/lines`, data).then((r) => r.data),
  updateInvoiceLine: (id: string, lineId: string, data: { description?: string; qty?: number; unitPrice?: number }) =>
    api.patch(`/billing/invoices/${id}/lines/${lineId}`, data).then((r) => r.data),
  removeInvoiceLine: (id: string, lineId: string) =>
    api.delete(`/billing/invoices/${id}/lines/${lineId}`).then((r) => r.data),
  generateDueInvoices: () => api.post('/billing/schedule/generate-due').then((r) => r.data),
  listDunningPolicies: () => api.get('/billing/dunning/policies').then((r) => r.data),
  runDunning: () => api.post('/billing/dunning/run').then((r) => r.data),
  getDunningLogs: (invoiceId: string) => api.get(`/billing/dunning/logs/${invoiceId}`).then((r) => r.data),
  getCollectionKpi: (months?: number) =>
    api.get('/billing/collection-kpi', { params: months ? { months } : undefined }).then((r) => r.data),
  listPenaltyPolicies: () => api.get('/billing/penalty/policies').then((r) => r.data),
  runPenalty: () => api.post('/billing/penalty/run').then((r) => r.data),
  getBillingConfig: () => api.get('/billing/config').then((r) => r.data),
  updateBillingConfig: (data: Record<string, unknown>) =>
    api.post('/billing/config', data).then((r) => r.data),
};

// Reports
export const reportsApi = {
  occupancyReport: (params?: Record<string, unknown>) =>
    api.get('/reports/occupancy', { params }).then((r) => r.data),
  pipelineReport: () => api.get('/reports/pipeline').then((r) => r.data),
  revenueReport: (params?: Record<string, unknown>) =>
    api.get('/reports/revenue', { params }).then((r) => r.data),
  tenantSalesReport: (params?: Record<string, unknown>) =>
    api.get('/reports/tenant-sales', { params }).then((r) => r.data),
  contractExpiryReport: (params?: Record<string, unknown>) =>
    api.get('/reports/contract-expiry', { params }).then((r) => r.data),
};

// SAP
export const sapApi = {
  getLogs: (params?: Record<string, unknown>) =>
    api.get('/sap/logs', { params }).then((r) => r.data),
  syncCustomer: (tenantId: string) =>
    api.post('/sap/sync/customer', { tenantId }).then((r) => r.data),
  syncInvoice: (invoiceId: string) =>
    api.post('/sap/sync/invoice', { invoiceId }).then((r) => r.data),
  listReconciliation: (params?: Record<string, unknown>) =>
    api.get('/sap/reconciliation', { params }).then((r) => r.data),
  runReconciliation: () => api.post('/sap/reconciliation/run').then((r) => r.data),
  listMappings: (params?: Record<string, unknown>) =>
    api.get('/sap/mappings', { params }).then((r) => r.data),
  getMappingSummary: () =>
    api.get('/sap/mappings/summary').then((r) => r.data),
  upsertMapping: (data: Record<string, unknown>) =>
    api.post('/sap/mappings', data).then((r) => r.data),
  syncPendingMappings: () =>
    api.post('/sap/mappings/sync-pending').then((r) => r.data),
  getStats: () =>
    api.get('/sap/stats').then((r) => r.data),
};

// AI
export const aiApi = {
  chat: (message: string, history: { role: string; content: string }[]) =>
    api.post('/ai/chat', { message, history }).then((r) => r.data),
  suggestions: () => api.get('/ai/suggestions').then((r) => r.data),
};

// Floor Plan AI
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

// Dashboard
export const dashboardApi = {
  getDashboard: (mallId?: string) =>
    api.get('/dashboard', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  getCrossMallDashboard: () => api.get('/dashboard/cross-mall').then((r) => r.data),
};

// Notifications
export const notificationsApi = {
  list: () => api.get('/notifications').then((r) => r.data),
  markRead: (id: string) =>
    api.put(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.put('/notifications/read-all').then((r) => r.data),
  getUnreadCount: () => api.get('/notifications/unread-count').then((r) => r.data),
};

// Billing - Export
export const billingExportApi = {
  exportInvoicesCsv: (params?: Record<string, unknown>) =>
    api.get('/billing/invoices/export', { params, responseType: 'blob' }).then((r) => r.data),
};

// Mall Announcements
export const announcementsApi = {
  list: (mallId?: string) =>
    api.get('/announcements', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post('/announcements', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/announcements/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/announcements/${id}`).then((r) => r.data),
};

// Contract Termination
export const terminationApi = {
  get: (contractId: string) => api.get(`/contracts/${contractId}/termination`).then((r) => r.data),
  initiate: (contractId: string, data: Record<string, unknown>) =>
    api.post(`/contracts/${contractId}/termination`, data).then((r) => r.data),
  update: (contractId: string, data: Record<string, unknown>) =>
    api.patch(`/contracts/${contractId}/termination`, data).then((r) => r.data),
  complete: (contractId: string) =>
    api.post(`/contracts/${contractId}/termination/complete`).then((r) => r.data),
};

// Bank Reconciliation
export const reconciliationApi = {
  listStatements: (mallId?: string) =>
    api.get('/billing/bank-statements', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  importStatement: (mallId: string, file: File, bankAccount: string, statementDate: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('mallId', mallId);
    form.append('bankAccount', bankAccount);
    form.append('statementDate', statementDate);
    return api.post('/billing/bank-statements/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  autoMatch: (statementId: string) =>
    api.post(`/billing/bank-statements/${statementId}/auto-match`).then((r) => r.data),
};

// Follow-ups (CRM)
export const followUpApi = {
  list: (params?: Record<string, unknown>) => api.get('/crm/follow-ups', { params }).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/crm/follow-ups', data).then((r) => r.data),
  complete: (id: string) => api.patch(`/crm/follow-ups/${id}/complete`).then((r) => r.data),
  delete: (id: string) => api.delete(`/crm/follow-ups/${id}`).then((r) => r.data),
};

// Maintenance Schedule
export const maintenanceApi = {
  list: (mallId?: string) =>
    api.get('/tickets/maintenance', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/tickets/maintenance', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/tickets/maintenance/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/tickets/maintenance/${id}`).then((r) => r.data),
};

// Proposal Scenarios
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

// Users
export const usersApi = {
  listUsers: (params?: Record<string, unknown>) => api.get('/users', { params }).then((r) => r.data),
  getUser: (id: string) => api.get(`/users/${id}`).then((r) => r.data),
  updateUser: (id: string, data: Record<string, unknown>) =>
    api.patch(`/users/${id}`, data).then((r) => r.data),
  createUser: (data: Record<string, unknown>) =>
    api.post('/users', data).then((r) => r.data),
  resetPassword: (id: string, newPassword: string) =>
    api.post(`/users/${id}/reset-password`, { newPassword }).then((r) => r.data),
  deleteUser: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
};

// Mall Access (UserMallAccess)
export const mallAccessApi = {
  getMyMalls: () => api.get('/mall-access/my-malls').then((r) => r.data),
  getUsersForMall: (mallId: string) =>
    api.get(`/mall-access/mall/${mallId}/users`).then((r) => r.data),
  listForUser: (userId: string) =>
    api.get(`/mall-access/users/${userId}`).then((r) => r.data),
  grant: (data: { userId: string; mallId: string; role: string }) =>
    api.post('/mall-access/grant', data).then((r) => r.data),
  revoke: (userId: string, mallId: string) =>
    api.delete(`/mall-access/${userId}/${mallId}`).then((r) => r.data),
};

// Auth logout
export const authLogout = () => api.post('/auth/logout').then((r) => r.data);

// Analytics (Wave 5)
export const analyticsApi = {
  getOccupancyV2: (params?: { mallId?: string; floorId?: string; category?: string }) =>
    api.get('/analytics/occupancy', { params }).then((r) => r.data),
  getOccupancyTrend: (params?: { mallId?: string; months?: number }) =>
    api.get('/analytics/occupancy/trend', { params }).then((r) => r.data),
  getVacancyAnalysis: (mallId?: string) =>
    api.get('/analytics/vacancy', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  getRenewalRiskDashboard: (mallId?: string) =>
    api.get('/analytics/renewal-risk', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  calculateRenewalRisk: (contractId: string) =>
    api.post(`/analytics/renewal-risk/${contractId}`).then((r) => r.data),
  getMultiMallComparison: () => api.get('/analytics/multi-mall').then((r) => r.data),
  getMallPolicy: (mallId: string) => api.get(`/analytics/mall-policy/${mallId}`).then((r) => r.data),
  upsertMallPolicy: (mallId: string, data: { policies: Record<string, unknown>; kpiTargets?: Record<string, unknown> }) =>
    api.post(`/analytics/mall-policy/${mallId}`, data).then((r) => r.data),
  listComplianceExports: (params?: { mallId?: string; status?: string }) =>
    api.get('/analytics/compliance/exports', { params }).then((r) => r.data),
  requestComplianceExport: (data: { exportType: string; mallId?: string; periodStart: string; periodEnd: string }) =>
    api.post('/analytics/compliance/exports', data).then((r) => r.data),
  generateComplianceExport: (id: string) =>
    api.post(`/analytics/compliance/exports/${id}/generate`).then((r) => r.data),
  triggerMonthlyReports: () =>
    api.post('/analytics/compliance/exports/generate-monthly').then((r) => r.data),
  getDefaultRetention: () =>
    api.get('/analytics/compliance/retention/default').then((r) => r.data),
  getMallRetention: (mallId: string) =>
    api.get(`/analytics/compliance/retention/${mallId}`).then((r) => r.data),
  updateMallRetention: (mallId: string, retentionDays: Record<string, number>) =>
    api.put(`/analytics/compliance/retention/${mallId}`, { retentionDays }).then((r) => r.data),
};
