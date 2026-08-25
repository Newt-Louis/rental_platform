export type FitoutApprovalAttachment = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  version?: number | null;
  isLatest?: boolean | null;
  uploadedAt?: string | null;
};

export type FitoutApprovalSubmittal = {
  id: string;
  title: string;
  revisionNo: number;
  status: string;
  stageCode?: string | null;
  stage?: { code: string; name: string } | null;
  stageConfig?: { code: string; name: string } | null;
  submittedAt?: string | null;
  dueDate?: string | null;
  formType?: { id: string; code: string; name: string } | null;
  submittedBy?: { id: string; fullName: string } | null;
  project?: {
    id: string;
    status: string;
    tenant?: { id: string; brandName?: string | null; companyName?: string | null } | null;
    unit?: { id: string; code?: string | null; name?: string | null; mallId?: string | null; floor?: { id: string; name?: string | null; mallId?: string | null } | null } | null;
  } | null;
  attachments?: FitoutApprovalAttachment[];
};

export function getFitoutSubmittalFromApproval(value: any): FitoutApprovalSubmittal | null {
  const workflow = value?.workflow ?? value;
  if (workflow?.entityType !== 'FITOUT_SUBMITTAL') return null;
  const submittal = workflow.fitoutSubmittal;
  return submittal?.id && workflow.entityId === submittal.id ? submittal : null;
}

export function getFitoutAttachmentDownloadPath(attachmentId: string) {
  return `/files/documents/${encodeURIComponent(attachmentId)}`;
}

export function getFitoutStageName(submittal?: FitoutApprovalSubmittal | null) {
  const name = submittal?.stage?.name ?? submittal?.stageConfig?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

export function formatFitoutAttachmentSize(bytes?: number | null, locale = 'vi-VN') {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024)} KB`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}
