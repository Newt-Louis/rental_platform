import api from '@/lib/axios';

export const fitoutApi = {
  listFitouts: (params?: Record<string, unknown>) =>
    api.get('/fitouts', { params }).then((r) => r.data),
  getFitout: (id: string) => api.get(`/fitouts/${id}`).then((r) => r.data),
  advanceStatus: (id: string, status: string, opts?: { override?: boolean; overrideReason?: string }) =>
    api.put(`/fitouts/${id}/status`, { status, ...opts }).then((r) => r.data),
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
  getDashboardOverview: () => api.get('/fitouts/dashboard/overview').then((r) => r.data),
  getProjectDashboard: (id: string) => api.get(`/fitouts/${id}/dashboard`).then((r) => r.data),
  listStageConfigs: () => api.get('/fitouts/stage-configs').then((r) => r.data),
  upsertStageConfig: (data: Record<string, unknown>) => api.post('/fitouts/stage-configs', data).then((r) => r.data),
  deactivateStageConfig: (code: string) => api.delete(`/fitouts/stage-configs/${code}`).then((r) => r.data),
  listFormTypes: () => api.get('/fitouts/form-types').then((r) => r.data),
  upsertFormType: (data: Record<string, unknown>) => api.post('/fitouts/form-types', data).then((r) => r.data),
  deactivateFormType: (code: string) => api.delete(`/fitouts/form-types/${code}`).then((r) => r.data),
  listContractors: (projectId: string) => api.get(`/fitouts/${projectId}/contractors`).then((r) => r.data),
  createContractor: (projectId: string, data: Record<string, unknown>) => api.post(`/fitouts/${projectId}/contractors`, data).then((r) => r.data),
  updateContractor: (projectId: string, contractorId: string, data: Record<string, unknown>) => api.patch(`/fitouts/${projectId}/contractors/${contractorId}`, data).then((r) => r.data),
  deleteContractor: (projectId: string, contractorId: string) => api.delete(`/fitouts/${projectId}/contractors/${contractorId}`).then((r) => r.data),
  listWorkerLogs: (projectId: string) => api.get(`/fitouts/${projectId}/workers`).then((r) => r.data),
  logWorkerEntry: (projectId: string, data: Record<string, unknown>) => api.post(`/fitouts/${projectId}/workers`, data).then((r) => r.data),
  logWorkerExit: (projectId: string, logId: string) => api.patch(`/fitouts/${projectId}/workers/${logId}/exit`).then((r) => r.data),
};

export const fitoutSubmittalApi = {
  list: (projectId: string, params?: { formTypeId?: string; status?: string }) =>
    api.get('/fitout-submittals', { params: { projectId, ...params } }).then((r) => r.data),
  getOne: (id: string) => api.get(`/fitout-submittals/${id}`).then((r) => r.data),
  create: (data: { projectId: string; formTypeId: string; title: string; dueDate?: string }) =>
    api.post('/fitout-submittals', data).then((r) => r.data),
  resubmit: (id: string, data: { title?: string; dueDate?: string }) =>
    api.post(`/fitout-submittals/${id}/resubmit`, data).then((r) => r.data),
  publish: (id: string) => api.post(`/fitout-submittals/${id}/publish`).then((r) => r.data),
  listComments: (id: string) => api.get(`/fitout-submittals/${id}/comments`).then((r) => r.data),
  addComment: (id: string, body: string) => api.post(`/fitout-submittals/${id}/comments`, { body }).then((r) => r.data),
  listDistribution: (id: string) => api.get(`/fitout-submittals/${id}/distribution`).then((r) => r.data),
  addDistribution: (id: string, userId: string) => api.post(`/fitout-submittals/${id}/distribution`, { userId }).then((r) => r.data),
  listAttachments: (id: string) => api.get(`/fitout-submittals/${id}/attachments`).then((r) => r.data),
  uploadAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/fitout-submittals/${id}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};

export const fitoutIssueApi = {
  list: (projectId: string, params?: { status?: string; category?: string; assigneeId?: string }) =>
    api.get('/fitout-issues', { params: { projectId, ...params } }).then((r) => r.data),
  getOne: (id: string) => api.get(`/fitout-issues/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/fitout-issues', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/fitout-issues/${id}`, data).then((r) => r.data),
  transition: (id: string, status: string) => api.patch(`/fitout-issues/${id}/status`, { status }).then((r) => r.data),
  listComments: (id: string) => api.get(`/fitout-issues/${id}/comments`).then((r) => r.data),
  addComment: (id: string, body: string) => api.post(`/fitout-issues/${id}/comments`, { body }).then((r) => r.data),
  listPhotos: (id: string) => api.get(`/fitout-issues/${id}/photos`).then((r) => r.data),
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/fitout-issues/${id}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  getDMap: (projectId: string) => api.get(`/fitouts/${projectId}/dmap`).then((r) => r.data),
};

export const fitoutDailyReportApi = {
  list: (projectId: string, params?: { from?: string; to?: string }) =>
    api.get('/fitout-daily-reports', { params: { projectId, ...params } }).then((r) => r.data),
  getMerged: (projectId: string, date: string) =>
    api.get('/fitout-daily-reports/merged', { params: { projectId, date } }).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/fitout-daily-reports', data).then((r) => r.data),
  listPhotos: (entryId: string) => api.get(`/fitout-daily-reports/${entryId}/photos`).then((r) => r.data),
  uploadPhoto: (entryId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/fitout-daily-reports/${entryId}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};

export const fitoutGanttApi = {
  list: (projectId: string) => api.get('/fitout-tasks', { params: { projectId } }).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/fitout-tasks', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/fitout-tasks/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/fitout-tasks/${id}`).then((r) => r.data),
};

export type FitoutRiskStatus = 'OPEN' | 'MITIGATING' | 'CLOSED';
export type FitoutRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FitoutRisk {
  id: string;
  projectId: string;
  title: string;
  category?: string;
  probability: number;
  impact: number;
  level?: FitoutRiskLevel;
  status: FitoutRiskStatus;
  owner?: string | { id: string; fullName: string };
  mitigation?: string;
  dueDate?: string;
}

export const fitoutRiskApi = {
  list: (projectId: string) =>
    api.get(`/fitouts/${projectId}/controls/risks`).then((r) => {
      const rows = Array.isArray(r.data) ? r.data : r.data?.data ?? [];
      return rows.map((risk: any) => ({ ...risk, mitigation: risk.mitigationPlan }));
    }),
  summary: (projectId: string) =>
    api.get(`/fitouts/${projectId}/controls/summary`).then((r) => r.data?.risks),
  create: (data: Omit<FitoutRisk, 'id' | 'status' | 'level'>) =>
    api.post(`/fitouts/${data.projectId}/controls/risks`, {
      title: data.title, category: data.category, probability: data.probability,
      impact: data.impact, mitigationPlan: data.mitigation, dueDate: data.dueDate,
    }).then((r) => r.data),
  update: (projectId: string, id: string, data: Partial<FitoutRisk>) =>
    api.patch(`/fitouts/${projectId}/controls/risks/${id}`, data).then((r) => r.data),
  transition: (projectId: string, id: string, status: FitoutRiskStatus) =>
    api.patch(`/fitouts/${projectId}/controls/risks/${id}`, { status }).then((r) => r.data),
};

export type ChangeOrderStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface FitoutChangeOrder {
  id: string;
  projectId: string;
  code?: string;
  title: string;
  reason?: string;
  estimatedCost: string | number;
  approvedCost?: string | number;
  currency: string;
  costType?: 'ADDITION' | 'DEDUCTION';
  scheduleImpactDays?: number;
  status: ChangeOrderStatus;
  requestedBy?: string | { id: string; fullName: string };
  createdAt?: string;
}

export const fitoutChangeOrderApi = {
  list: (projectId: string) =>
    api.get(`/fitouts/${projectId}/controls/change-orders`).then((r) => {
      const rows = Array.isArray(r.data) ? r.data : r.data?.data ?? [];
      return rows.map((order: any) => ({
        ...order,
        code: order.changeNumber,
        // Prisma Decimal serializes as a decimal string. Keep that string intact:
        // coercing through Number would lose exact transaction precision.
        estimatedCost: order.proposedAmount,
        approvedCost: order.approvedAmount == null ? undefined : order.approvedAmount,
      }));
    }),
  summary: (projectId: string) =>
    api.get(`/fitouts/${projectId}/controls/summary`).then((r) => r.data?.changes),
  create: (data: Pick<FitoutChangeOrder, 'projectId' | 'title' | 'reason' | 'costType' | 'scheduleImpactDays'> & { estimatedCost: string }) =>
    api.post(`/fitouts/${data.projectId}/controls/change-orders`, {
      title: data.title, reason: data.reason, proposedAmount: data.estimatedCost,
      scheduleImpactDays: data.scheduleImpactDays,
    }).then((r) => r.data),
  transition: (projectId: string, id: string, status: 'APPROVED' | 'REJECTED', data?: { approvedCost?: string | number }) =>
    api.patch(`/fitouts/${projectId}/controls/change-orders/${id}/decision`, {
      decision: status, approvedAmount: data?.approvedCost,
    }).then((r) => r.data),
};
