/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 — frontend view of the canonical Tờ trình.
 *
 * Mirrors apps/backend/src/modules/proposals/document/proposal-document.types.ts.
 * The frontend renders and edits this model; it never builds one. Mapping
 * business facts into document text happens on the server only.
 */

export type ProposalDocumentItemKey =
  | 'LEGAL_NAME' | 'BRAND_NAME' | 'CATEGORY' | 'BUSINESS_MODEL' | 'LOCATION' | 'AREA' | 'TERM'
  | 'RENT_START' | 'RENT' | 'SERVICE_FEE' | 'BUSINESS_SUPPORT_FEE' | 'UTILITIES' | 'OPERATING_HOURS'
  | 'AFTER_HOURS' | 'EXCHANGE_RATE' | 'PAYMENT' | 'DEPOSIT' | 'FITOUT_PERIOD' | 'FITOUT_FEE'
  | 'HANDOVER' | 'SPECIAL_CONDITIONS';

export interface ProposalDocumentItem {
  key: ProposalDocumentItemKey;
  stt: number;
  label: string;
  factText: string | null;
  narrativeText: string | null;
  narrativeEditable: boolean;
  narrativeOverridden: boolean;
  defaultNarrativeText: string | null;
  note: string;
}

export interface ProposalDocumentApprovalStep {
  stepOrder: number;
  stepName: string;
  approverRole: string;
  approverId: string | null;
  approverName: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
  presentation: 'EXPECTED_APPROVER' | 'APPROVED_BY' | 'REJECTED_BY' | 'SKIPPED';
  decidedAt: string | null;
  comment: string | null;
  identitySource: 'DECISION_SNAPSHOT' | 'LEGACY_UNSNAPSHOTTED' | 'ASSIGNED_APPROVER';
}

export interface ProposalDocumentModel {
  schemaVersion: 2;
  proposalId: string;
  proposalNumber: string;
  status: string;
  facts: {
    mall: { id: string | null; code: string | null; name: string | null; city: string | null };
    party: { source: 'TENANT' | 'LEAD' | 'NONE'; companyName: string | null; brandName: string | null };
    category: { id: string | null; code: string | null; name: string | null; source: string; legacy: boolean };
    currency: string;
    preparedBy: { userId: string | null; fullName: string | null; role: string | null; department: string | null };
    [key: string]: unknown;
  };
  header: {
    organisationLines: string[];
    docNumber: string;
    city: string | null;
    documentDate: string | null;
    title: string;
    subject: string;
    addressee: string;
  };
  preamble: string[];
  bodyIntro: string;
  items: ProposalDocumentItem[];
  closingLine: string;
  presentation: { logoDataUrl: string | null; layoutImageDataUrl: string | null; primaryColor: string };
  approval: {
    state: 'NOT_SUBMITTED' | 'PENDING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED';
    steps: ProposalDocumentApprovalStep[];
  };
  /** Set when this is a submitted, immutable version; null for a live DRAFT. */
  version: ProposalDocumentVersionInfo | null;
  approvalAsOf: string | null;
  sync: {
    sourceFingerprint: string;
    savedFingerprint: string | null;
    contentVersion: number;
    savedAt: string | null;
    savedById: string | null;
    documentStale: boolean;
    staleReason: 'SOURCE_CHANGED' | 'LEGACY_UNVERIFIED' | null;
    reviewState: 'NOT_REVIEWED' | 'REVIEWED' | 'STALE';
    reviewedFingerprint: string | null;
    reviewedAt: string | null;
    reviewedById: string | null;
    reviewedByName: string | null;
    legacyContentNotImported: ProposalDocumentItemKey[];
    legacySignatoriesIgnored: boolean;
  };
  warnings: string[];
  warningCodes: string[];
}

export interface ProposalDocumentVersionInfo {
  id: string;
  versionNumber: number;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  submittedAt: string;
  submittedById: string;
  submittedByName: string | null;
  sourceFingerprint: string;
  approvalWorkflowId: string | null;
  liveFingerprint: string | null;
  liveDiffers: boolean;
}

export interface ProposalDocumentVersionSummary {
  id: string;
  versionNumber: number;
  status: ProposalDocumentVersionInfo['status'];
  submittedAt: string;
  submittedById: string;
  submittedByName: string | null;
  sourceFingerprint: string;
  approvalWorkflow: { id: string; status: string } | null;
}

export interface ProposalSendContext {
  canSend: boolean;
  approvedVersions: Array<ProposalDocumentVersionSummary & { attachmentFilename: string }>;
  suggestedRecipients: Array<{ email: string; name: string | null; source: 'TENANT_CONTACT' | 'LEAD_CONTACT' }>;
  defaultSubject: string | null;
}

export interface SendProposalDocumentPayload {
  documentVersionId: string;
  to: string[];
  cc?: string[];
  subject?: string;
  message?: string;
}

export interface ProposalDocumentSend {
  id: string;
  duplicate: boolean;
  proposalId: string;
  documentVersionId: string;
  versionNumber: number | null;
  recipients: { to: string[]; cc: string[] };
  subject: string;
  message: string | null;
  attachmentFilename: string;
  attachmentSha256: string;
  sentById: string;
  createdAt: string;
  delivery: { id: string; status: string; attempts: number; sentAt: string | null; lastAttemptAt: string | null } | null;
}

export interface SaveProposalDocumentContentPayload {
  expectedContentVersion: number;
  reviewedFingerprint: string;
  content: {
    docNumber?: string | null;
    documentDate?: string | null;
    subject?: string | null;
    preamble?: string[] | null;
    bodyIntro?: string | null;
    closingLine?: string | null;
    items?: Array<{ key: ProposalDocumentItemKey; narrativeText?: string | null; note?: string }>;
    itemOrder?: ProposalDocumentItemKey[] | null;
    logoDataUrl?: string | null;
    layoutImageDataUrl?: string | null;
    primaryColor?: string | null;
  };
}
