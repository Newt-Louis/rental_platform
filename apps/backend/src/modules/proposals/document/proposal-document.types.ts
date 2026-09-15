/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 / CR-PROPOSAL-MAPPING-002
 *
 * The one contract every Tờ trình surface consumes: the Proposal editor, the
 * official PDF, and the approval screen. Before this there were two renderers
 * with two independent mappings, so the author and the approver could be
 * looking at different documents for the same Proposal.
 *
 * The model is split by who is allowed to decide each part:
 *
 *   facts     derived from Proposal and its relations on every read. Never
 *             stored in editorContent, never overridable through the editor.
 *   content   editorial wording the author may change (narrative, notes,
 *             row order, logo/layout images, accent colour).
 *   approval  evidence read from ApprovalStep. Never stored, never edited.
 */

export const PROPOSAL_DOCUMENT_SCHEMA_VERSION = 2 as const;

export type CategorySource =
  | 'TENANT_MASTER'
  | 'LEAD_MASTER'
  | 'TENANT_LEGACY_TEXT'
  | 'LEAD_LEGACY_TEXT'
  | 'NONE';

export interface ProposalDocumentFacts {
  proposalId: string;
  proposalNumber: string;
  /** Proposal.unit.mall — the same path MallAccessService authorises on. */
  mall: { id: string | null; code: string | null; name: string | null; city: string | null };
  unit: { id: string; code: string | null; floorName: string | null; zoneName: string | null };
  party: {
    source: 'TENANT' | 'LEAD' | 'NONE';
    companyName: string | null;
    brandName: string | null;
  };
  category: {
    id: string | null;
    code: string | null;
    name: string | null;
    source: CategorySource;
    /** True when the name is free text no Category master row stands behind. */
    legacy: boolean;
  };
  businessModel: string | null;
  area: number;
  termMonths: number;
  currency: string;
  rentPerSqm: number;
  /** Proposal.serviceFeeSqm; 0 is a real fee, null means not recorded. */
  serviceFeeSqm: number | null;
  businessSupportFeeSqm: number;
  escalationPercent: number;
  depositMonths: number;
  depositLease: number | null;
  depositFitout: number;
  fitoutFee: number;
  fitoutDays: number;
  utilityFee: number;
  operatingHours: string | null;
  afterHoursFee: number;
  paymentTermDays: number;
  /** Calendar dates (YYYY-MM-DD, Asia/Ho_Chi_Minh). */
  startDate: string | null;
  handoverDate: string | null;
  openingDate: string | null;
  specialConditions: string | null;
  exchangeRate: { rate: number | null; source: string | null };
  preparedBy: {
    userId: string | null;
    fullName: string | null;
    role: string | null;
    department: string | null;
  };
}

export type ProposalDocumentItemKey =
  | 'LEGAL_NAME'
  | 'BRAND_NAME'
  | 'CATEGORY'
  | 'BUSINESS_MODEL'
  | 'LOCATION'
  | 'AREA'
  | 'TERM'
  | 'RENT_START'
  | 'RENT'
  | 'SERVICE_FEE'
  | 'BUSINESS_SUPPORT_FEE'
  | 'UTILITIES'
  | 'OPERATING_HOURS'
  | 'AFTER_HOURS'
  | 'EXCHANGE_RATE'
  | 'PAYMENT'
  | 'DEPOSIT'
  | 'FITOUT_PERIOD'
  | 'FITOUT_FEE'
  | 'HANDOVER'
  | 'SPECIAL_CONDITIONS';

export interface ProposalDocumentItem {
  key: ProposalDocumentItemKey;
  stt: number;
  label: string;
  /** Server-derived, read-only. */
  factText: string | null;
  /** Editorial wording; null when the row has none. */
  narrativeText: string | null;
  narrativeEditable: boolean;
  narrativeOverridden: boolean;
  /** Template wording, so an editor can offer to restore it. */
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
  /**
   * What the document may truthfully say about this person. A PENDING step
   * is an expected approver, never a signer.
   */
  presentation: 'EXPECTED_APPROVER' | 'APPROVED_BY' | 'REJECTED_BY' | 'SKIPPED';
  decidedAt: string | null;
  comment: string | null;
  /**
   * Where approverName comes from. A decided step shows the name captured when
   * it was decided; only rows decided before that capture existed fall back to
   * today's User name, and say so.
   */
  identitySource: 'DECISION_SNAPSHOT' | 'LEGACY_UNSNAPSHOTTED' | 'ASSIGNED_APPROVER';
}

export interface ProposalDocumentRoutePreview {
  /** When the route was worked out (ISO). It follows configuration until submit. */
  evaluatedAt: string;
  policyConfigured: boolean;
  /** What would block a submit today, e.g. a position with no holder. */
  issues: Array<{ stepOrder: number | null; stepName: string | null; reason: string }>;
}

export interface ProposalDocumentApproval {
  /**
   * NOT_SUBMITTED means routing has not happened yet. Its steps, when present,
   * are the route the Proposal would get if submitted now (`preview`); they are
   * expected approvers, never signatures.
   */
  state: 'NOT_SUBMITTED' | 'PENDING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  steps: ProposalDocumentApprovalStep[];
  preview?: ProposalDocumentRoutePreview | null;
}

/** What an author may store. Everything else is recomputed. */
export interface ProposalDocumentEditableContent {
  docNumber: string | null;
  /** YYYY-MM-DD */
  documentDate: string | null;
  subject: string | null;
  preamble: string[] | null;
  bodyIntro: string | null;
  closingLine: string | null;
  items: Partial<Record<ProposalDocumentItemKey, { narrativeText?: string | null; note?: string }>>;
  itemOrder: ProposalDocumentItemKey[] | null;
  logoDataUrl: string | null;
  layoutImageDataUrl: string | null;
  primaryColor: string | null;
}

/** Proposal.editorContent from schemaVersion 2 on. */
export interface StoredProposalDocumentContentV2 {
  schemaVersion: typeof PROPOSAL_DOCUMENT_SCHEMA_VERSION;
  content: ProposalDocumentEditableContent;
  sourceFingerprint: string;
  contentVersion: number;
  savedAt: string;
  savedById: string;
}

export type ProposalDocumentStaleReason = 'SOURCE_CHANGED' | 'LEGACY_UNVERIFIED';

export type ProposalDocumentReviewState = 'NOT_REVIEWED' | 'REVIEWED' | 'STALE';

export interface ProposalDocumentVersionInfo {
  id: string;
  versionNumber: number;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  submittedAt: string;
  submittedById: string;
  submittedByName: string | null;
  sourceFingerprint: string;
  approvalWorkflowId: string | null;
  /** Fingerprint of the Proposal as it is now; null when not computed. */
  liveFingerprint: string | null;
  /** True when today's Proposal no longer matches what was submitted. */
  liveDiffers: boolean;
}

/** What renderedSnapshot holds: the document text exactly as submitted. */
export interface ProposalDocumentRenderedSnapshot {
  schemaVersion: typeof PROPOSAL_DOCUMENT_SCHEMA_VERSION;
  proposalNumber: string;
  header: ProposalDocumentModel['header'];
  preamble: string[];
  bodyIntro: string;
  items: ProposalDocumentItem[];
  closingLine: string;
  presentation: ProposalDocumentModel['presentation'];
  warnings: string[];
  warningCodes: string[];
  submittedByName: string | null;
}

export interface ProposalDocumentModel {
  schemaVersion: typeof PROPOSAL_DOCUMENT_SCHEMA_VERSION;
  proposalId: string;
  proposalNumber: string;
  status: string;
  facts: ProposalDocumentFacts;
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
  presentation: {
    logoDataUrl: string | null;
    layoutImageDataUrl: string | null;
    primaryColor: string;
  };
  approval: ProposalDocumentApproval;
  /**
   * Set when this document is a submitted, immutable version. Null for a DRAFT
   * built live from the Proposal.
   */
  version: ProposalDocumentVersionInfo | null;
  /** Approval evidence is shown as it stood at this instant (ISO), or live when null. */
  approvalAsOf: string | null;
  /** The editable content exactly as the editor should round-trip it. */
  editableContent: ProposalDocumentEditableContent;
  sync: {
    sourceFingerprint: string;
    savedFingerprint: string | null;
    contentVersion: number;
    savedAt: string | null;
    savedById: string | null;
    documentStale: boolean;
    staleReason: ProposalDocumentStaleReason | null;
    /**
     * Proposal governance review gate. REVIEWED only when a valid user saved the
     * document against today's facts after the last submission; a review cannot
     * be inferred from opening, generating or submitting the document.
     */
    reviewState: ProposalDocumentReviewState;
    reviewedFingerprint: string | null;
    reviewedAt: string | null;
    reviewedById: string | null;
    reviewedByName: string | null;
    /** Legacy (pre-v2) rows whose hand-typed content is no longer used. */
    legacyContentNotImported: ProposalDocumentItemKey[];
    legacySignatoriesIgnored: boolean;
  };
  warnings: string[];
  /** Machine-readable counterparts of `warnings`, e.g. FX_RULE_NOT_CONFIGURED. */
  warningCodes: string[];
}
