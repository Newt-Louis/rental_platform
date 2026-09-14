import * as crypto from 'crypto';
import { CurrencyCode } from '@prisma/client';
import { formatMoneyWithCode } from '../../../common/utils/format-money';
import {
  CategorySource,
  PROPOSAL_DOCUMENT_SCHEMA_VERSION,
  ProposalDocumentApproval,
  ProposalDocumentApprovalStep,
  ProposalDocumentEditableContent,
  ProposalDocumentFacts,
  ProposalDocumentItem,
  ProposalDocumentItemKey,
  ProposalDocumentModel,
  ProposalDocumentRenderedSnapshot,
  ProposalDocumentReviewState,
  ProposalDocumentStaleReason,
  ProposalDocumentVersionInfo,
  StoredProposalDocumentContentV2,
} from './proposal-document.types';

/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 / CR-PROPOSAL-MAPPING-002
 *
 * Pure: no database, no clock of its own. The service loads the source rows
 * and passes `now`; everything a Tờ trình says is decided here, once, for the
 * editor, the official PDF and the approval screen alike.
 */

const VN_TZ = 'Asia/Ho_Chi_Minh';
/** Currencies Proposal.exchangeRate (USD/VND) can describe. */
const FX_RULE_CURRENCIES = ['VND', 'USD'];
const UNKNOWN = 'Chưa xác định';

/** Shape the service loads. Kept structural so tests can build it by hand. */
export interface ProposalDocumentSource {
  id: string;
  proposalNumber: string;
  status: string;
  createdById: string;
  createdAt: Date | string;
  area: number;
  term: number;
  startDate: Date | string | null;
  rentPerSqm: number;
  camPerSqm: number;
  serviceFeeSqm: number | null;
  businessSupportFeeSqm: number;
  rentCurrency: string;
  escalationPercent: number;
  deposit: number;
  depositLease: number | null;
  depositFitout: number;
  fitoutFee: number;
  fitoutDays: number;
  utilityFee: number;
  operatingHours: string | null;
  afterHoursFee: number;
  paymentTermDays: number;
  handoverDate: Date | string | null;
  openingDate: Date | string | null;
  specialConditions: string | null;
  businessModel: string | null;
  exchangeRate: number | null;
  exchangeRateSource: string | null;
  editorContent: unknown;
  unit: {
    id: string;
    code: string | null;
    floor: { name: string | null } | null;
    zone: { name: string | null } | null;
    mall: { id: string; code: string | null; name: string | null; city: string | null } | null;
  };
  tenant: {
    companyName: string | null;
    brandName: string | null;
    category: string | null;
    categoryRef: { id: string; code: string | null; name: string | null } | null;
  } | null;
  lead: {
    company: string | null;
    brandName: string | null;
    category: string | null;
    categoryRef: { id: string; code: string | null; name: string | null } | null;
  } | null;
  approvalWorkflow: {
    status: string;
    createdAt: Date | string;
    steps: Array<{
      id: string;
      stepOrder: number;
      stepName: string;
      approverRole: string;
      approverId: string | null;
      approver: { id: string; fullName: string | null } | null;
      status: string;
      decidedAt: Date | string | null;
      comment: string | null;
      decidedByUserId?: string | null;
      decidedByDisplayName?: string | null;
    }>;
  } | null;
  /** Resolved by explicit lookup on createdById — Proposal has no relation. */
  creator: { id: string; fullName: string | null; role: string | null; department: string | null } | null;
  /** The user who last saved (reviewed) the document, when there is one. */
  reviewer?: { id: string; fullName: string | null; isActive: boolean; deletedAt: Date | string | null } | null;
  /** submittedAt of this Proposal's latest document version; a review before it was used up. */
  lastSubmittedAt?: Date | string | null;
}

// ── Item catalogue ───────────────────────────────────────────────────────────

interface ItemDefinition {
  key: ProposalDocumentItemKey;
  label: string;
  /** Label the pre-v2 editor saved, for legacy content import. */
  legacyLabel: string;
  narrativeEditable: boolean;
  /** Pre-v2 content of this row was pure narrative and can be imported. */
  legacyContentImportable: boolean;
  defaultNote?: string;
}

export const PROPOSAL_DOCUMENT_ITEMS: readonly ItemDefinition[] = [
  { key: 'LEGAL_NAME', label: 'Tên Pháp nhân', legacyLabel: 'Tên Pháp nhân', narrativeEditable: false, legacyContentImportable: false },
  { key: 'BRAND_NAME', label: 'Tên Thương hiệu', legacyLabel: 'Tên Thương hiệu', narrativeEditable: false, legacyContentImportable: false },
  { key: 'CATEGORY', label: 'Ngành hàng Kinh doanh', legacyLabel: 'Ngành hàng Kinh doanh', narrativeEditable: false, legacyContentImportable: false },
  { key: 'BUSINESS_MODEL', label: 'Mô hình Kinh doanh', legacyLabel: 'Mô hình Kinh doanh', narrativeEditable: false, legacyContentImportable: false },
  { key: 'LOCATION', label: 'Vị trí chào thuê', legacyLabel: 'Vị trí chào thuê', narrativeEditable: false, legacyContentImportable: false, defaultNote: 'Layout chi tiết đính kèm phần II' },
  { key: 'AREA', label: 'Diện tích', legacyLabel: 'Diện tích', narrativeEditable: true, legacyContentImportable: false },
  { key: 'TERM', label: 'Thời hạn thuê', legacyLabel: 'Thời hạn thuê', narrativeEditable: false, legacyContentImportable: false },
  { key: 'RENT_START', label: 'Ngày bắt đầu tính Tiền thuê', legacyLabel: 'Ngày bắt đầu tính Tiền thuê', narrativeEditable: true, legacyContentImportable: true },
  { key: 'RENT', label: 'Giá thuê\n(Chưa bao gồm Thuế GTGT)', legacyLabel: 'Giá thuê\n(Chưa bao gồm Thuế GTGT)', narrativeEditable: false, legacyContentImportable: false },
  { key: 'SERVICE_FEE', label: 'Phí Dịch vụ', legacyLabel: 'Phí Dịch vụ', narrativeEditable: true, legacyContentImportable: false },
  { key: 'BUSINESS_SUPPORT_FEE', label: 'Phí hỗ trợ Kinh doanh', legacyLabel: 'Phí hỗ trợ Kinh doanh', narrativeEditable: true, legacyContentImportable: false },
  { key: 'UTILITIES', label: 'Phí tiện ích', legacyLabel: 'Phí tiện ích', narrativeEditable: true, legacyContentImportable: true },
  { key: 'OPERATING_HOURS', label: 'Thời gian hoạt động của TTTM', legacyLabel: 'Thời gian hoạt động của TTTM', narrativeEditable: false, legacyContentImportable: false },
  { key: 'AFTER_HOURS', label: 'Phí Dịch vụ ngoài giờ', legacyLabel: 'Phí Dịch vụ ngoài giờ', narrativeEditable: true, legacyContentImportable: false },
  { key: 'EXCHANGE_RATE', label: 'Tỷ giá', legacyLabel: 'Tỷ giá', narrativeEditable: true, legacyContentImportable: false },
  { key: 'PAYMENT', label: 'Thanh toán Tiền thuê', legacyLabel: 'Thanh toán Tiền thuê', narrativeEditable: true, legacyContentImportable: false },
  { key: 'DEPOSIT', label: 'Tiền Đặt Cọc', legacyLabel: 'Tiền Đặt Cọc', narrativeEditable: true, legacyContentImportable: false },
  { key: 'FITOUT_PERIOD', label: 'Thời hạn hoàn thiện nội thất', legacyLabel: 'Thời hạn hoàn thiện nội thất', narrativeEditable: false, legacyContentImportable: false },
  { key: 'FITOUT_FEE', label: 'Phí Thi công', legacyLabel: 'Phí Thi công', narrativeEditable: true, legacyContentImportable: true },
  { key: 'HANDOVER', label: 'Ngày Bàn giao Mặt bằng', legacyLabel: 'Ngày Bàn giao Mặt bằng', narrativeEditable: true, legacyContentImportable: false },
  { key: 'SPECIAL_CONDITIONS', label: 'Điều kiện đặc biệt', legacyLabel: 'Điều kiện đặc biệt', narrativeEditable: false, legacyContentImportable: false },
];

export const PROPOSAL_DOCUMENT_ITEM_KEYS = PROPOSAL_DOCUMENT_ITEMS.map((i) => i.key);
const ITEM_BY_KEY = new Map(PROPOSAL_DOCUMENT_ITEMS.map((i) => [i.key, i]));

export function isNarrativeEditable(key: ProposalDocumentItemKey): boolean {
  return ITEM_BY_KEY.get(key)?.narrativeEditable ?? false;
}

const BUSINESS_MODEL_LABELS: Record<string, string> = {
  SHOP: 'Gian hàng (SHOP)',
  KIOSK: 'Kiosk',
  POP_UP: 'Pop-up',
  EVENT: 'Sự kiện (EVENT)',
  CHAIN: 'Chuỗi (CHAIN)',
};

// ── Organisation template (approved wording; not business data) ─────────────

const ORGANISATION_LINES = ['KHỐI KINH DOANH BĐS TM & DV', 'PHÒNG CHO THUÊ TTTM'];
const DOCUMENT_TITLE = 'TỜ TRÌNH';
const ADDRESSEE = 'KÍNH GỬI: BAN TỔNG GIÁM ĐỐC';
const DEFAULT_PRIMARY_COLOR = '#1a237e';

// ── Formatting helpers ───────────────────────────────────────────────────────

/** Calendar date in Vietnam time. Server containers run UTC, so a bare
 *  toLocaleDateString() shows a local-midnight date one day early. */
export function toVnCalendarDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function formatVnDate(isoDate: string | null): string {
  if (!isoDate) return UNKNOWN;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function money(amount: number, currency: string): string {
  return formatMoneyWithCode(amount, currency as CurrencyCode);
}

function num(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
}

const MONTH_WORDS: Record<number, string> = { 1: 'một', 2: 'hai', 3: 'ba', 4: 'bốn', 5: 'năm', 6: 'sáu' };

function orUnknown(value: string | null | undefined): string {
  const v = typeof value === 'string' ? value.trim() : value;
  return v ? v : UNKNOWN;
}

/** Deterministic JSON: object keys sorted at every level. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}

// ── Facts ────────────────────────────────────────────────────────────────────

export function buildFacts(src: ProposalDocumentSource): ProposalDocumentFacts {
  const party = src.tenant
    ? { source: 'TENANT' as const, companyName: src.tenant.companyName, brandName: src.tenant.brandName }
    : src.lead
      ? { source: 'LEAD' as const, companyName: src.lead.company, brandName: src.lead.brandName }
      : { source: 'NONE' as const, companyName: null, brandName: null };

  return {
    proposalId: src.id,
    proposalNumber: src.proposalNumber,
    mall: {
      id: src.unit.mall?.id ?? null,
      code: src.unit.mall?.code ?? null,
      name: src.unit.mall?.name ?? null,
      city: src.unit.mall?.city ?? null,
    },
    unit: {
      id: src.unit.id,
      code: src.unit.code,
      floorName: src.unit.floor?.name ?? null,
      zoneName: src.unit.zone?.name ?? null,
    },
    party,
    category: resolveCategory(src),
    businessModel: src.businessModel ?? null,
    area: src.area,
    termMonths: src.term,
    currency: src.rentCurrency,
    rentPerSqm: src.rentPerSqm,
    // 0 is a real fee. Nothing in the domain says CAM stands in for an unset
    // service fee, so there is no fallback: an absent value is shown as absent.
    serviceFeeSqm: src.serviceFeeSqm ?? null,
    businessSupportFeeSqm: src.businessSupportFeeSqm,
    escalationPercent: src.escalationPercent,
    depositMonths: src.deposit,
    depositLease: src.depositLease,
    depositFitout: src.depositFitout,
    fitoutFee: src.fitoutFee,
    fitoutDays: src.fitoutDays,
    utilityFee: src.utilityFee,
    operatingHours: src.operatingHours?.trim() ? src.operatingHours : null,
    afterHoursFee: src.afterHoursFee,
    paymentTermDays: src.paymentTermDays,
    startDate: toVnCalendarDate(src.startDate),
    handoverDate: toVnCalendarDate(src.handoverDate),
    openingDate: toVnCalendarDate(src.openingDate),
    // Proposal.notes is internal. Only the customer-facing field is printed.
    specialConditions: src.specialConditions?.trim() ? src.specialConditions : null,
    exchangeRate: { rate: src.exchangeRate ?? null, source: src.exchangeRateSource?.trim() ? src.exchangeRateSource : null },
    preparedBy: {
      userId: src.creator?.id ?? null,
      fullName: src.creator?.fullName ?? null,
      role: src.creator?.role ?? null,
      department: src.creator?.department ?? null,
    },
  };
}

/**
 * Tenant is the contracting party, so its master category wins; a Lead that
 * has not converted yet speaks for the deal until then. Free text is shown only
 * when no master row stands behind either, and is flagged, never re-mapped.
 */
function resolveCategory(src: ProposalDocumentSource): ProposalDocumentFacts['category'] {
  const master = (ref: { id: string; code: string | null; name: string | null }, source: CategorySource) =>
    ({ id: ref.id, code: ref.code, name: ref.name, source, legacy: false });
  const legacy = (text: string, source: CategorySource) =>
    ({ id: null, code: null, name: text.trim(), source, legacy: true });

  if (src.tenant?.categoryRef) return master(src.tenant.categoryRef, 'TENANT_MASTER');
  if (src.lead?.categoryRef) return master(src.lead.categoryRef, 'LEAD_MASTER');
  if (src.tenant?.category?.trim()) return legacy(src.tenant.category, 'TENANT_LEGACY_TEXT');
  if (src.lead?.category?.trim()) return legacy(src.lead.category, 'LEAD_LEGACY_TEXT');
  return { id: null, code: null, name: null, source: 'NONE', legacy: false };
}

export function computeSourceFingerprint(facts: ProposalDocumentFacts): string {
  return crypto.createHash('sha256').update(stableStringify(facts)).digest('hex');
}

/** FX is shown when a rate was recorded or the Proposal is not priced in VND. */
export function isExchangeRateRelevant(facts: ProposalDocumentFacts): boolean {
  return facts.exchangeRate.rate != null || facts.currency !== 'VND';
}

// ── Defaults that depend on facts ────────────────────────────────────────────

function mallLabel(f: ProposalDocumentFacts) {
  return orUnknown(f.mall.name);
}

function defaultSubject(f: ProposalDocumentFacts): string {
  return `V/v: Phê duyệt xác nhận thông tin Thư Đề Nghị Cho Thuê/ Hợp Đồng Thuê gửi đến Khách thuê Công ty ${orUnknown(f.party.companyName)} với tên thương hiệu ${orUnknown(f.party.brandName)} tại vị trí thuê ${orUnknown(f.unit.code)}, ${orUnknown(f.unit.floorName)} thuộc Dự Án Trung Tâm Thương Mại ${mallLabel(f)}`;
}

function defaultPreamble(f: ProposalDocumentFacts): string[] {
  const brand = orUnknown(f.party.brandName);
  return [
    `Căn cứ nhu cầu thuê mặt bằng kinh doanh của Khách Thuê ${brand} thuộc Công ty ${orUnknown(f.party.companyName)} tại Dự Án Trung Tâm Thương Mại ${mallLabel(f)};`,
    `Căn cứ kế hoạch chốt thuê cho các Khách Thuê tại TTTM ${mallLabel(f)};`,
    'Căn cứ các yêu cầu đề xuất, điều kiện thoả thuận, phạm vi công việc đã được Các Bên thống nhất.',
  ];
}

function defaultBodyIntro(f: ProposalDocumentFacts): string {
  return `Phòng cho thuê TTTM kính trình Ban Tổng Giám Đốc phê duyệt Đề xuất Cho Thuê cho Khách Thuê ${orUnknown(f.party.brandName)} tại TTTM ${mallLabel(f)}, bao gồm các nội dung chính sau:`;
}

const DEFAULT_CLOSING = 'Phòng cho thuê TTTM kính trình Ban Tổng Giám đốc xem xét và phê duyệt.';

function defaultDocNumber(src: ProposalDocumentSource): string {
  const seq = src.proposalNumber.split('-').pop() || '…';
  const year = (toVnCalendarDate(src.createdAt) ?? '').slice(0, 4) || '…';
  return `${seq}/${year}/TTr-CTTTTM`;
}

/** Submitted documents are dated by submission, so the same Proposal renders
 *  the same date every day; a draft preview is dated today. */
function defaultDocumentDate(src: ProposalDocumentSource, now: Date): string | null {
  return toVnCalendarDate(src.approvalWorkflow?.createdAt ?? now);
}

function termText(months: number): string {
  if (months > 0 && months % 12 === 0) return `${months / 12} năm (${months} tháng) kể từ Ngày Bàn giao.`;
  return `${months} tháng kể từ Ngày Bàn giao.`;
}

function depositMonthsText(n: number): string {
  const word = Number.isInteger(n) ? MONTH_WORDS[n] : undefined;
  return word ? `${num(n)} (${word})` : num(n);
}

interface RowParts { fact: string | null; narrative: string | null }

function rowParts(key: ProposalDocumentItemKey, f: ProposalDocumentFacts): RowParts {
  const cur = f.currency;
  switch (key) {
    case 'LEGAL_NAME': return { fact: orUnknown(f.party.companyName), narrative: null };
    case 'BRAND_NAME': return { fact: orUnknown(f.party.brandName), narrative: null };
    case 'CATEGORY': return { fact: orUnknown(f.category.name), narrative: null };
    case 'BUSINESS_MODEL':
      return { fact: f.businessModel ? (BUSINESS_MODEL_LABELS[f.businessModel] ?? f.businessModel) : UNKNOWN, narrative: null };
    case 'LOCATION':
      return { fact: [f.unit.code, f.unit.zoneName, f.unit.floorName].filter(Boolean).join(', ') || UNKNOWN, narrative: null };
    case 'AREA':
      return {
        fact: `Tổng diện tích: ${num(f.area)} m²`,
        narrative: 'Diện tích này được tạm tính vào thời điểm Bên Cho Thuê phát hành Thư Đề Nghị Cho Thuê. Diện Tích Thuê thực tế sẽ xác nhận sau khi đo đạc và các Bên xác nhận vào Ngày Bàn giao Mặt bằng.',
      };
    case 'TERM': return { fact: termText(f.termMonths), narrative: null };
    case 'RENT_START':
      return {
        fact: null,
        narrative: '• Ngày bắt đầu tính Tiền thuê là Ngày Bàn giao.\n• Tiền thuê trong Thời hạn hoàn thiện nội thất (từ Ngày Bàn giao đến trước ngày Khai trương): Bên Thuê sẽ không phải thanh toán Tiền Thuê, Phí Dịch vụ và Phí hỗ trợ Kinh doanh.',
      };
    case 'RENT':
      return {
        fact: f.escalationPercent > 0
          ? `Năm 1 của Thời hạn thuê:\nGiá thuê: ${money(f.rentPerSqm, cur)}/m²/tháng\nTừ năm 2 trở đi, giá thuê tăng ${num(f.escalationPercent)}% so với năm liền kề trước đó.`
          : `Giá thuê: ${money(f.rentPerSqm, cur)}/m²/tháng\nKhông áp dụng điều chỉnh tăng giá thuê theo năm.`,
        narrative: null,
      };
    case 'SERVICE_FEE':
      return {
        fact: f.serviceFeeSqm != null ? `${money(f.serviceFeeSqm, cur)}/m²/tháng` : UNKNOWN,
        narrative: '(Chưa bao gồm Thuế GTGT).',
      };
    case 'BUSINESS_SUPPORT_FEE':
      return { fact: `${money(f.businessSupportFeeSqm, cur)}/m²/tháng`, narrative: '(Chưa bao gồm Thuế GTGT).' };
    case 'UTILITIES':
      return {
        fact: f.utilityFee > 0 ? `Phí tiện ích: ${money(f.utilityFee, cur)}/tháng` : null,
        narrative: 'Các Phí tiện ích: điện, nước, gas, … trong phần Diện Tích Thuê của Khách thuê sẽ được tính theo đồng hồ tiêu thụ được cấp tại khu vực thuê và được thanh toán bởi Bên Thuê.',
      };
    case 'OPERATING_HOURS':
      // No hours recorded: say whose rule applies instead of printing one mall's
      // hours on every mall's document.
      return { fact: f.operatingHours ?? `Theo quy định vận hành của TTTM ${mallLabel(f)}.`, narrative: null };
    case 'AFTER_HOURS':
      return {
        fact: f.afterHoursFee > 0 ? `Phí ngoài giờ: ${money(f.afterHoursFee, cur)}/giờ.` : null,
        narrative: 'Các chi phí liên quan đến hoạt động ngoài giờ sẽ được Bên Thuê thanh toán theo quy định của TTTM.',
      };
    case 'EXCHANGE_RATE': {
      const { rate, source } = f.exchangeRate;
      // Proposal.exchangeRate is documented and captured as VND per USD. It is
      // not a conversion rule for any other currency, so none is implied.
      const recorded = rate != null ? `1 USD = ${num(rate)} VND${source ? `\nNguồn: ${source}` : ''}` : null;
      const fact = !FX_RULE_CURRENCIES.includes(f.currency)
        ? `Chưa cấu hình quy tắc quy đổi tỷ giá cho ${f.currency}.${recorded ? `\nTỷ giá USD/VND ghi nhận trên Proposal: ${recorded}` : ''}`
        : recorded
          ? `Tỷ giá ghi nhận trên Proposal: ${recorded}`
          : 'Chưa ghi nhận tỷ giá cho Proposal này.';
      return {
        fact,
        narrative: '• Tỷ giá áp dụng cho Tiền thuê là tỷ giá bán ra của Ngân hàng TMCP Ngoại Thương Việt Nam vào ngày Bên Cho Thuê ban hành Thư Đề Nghị Cho Thuê/ Hợp Đồng Thuê.',
      };
    }
    case 'PAYMENT':
      // Proposal.paymentTermDays is "số ngày thanh toán" and nothing more: it
      // records no anchor (invoice date, period start) and no day-of-month rule,
      // so the document states the number of days without inventing either.
      return {
        fact: `Thời hạn thanh toán: ${f.paymentTermDays} ngày.`,
        narrative: '• Tiền thuê bao gồm: Tiền thuê, Phí Dịch vụ, Phí hỗ trợ Kinh doanh và các chi phí phát sinh nếu có (đã bao gồm Thuế GTGT).',
      };
    case 'DEPOSIT': {
      const lines = [
        f.depositLease != null && f.depositLease > 0
          ? `Tiền Đặt cọc: ${money(f.depositLease, cur)} (tương đương ${depositMonthsText(f.depositMonths)} tháng Tiền thuê và Phí Dịch vụ)`
          : `Tiền Đặt cọc tương đương ${depositMonthsText(f.depositMonths)} tháng Tiền thuê và Phí Dịch vụ`,
      ];
      if (f.depositFitout > 0) lines.push(`Cọc thi công: ${money(f.depositFitout, cur)}`);
      if (f.fitoutFee > 0) lines.push(`Phí thi công: ${money(f.fitoutFee, cur)}`);
      return {
        fact: lines.join('\n'),
        narrative: 'Tiền Đặt cọc không bao gồm Thuế GTGT và sẽ được thanh toán trong vòng 07 (bảy) ngày kể từ ngày ký Thư Đề Nghị Cho Thuê.',
      };
    }
    case 'FITOUT_PERIOD':
      return {
        fact: `Dự kiến ${f.fitoutDays} ngày kể từ Ngày Bàn giao.\nNgày Khai trương dự kiến: ${formatVnDate(f.openingDate)}`,
        narrative: null,
      };
    case 'FITOUT_FEE':
      return {
        fact: null,
        narrative: 'Bên Thuê thanh toán cho Bên Cho Thuê trước Ngày Bàn giao. Trong trường hợp có ngày ngưng thi công thực tế do lỗi của Bên Cho Thuê, Bên Cho Thuê sẽ giảm trừ phần Tiền Phí thi công cho những ngày ngưng thi công thực tế vào Tiền thuê của tháng đầu tiên của Thời hạn thuê.',
      };
    case 'HANDOVER':
      return {
        fact: f.handoverDate ? `Dự kiến ngày ${formatVnDate(f.handoverDate)}` : 'Ngày bàn giao dự kiến: Chưa xác định',
        narrative: `Hoặc một ngày khác theo thông báo của Trung tâm thương mại ${mallLabel(f)} bằng văn bản trước 07 (bảy) ngày.`,
      };
    case 'SPECIAL_CONDITIONS':
      return { fact: f.specialConditions, narrative: null };
  }
}

// ── Approval evidence ────────────────────────────────────────────────────────

const PRESENTATION: Record<string, ProposalDocumentApprovalStep['presentation']> = {
  PENDING: 'EXPECTED_APPROVER',
  APPROVED: 'APPROVED_BY',
  REJECTED: 'REJECTED_BY',
  SKIPPED: 'SKIPPED',
};

export function buildApproval(src: ProposalDocumentSource): ProposalDocumentApproval {
  return buildApprovalFromWorkflow(src.approvalWorkflow);
}

type WorkflowEvidence = NonNullable<ProposalDocumentSource['approvalWorkflow']>;

/**
 * Approval evidence from one workflow's steps. With `asOf`, a decision made
 * after that instant is shown as still pending, so a PDF rendered for an email
 * or a send is reproducible byte-for-byte later.
 */
export function buildApprovalFromWorkflow(wf: WorkflowEvidence | null | undefined, asOf?: Date | null): ProposalDocumentApproval {
  if (!wf) return { state: 'NOT_SUBMITTED', steps: [] };
  const decidedBy = (s: WorkflowEvidence['steps'][number]) => {
    const decided = s.status === 'APPROVED' || s.status === 'REJECTED';
    if (!decided) return false;
    if (!asOf) return true;
    return !!s.decidedAt && new Date(s.decidedAt).getTime() <= asOf.getTime();
  };
  const steps = [...wf.steps]
    .sort((a, b) => a.stepOrder - b.stepOrder || a.id.localeCompare(b.id))
    .map((s): ProposalDocumentApprovalStep => {
      const decided = decidedBy(s);
      // A step not decided (as of the cut-off) is an expected approver, never a signer.
      const status = decided ? s.status : (s.status === 'SKIPPED' ? 'SKIPPED' : 'PENDING');
      // Decided: the identity captured at decision time, never today's User row.
      // Pending: the currently assigned approver.
      const snapshot = decided ? s.decidedByDisplayName ?? null : null;
      const identitySource: ProposalDocumentApprovalStep['identitySource'] = !decided
        ? 'ASSIGNED_APPROVER'
        : snapshot ? 'DECISION_SNAPSHOT' : 'LEGACY_UNSNAPSHOTTED';
      return {
        stepOrder: s.stepOrder,
        stepName: s.stepName,
        approverRole: s.approverRole,
        approverId: decided ? (s.decidedByUserId ?? s.approverId ?? s.approver?.id ?? null) : (s.approverId ?? s.approver?.id ?? null),
        approverName: snapshot ?? s.approver?.fullName ?? null,
        identitySource,
        status: status as ProposalDocumentApprovalStep['status'],
        presentation: PRESENTATION[status] ?? 'EXPECTED_APPROVER',
        decidedAt: decided && s.decidedAt ? new Date(s.decidedAt).toISOString() : null,
        comment: decided ? s.comment ?? null : null,
      };
    });
  let state = wf.status as ProposalDocumentApproval['state'];
  if (asOf) {
    if (steps.some((s) => s.status === 'REJECTED')) state = 'REJECTED';
    else if (steps.length && steps.every((s) => s.status === 'APPROVED' || s.status === 'SKIPPED')) state = 'APPROVED';
    else state = 'IN_PROGRESS';
  }
  return { state, steps };
}

// ── Submitted versions ───────────────────────────────────────────────────────

export interface ProposalDocumentVersionRow {
  id: string;
  proposalId: string;
  versionNumber: number;
  status: string;
  sourceFingerprint: string;
  contentVersion: number;
  factsSnapshot: unknown;
  contentSnapshot: unknown;
  renderedSnapshot: unknown;
  submittedById: string;
  submittedAt: Date | string;
  approvalWorkflow: (WorkflowEvidence & { id: string }) | null;
}

/** Everything a submitted version must keep to be reproduced without the Proposal. */
export function snapshotForVersion(model: ProposalDocumentModel, submittedByName: string | null) {
  const rendered: ProposalDocumentRenderedSnapshot = {
    schemaVersion: PROPOSAL_DOCUMENT_SCHEMA_VERSION,
    proposalNumber: model.proposalNumber,
    header: model.header,
    preamble: model.preamble,
    bodyIntro: model.bodyIntro,
    items: model.items,
    closingLine: model.closingLine,
    presentation: model.presentation,
    warnings: model.warnings,
    warningCodes: model.warningCodes,
    submittedByName,
  };
  return {
    sourceFingerprint: model.sync.sourceFingerprint,
    contentVersion: model.sync.contentVersion,
    factsSnapshot: model.facts,
    contentSnapshot: model.editableContent,
    renderedSnapshot: rendered,
  };
}

/**
 * The document exactly as submitted. Nothing here reads today's Proposal,
 * Tenant, Mall or User: renaming any of them after submit cannot change it.
 * Approval evidence comes only from the workflow bound to this version.
 */
export function buildVersionDocument(
  row: ProposalDocumentVersionRow,
  opts: { proposalStatus: string; liveFingerprint?: string | null; asOf?: Date | null },
): ProposalDocumentModel {
  const rendered = row.renderedSnapshot as ProposalDocumentRenderedSnapshot;
  const facts = row.factsSnapshot as ProposalDocumentFacts;
  const liveFingerprint = opts.liveFingerprint ?? null;
  return {
    schemaVersion: PROPOSAL_DOCUMENT_SCHEMA_VERSION,
    proposalId: row.proposalId,
    proposalNumber: rendered.proposalNumber,
    status: opts.proposalStatus,
    facts,
    header: rendered.header,
    preamble: rendered.preamble,
    bodyIntro: rendered.bodyIntro,
    items: rendered.items,
    closingLine: rendered.closingLine,
    presentation: rendered.presentation,
    approval: buildApprovalFromWorkflow(row.approvalWorkflow, opts.asOf),
    version: {
      id: row.id,
      versionNumber: row.versionNumber,
      status: row.status as ProposalDocumentVersionInfo['status'],
      submittedAt: new Date(row.submittedAt).toISOString(),
      submittedById: row.submittedById,
      submittedByName: rendered.submittedByName ?? null,
      sourceFingerprint: row.sourceFingerprint,
      approvalWorkflowId: row.approvalWorkflow?.id ?? null,
      liveFingerprint,
      liveDiffers: liveFingerprint !== null && liveFingerprint !== row.sourceFingerprint,
    },
    approvalAsOf: opts.asOf ? opts.asOf.toISOString() : null,
    editableContent: row.contentSnapshot as ProposalDocumentEditableContent,
    sync: {
      sourceFingerprint: row.sourceFingerprint,
      savedFingerprint: row.sourceFingerprint,
      contentVersion: row.contentVersion,
      savedAt: null,
      savedById: null,
      documentStale: false,
      staleReason: null,
      // A submitted version was reviewed by definition: submit required it.
      reviewState: 'REVIEWED',
      reviewedFingerprint: row.sourceFingerprint,
      reviewedAt: null,
      reviewedById: null,
      reviewedByName: null,
      legacyContentNotImported: [],
      legacySignatoriesIgnored: false,
    },
    warnings: rendered.warnings,
    warningCodes: rendered.warningCodes,
  };
}

// ── Stored content ───────────────────────────────────────────────────────────

const DATA_URL = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** ~2 MB of image bytes once base64 is decoded. */
export const MAX_IMAGE_DATA_URL_LENGTH = 2_800_000;

export function isAcceptedImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_IMAGE_DATA_URL_LENGTH && DATA_URL.test(value);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function emptyEditableContent(): ProposalDocumentEditableContent {
  return {
    docNumber: null, documentDate: null, subject: null, preamble: null, bodyIntro: null,
    closingLine: null, items: {}, itemOrder: null, logoDataUrl: null, layoutImageDataUrl: null,
    primaryColor: null,
  };
}

function isStoredV2(value: unknown): value is StoredProposalDocumentContentV2 {
  return !!value && typeof value === 'object'
    && (value as { schemaVersion?: unknown }).schemaVersion === PROPOSAL_DOCUMENT_SCHEMA_VERSION;
}

export interface NormalizedStoredContent {
  kind: 'NONE' | 'V2' | 'LEGACY';
  content: ProposalDocumentEditableContent;
  savedFingerprint: string | null;
  contentVersion: number;
  savedAt: string | null;
  savedById: string | null;
  legacyContentNotImported: ProposalDocumentItemKey[];
  legacySignatoriesIgnored: boolean;
  warnings: string[];
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * Reads whatever is in Proposal.editorContent without writing it back. Pre-v2
 * content was a full rendered snapshot; only the parts that are genuinely
 * editorial are carried forward, and nothing is deleted until the author saves.
 */
export function normalizeStoredContent(raw: unknown): NormalizedStoredContent {
  const base = {
    savedFingerprint: null, contentVersion: 0, savedAt: null, savedById: null,
    legacyContentNotImported: [] as ProposalDocumentItemKey[], legacySignatoriesIgnored: false,
    warnings: [] as string[],
  };
  if (raw == null || typeof raw !== 'object') {
    return { kind: 'NONE', content: emptyEditableContent(), ...base };
  }

  if (isStoredV2(raw)) {
    return {
      ...base,
      kind: 'V2',
      content: { ...emptyEditableContent(), ...raw.content, items: { ...(raw.content?.items ?? {}) } },
      savedFingerprint: raw.sourceFingerprint ?? null,
      contentVersion: Number.isInteger(raw.contentVersion) ? raw.contentVersion : 0,
      savedAt: raw.savedAt ?? null,
      savedById: raw.savedById ?? null,
    };
  }

  const v1 = raw as Record<string, unknown>;
  const content = emptyEditableContent();
  const warnings: string[] = [];
  const notImported: ProposalDocumentItemKey[] = [];
  const order: ProposalDocumentItemKey[] = [];

  content.docNumber = str(v1.docNumber);
  content.bodyIntro = str(v1.bodyIntro);
  content.closingLine = str(v1.closingLine);
  if (Array.isArray(v1.preamble) && v1.preamble.every((p) => typeof p === 'string')) {
    content.preamble = v1.preamble as string[];
  }
  const [d, m, y] = [v1.dateDay, v1.dateMonth, v1.dateYear].map((x) => Number(String(x ?? '').trim()));
  if (Number.isInteger(d) && Number.isInteger(m) && Number.isInteger(y) && y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
    content.documentDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (isHexColor(v1.primaryColor)) content.primaryColor = v1.primaryColor;
  for (const [from, to] of [['logoBase64', 'logoDataUrl'], ['layoutImageBase64', 'layoutImageDataUrl']] as const) {
    const value = v1[from];
    if (typeof value === 'string' && value) {
      if (isAcceptedImageDataUrl(value)) content[to] = value;
      else warnings.push(`Ảnh ${from === 'logoBase64' ? 'logo' : 'layout'} đã lưu không phải PNG/JPEG hợp lệ nên không được đưa vào tờ trình.`);
    }
  }

  if (Array.isArray(v1.items)) {
    const byLegacyLabel = new Map(PROPOSAL_DOCUMENT_ITEMS.map((i) => [i.legacyLabel.trim(), i]));
    for (const entry of v1.items as Array<Record<string, unknown>>) {
      const def = byLegacyLabel.get(String(entry?.label ?? '').trim());
      if (!def || order.includes(def.key)) continue;
      order.push(def.key);
      const override: { narrativeText?: string | null; note?: string } = {};
      const note = str(entry.note);
      if (note) override.note = note;
      const legacyContent = str(entry.content);
      if (legacyContent?.trim()) {
        if (def.legacyContentImportable) override.narrativeText = legacyContent;
        else notImported.push(def.key);
      }
      if (Object.keys(override).length) content.items[def.key] = override;
    }
  }
  if (order.length) content.itemOrder = order;

  return {
    ...base,
    kind: 'LEGACY',
    content,
    legacyContentNotImported: notImported,
    legacySignatoriesIgnored: Array.isArray(v1.signatories) && v1.signatories.length > 0,
    warnings,
  };
}

// ── Editorial defaults ───────────────────────────────────────────────────────

export interface EditorialDefaults {
  docNumber: string;
  documentDate: string | null;
  subject: string;
  preamble: string[];
  bodyIntro: string;
  closingLine: string;
  narratives: Partial<Record<ProposalDocumentItemKey, string | null>>;
  notes: Partial<Record<ProposalDocumentItemKey, string>>;
}

/**
 * The wording a document gets when the author has not changed it. Exposed so
 * a save can tell "left as generated" from "rewritten": storing generated text
 * as if it were an edit is exactly how the old editor froze a document.
 */
export function editorialDefaults(src: ProposalDocumentSource, facts: ProposalDocumentFacts, now: Date): EditorialDefaults {
  const narratives: EditorialDefaults['narratives'] = {};
  const notes: EditorialDefaults['notes'] = {};
  for (const def of PROPOSAL_DOCUMENT_ITEMS) {
    narratives[def.key] = rowParts(def.key, facts).narrative;
    notes[def.key] = def.defaultNote ?? '';
  }
  return {
    docNumber: defaultDocNumber(src),
    documentDate: defaultDocumentDate(src, now),
    subject: defaultSubject(facts),
    preamble: defaultPreamble(facts),
    bodyIntro: defaultBodyIntro(facts),
    closingLine: DEFAULT_CLOSING,
    narratives,
    notes,
  };
}

// ── Warnings ─────────────────────────────────────────────────────────────────

export type ProposalDocumentWarningCode =
  | 'MALL_UNRESOLVED'
  | 'PREPARER_UNRESOLVED'
  | 'CATEGORY_LEGACY'
  | 'FX_RATE_MISSING'
  | 'FX_RULE_NOT_CONFIGURED'
  | 'SERVICE_FEE_MISSING'
  | 'LEGACY_IMAGE_DROPPED';

export function documentWarnings(facts: ProposalDocumentFacts, carried: string[] = []) {
  const warnings = [...carried];
  const warningCodes: ProposalDocumentWarningCode[] = carried.length ? ['LEGACY_IMAGE_DROPPED'] : [];
  const add = (code: ProposalDocumentWarningCode, message: string) => { warningCodes.push(code); warnings.push(message); };
  if (!facts.mall.name) add('MALL_UNRESOLVED', 'Không xác định được Mall của Proposal.');
  if (!facts.preparedBy.fullName) add('PREPARER_UNRESOLVED', 'Không xác định được người lập Proposal.');
  if (facts.category.legacy) add('CATEGORY_LEGACY', `Ngành hàng "${facts.category.name}" là dữ liệu cũ chưa gắn danh mục ngành hàng chuẩn.`);
  if (facts.serviceFeeSqm == null) add('SERVICE_FEE_MISSING', 'Proposal chưa có Phí Dịch vụ.');
  if (!FX_RULE_CURRENCIES.includes(facts.currency)) {
    add('FX_RULE_NOT_CONFIGURED', `Chưa cấu hình quy tắc quy đổi tỷ giá cho ${facts.currency}; hệ thống không tự quy đổi.`);
  } else if (facts.currency !== 'VND' && facts.exchangeRate.rate == null) {
    add('FX_RATE_MISSING', `Proposal tính bằng ${facts.currency} nhưng chưa ghi nhận tỷ giá.`);
  }
  return { warnings, warningCodes };
}

// ── Review gate ──────────────────────────────────────────────────────────────

/**
 * REVIEWED needs positive evidence: a v2 save (the explicit review action) by a
 * user who still exists and is active, made after the latest submission, whose
 * fingerprint is today's. Nothing else counts — not opening the editor, not a
 * GET of the document, not defaults that happen to match.
 */
export function reviewStateOf(
  stored: NormalizedStoredContent,
  fingerprint: string,
  src: Pick<ProposalDocumentSource, 'reviewer' | 'lastSubmittedAt'>,
): ProposalDocumentReviewState {
  if (stored.kind !== 'V2' || !stored.savedFingerprint || !stored.savedAt || !stored.savedById) return 'NOT_REVIEWED';
  const reviewer = src.reviewer;
  if (!reviewer || reviewer.id !== stored.savedById || !reviewer.isActive || reviewer.deletedAt) return 'NOT_REVIEWED';
  if (src.lastSubmittedAt && new Date(stored.savedAt).getTime() <= new Date(src.lastSubmittedAt).getTime()) {
    return 'NOT_REVIEWED';
  }
  return stored.savedFingerprint === fingerprint ? 'REVIEWED' : 'STALE';
}

// ── Assembly ─────────────────────────────────────────────────────────────────

function orderKeys(visible: ProposalDocumentItemKey[], saved: ProposalDocumentItemKey[] | null) {
  if (!saved?.length) return visible;
  const seen = new Set<ProposalDocumentItemKey>();
  const ordered: ProposalDocumentItemKey[] = [];
  for (const k of saved) {
    if (visible.includes(k) && !seen.has(k)) { ordered.push(k); seen.add(k); }
  }
  for (const k of visible) if (!seen.has(k)) ordered.push(k);
  return ordered;
}

export function buildProposalDocument(src: ProposalDocumentSource, now: Date): ProposalDocumentModel {
  const facts = buildFacts(src);
  const fingerprint = computeSourceFingerprint(facts);
  const stored = normalizeStoredContent(src.editorContent);
  const c = stored.content;
  const defaults = editorialDefaults(src, facts, now);

  const visibleKeys = PROPOSAL_DOCUMENT_ITEM_KEYS.filter(
    (k) => k !== 'EXCHANGE_RATE' || isExchangeRateRelevant(facts),
  );
  const items: ProposalDocumentItem[] = orderKeys(visibleKeys, c.itemOrder).map((key, idx) => {
    const def = ITEM_BY_KEY.get(key)!;
    const parts = rowParts(key, facts);
    const saved = c.items[key];
    const overridden = def.narrativeEditable && typeof saved?.narrativeText === 'string';
    return {
      key,
      stt: idx + 1,
      label: def.label,
      factText: parts.fact,
      narrativeText: overridden ? saved!.narrativeText! : parts.narrative,
      narrativeEditable: def.narrativeEditable,
      narrativeOverridden: overridden,
      defaultNarrativeText: parts.narrative,
      note: typeof saved?.note === 'string' ? saved.note : (defaults.notes[key] ?? ''),
    };
  });

  let staleReason: ProposalDocumentStaleReason | null = null;
  if (stored.kind === 'LEGACY') staleReason = 'LEGACY_UNVERIFIED';
  else if (stored.kind === 'V2' && stored.savedFingerprint !== fingerprint) staleReason = 'SOURCE_CHANGED';
  const reviewState = reviewStateOf(stored, fingerprint, src);

  const { warnings, warningCodes } = documentWarnings(facts, stored.warnings);

  return {
    schemaVersion: PROPOSAL_DOCUMENT_SCHEMA_VERSION,
    proposalId: src.id,
    proposalNumber: src.proposalNumber,
    status: src.status,
    facts,
    header: {
      organisationLines: ORGANISATION_LINES,
      docNumber: c.docNumber?.trim() ? c.docNumber : defaults.docNumber,
      city: facts.mall.city,
      documentDate: c.documentDate ?? defaults.documentDate,
      title: DOCUMENT_TITLE,
      subject: c.subject?.trim() ? c.subject : defaults.subject,
      addressee: ADDRESSEE,
    },
    preamble: c.preamble?.length ? c.preamble : defaults.preamble,
    bodyIntro: c.bodyIntro?.trim() ? c.bodyIntro : defaults.bodyIntro,
    items,
    closingLine: c.closingLine?.trim() ? c.closingLine : defaults.closingLine,
    presentation: {
      logoDataUrl: isAcceptedImageDataUrl(c.logoDataUrl) ? c.logoDataUrl : null,
      layoutImageDataUrl: isAcceptedImageDataUrl(c.layoutImageDataUrl) ? c.layoutImageDataUrl : null,
      primaryColor: isHexColor(c.primaryColor) ? c.primaryColor : DEFAULT_PRIMARY_COLOR,
    },
    approval: buildApproval(src),
    version: null,
    approvalAsOf: null,
    editableContent: c,
    sync: {
      sourceFingerprint: fingerprint,
      savedFingerprint: stored.savedFingerprint,
      contentVersion: stored.contentVersion,
      savedAt: stored.savedAt,
      savedById: stored.savedById,
      documentStale: staleReason !== null,
      staleReason,
      reviewState,
      reviewedFingerprint: stored.kind === 'V2' ? stored.savedFingerprint : null,
      reviewedAt: stored.kind === 'V2' ? stored.savedAt : null,
      reviewedById: stored.kind === 'V2' ? stored.savedById : null,
      reviewedByName: stored.kind === 'V2' && src.reviewer?.id === stored.savedById ? src.reviewer?.fullName ?? null : null,
      legacyContentNotImported: stored.legacyContentNotImported,
      legacySignatoriesIgnored: stored.legacySignatoriesIgnored,
    },
    warnings,
    warningCodes,
  };
}
