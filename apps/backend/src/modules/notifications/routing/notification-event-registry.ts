import { Role } from '@prisma/client';

/**
 * CR-NOTIFICATION-RECIPIENT-ROUTING -- the ONE authoritative catalogue of
 * notification events whose recipients an administrator may govern.
 *
 * Why a registry rather than routing on `EmailDelivery.eventType`: that column
 * is not a stable routing identity. `CONTRACT_EXPIRY` is emitted by two
 * producers with opposite recipient authority (the internal account manager AND
 * the tenant), and `HANDOVER_READINESS_*` is built by string interpolation.
 * Routing keys are therefore declared here and passed explicitly by producers;
 * `eventType` keeps its current values so existing delivery dashboards/filters
 * and CR-120 idempotency keys are untouched.
 *
 * Categories (CR section 2) decide what an admin may change:
 *   A INTERNAL_ROLE_ROUTED     -- recipients derived from role/assignment. DEFAULT | REPLACE | DEFAULT_PLUS_CC
 *   B EXTERNAL_BUSINESS_RECIPIENT -- the TO is business data (tenant, debtor, counterparty). DEFAULT | DEFAULT_PLUS_CC (CC internal users only)
 *   C WORKFLOW_APPROVER        -- the recipient IS workflow state. No configuration at all.
 */

export type NotificationEventCategory = 'INTERNAL_ROLE_ROUTED' | 'EXTERNAL_BUSINESS_RECIPIENT' | 'WORKFLOW_APPROVER';
export type NotificationEventScope = 'MALL' | 'GLOBAL';
export type NotificationRoutingMode = 'DEFAULT' | 'REPLACE' | 'DEFAULT_PLUS_CC';

/**
 * What a configured recipient must be able to reach before they may receive the
 * mail. Checked against live authorization at SEND time, never trusted from the
 * stored configuration (NOTIF-ROUTE-01).
 */
export type NotificationResourceKind =
  | 'FITOUT_PROJECT'
  | 'FITOUT_SUBMITTAL'
  | 'CONTRACT'
  | 'INVOICE'
  | 'TICKET'
  | 'TENANT'
  | 'PROPOSAL'
  | 'UNIT_BOOKING'
  | 'UNIT_HANDOVER_READINESS'
  | 'MALL';

export interface NotificationEventDefinition {
  /** Stable identity. Never rename: configuration rows and audit history key off it. */
  eventKey: string;
  displayNameVi: string;
  descriptionVi: string;
  /** The human-readable default rule, shown in the admin UI (CR section 25 forbids "System default"). */
  defaultRecipientRuleVi: string;
  category: NotificationEventCategory;
  scope: NotificationEventScope;
  resourceKind: NotificationResourceKind;
  /**
   * Roles that may receive this event when no stricter resource check applies.
   * A configured recipient outside this set is rejected (NO_MODULE_PERMISSION).
   */
  eligibleRoles: Role[];
  /**
   * The ModulePermission key that guards this event's data in the application
   * itself (a module key such as `billing`, or an action key such as
   * `handover-readiness-view`). Eligibility consults the same DB-backed matrix
   * the API uses, so a configured recipient can never be mailed data they could
   * not open in the app (NOTIF-FIN-01).
   */
  requiredActionPermission?: string;
  /** `eventType` values the producer writes on EmailDelivery -- for traceability only. */
  deliveryEventTypes: string[];
  producer: string;
  transport: 'QUEUED' | 'DIRECT' | 'DIRECT_LEDGER';
  /** false = retired; configuration stays readable but the event no longer routes. */
  active: boolean;
}

const LEASING_INTERNAL: Role[] = [Role.ADMIN, Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE];
const OPS_INTERNAL: Role[] = [Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION, Role.LEASING_MANAGER];
const FINANCE_INTERNAL: Role[] = [Role.ADMIN, Role.MALL_DIRECTOR, Role.FINANCE];

export const NOTIFICATION_EVENTS: NotificationEventDefinition[] = [
  // ─── Group A — internal, role-routed ──────────────────────────────────────
  {
    eventKey: 'FITOUT_SLA_BREACH',
    displayNameVi: 'Fitout trễ SLA',
    descriptionVi: 'Một giai đoạn thi công vượt thời hạn SLA đã cấu hình.',
    defaultRecipientRuleVi: 'Người phụ trách vận hành của dự án fitout',
    category: 'INTERNAL_ROLE_ROUTED',
    scope: 'MALL',
    resourceKind: 'FITOUT_PROJECT',
    eligibleRoles: OPS_INTERNAL,
    requiredActionPermission: 'fitout',
    deliveryEventTypes: ['FITOUT_SLA'],
    producer: 'fitout/fitout-sla.service.ts',
    transport: 'QUEUED',
    active: true,
  },
  {
    eventKey: 'FITOUT_SLA_ESCALATION',
    displayNameVi: 'Fitout leo thang SLA',
    descriptionVi: 'Dự án fitout vượt SLA và được leo thang theo chính sách.',
    defaultRecipientRuleVi: 'Vai trò leo thang khai báo trong chính sách SLA fitout, có quyền tại Mall',
    category: 'INTERNAL_ROLE_ROUTED',
    scope: 'MALL',
    resourceKind: 'FITOUT_PROJECT',
    eligibleRoles: OPS_INTERNAL,
    requiredActionPermission: 'fitout',
    deliveryEventTypes: ['FITOUT_SLA_ESCALATION'],
    producer: 'fitout/fitout-sla.service.ts',
    transport: 'QUEUED',
    active: true,
  },
  {
    eventKey: 'CONTRACT_EXPIRY_INTERNAL',
    displayNameVi: 'Hợp đồng sắp hết hạn (nội bộ)',
    descriptionVi: 'Nhắc nội bộ trước khi hợp đồng thuê hết hạn.',
    defaultRecipientRuleVi: 'Người phụ trách hợp đồng',
    category: 'INTERNAL_ROLE_ROUTED',
    scope: 'MALL',
    resourceKind: 'CONTRACT',
    eligibleRoles: LEASING_INTERNAL,
    requiredActionPermission: 'contracts',
    deliveryEventTypes: ['CONTRACT_EXPIRY'],
    producer: 'notifications/contract-expiry.scheduler.ts',
    transport: 'QUEUED',
    active: true,
  },
  {
    eventKey: 'TICKET_SLA_ESCALATION',
    displayNameVi: 'Ticket vượt SLA',
    descriptionVi: 'Yêu cầu của khách thuê vượt SLA và được leo thang.',
    defaultRecipientRuleVi: 'Quản lý vận hành của Mall',
    category: 'INTERNAL_ROLE_ROUTED',
    scope: 'MALL',
    resourceKind: 'TICKET',
    eligibleRoles: OPS_INTERNAL,
    requiredActionPermission: 'tickets',
    deliveryEventTypes: ['TICKET_SLA'],
    producer: 'tickets/ticket-sla.service.ts',
    transport: 'DIRECT',
    active: true,
  },
  {
    eventKey: 'HANDOVER_READINESS_EVENT',
    displayNameVi: 'Bàn giao mặt bằng — nhắc hạn và sự kiện',
    descriptionVi: 'Nhắc mốc hạn bàn giao, đổi ngày dự kiến, rủi ro mức cao, xung đột cam kết, xác nhận và mở lại.',
    defaultRecipientRuleVi: 'Người theo dõi + đầu mối Ban dự án + Giám đốc Mall + Leasing Manager',
    category: 'INTERNAL_ROLE_ROUTED',
    scope: 'MALL',
    resourceKind: 'UNIT_HANDOVER_READINESS',
    eligibleRoles: [Role.ADMIN, Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.OPERATION],
    requiredActionPermission: 'handover-readiness-view',
    deliveryEventTypes: [
      'HANDOVER_READINESS_REMINDER',
      'HANDOVER_READINESS_TARGET_DATE_CHANGED',
      'HANDOVER_READINESS_HIGH_RISK_ADDED',
      'HANDOVER_READINESS_COMMITMENT_CONFLICT',
      'HANDOVER_READINESS_CONFIRMED',
      'HANDOVER_READINESS_REOPENED',
    ],
    producer: 'handover-readiness/handover-readiness-notifier.service.ts',
    transport: 'QUEUED',
    active: true,
  },
  {
    eventKey: 'HANDOVER_READINESS_WEEKLY_DIGEST',
    displayNameVi: 'Bàn giao mặt bằng — báo cáo tuần',
    descriptionVi: 'Tổng hợp tình hình bàn giao mặt bằng của Mall, gửi sáng thứ Hai.',
    defaultRecipientRuleVi: 'Giám đốc Mall + Leasing Manager',
    category: 'INTERNAL_ROLE_ROUTED',
    scope: 'MALL',
    resourceKind: 'MALL',
    eligibleRoles: [Role.ADMIN, Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.OPERATION],
    requiredActionPermission: 'handover-readiness-view',
    deliveryEventTypes: ['HANDOVER_READINESS_WEEKLY_DIGEST'],
    producer: 'handover-readiness/handover-readiness.scheduler.ts',
    transport: 'QUEUED',
    active: true,
  },

  // ─── Group B — external business recipient (TO is business data) ──────────
  {
    eventKey: 'INVOICE_ISSUED',
    displayNameVi: 'Hóa đơn đã phát hành',
    descriptionVi: 'Thông báo hóa đơn mới cho bên thanh toán.',
    defaultRecipientRuleVi: 'Email liên hệ của khách thuê / bên thanh toán trên hồ sơ',
    category: 'EXTERNAL_BUSINESS_RECIPIENT',
    scope: 'MALL',
    resourceKind: 'INVOICE',
    // Same authority as GET /billing/invoices/:id -- the `billing` module in
    // the Mall-scoped matrix plus access to the invoice's own Mall.
    eligibleRoles: FINANCE_INTERNAL,
    requiredActionPermission: 'billing',
    deliveryEventTypes: ['INVOICE_ISSUED'],
    producer: 'billing/billing.service.ts',
    transport: 'QUEUED',
    active: true,
  },
  {
    eventKey: 'INVOICE_OVERDUE',
    displayNameVi: 'Hóa đơn quá hạn (nhắc nợ)',
    descriptionVi: 'Nhắc công nợ gửi bên thanh toán theo chính sách AR.',
    defaultRecipientRuleVi: 'Email liên hệ của khách thuê / bên thanh toán trên hồ sơ',
    category: 'EXTERNAL_BUSINESS_RECIPIENT',
    scope: 'MALL',
    resourceKind: 'INVOICE',
    eligibleRoles: FINANCE_INTERNAL,
    requiredActionPermission: 'billing',
    deliveryEventTypes: ['INVOICE_OVERDUE'],
    producer: 'billing/ar-dunning.service.ts',
    transport: 'QUEUED',
    active: true,
  },
  {
    eventKey: 'CONTRACT_EXPIRY_TENANT',
    displayNameVi: 'Hợp đồng sắp hết hạn (gửi khách thuê)',
    descriptionVi: 'Thông báo hết hạn hợp đồng gửi cho khách thuê.',
    defaultRecipientRuleVi: 'Email liên hệ của khách thuê trên hồ sơ',
    category: 'EXTERNAL_BUSINESS_RECIPIENT',
    scope: 'MALL',
    resourceKind: 'CONTRACT',
    eligibleRoles: LEASING_INTERNAL,
    requiredActionPermission: 'contracts',
    deliveryEventTypes: ['CONTRACT_EXPIRY'],
    producer: 'notifications/contract-expiry.scheduler.ts',
    transport: 'QUEUED',
    active: true,
  },
  {
    eventKey: 'TICKET_INSPECTION_TENANT',
    displayNameVi: 'Phiếu kiểm tra gửi khách thuê',
    descriptionVi: 'Vận hành ghi nhận phiếu kiểm tra và thông báo cho khách thuê.',
    defaultRecipientRuleVi: 'Email liên hệ của khách thuê trên hồ sơ',
    category: 'EXTERNAL_BUSINESS_RECIPIENT',
    scope: 'MALL',
    resourceKind: 'TICKET',
    eligibleRoles: OPS_INTERNAL,
    requiredActionPermission: 'tickets',
    deliveryEventTypes: ['TICKET_INSPECTION'],
    producer: 'tickets/tickets.service.ts',
    transport: 'DIRECT',
    active: true,
  },
  {
    eventKey: 'TENANT_PORTAL_ACCESS',
    displayNameVi: 'Kích hoạt / đặt lại mật khẩu Tenant Portal',
    descriptionVi: 'Thư mời kích hoạt hoặc đặt lại mật khẩu tài khoản khách thuê.',
    defaultRecipientRuleVi: 'Email chủ tài khoản khách thuê',
    category: 'EXTERNAL_BUSINESS_RECIPIENT',
    scope: 'MALL',
    resourceKind: 'TENANT',
    eligibleRoles: LEASING_INTERNAL,
    requiredActionPermission: 'tenants',
    deliveryEventTypes: ['TENANT_ACTIVATION', 'PASSWORD_RESET'],
    producer: 'tenants/tenants.service.ts, proposals/proposals.service.ts',
    transport: 'DIRECT',
    // Registered for inventory completeness but NOT offered for configuration:
    // the mail carries a one-time activation/reset token, so an internal copy
    // would hand a third party the ability to take over the tenant account.
    // Routing therefore always returns the producer's own recipient.
    active: false,
  },
  {
    eventKey: 'PROPOSAL_EXTERNAL_SEND',
    displayNameVi: 'Gửi tờ trình ra bên ngoài',
    descriptionVi: 'Gửi bản tờ trình đã duyệt cho người nhận bên ngoài.',
    defaultRecipientRuleVi: 'Người nhận do người gửi chọn tại thời điểm gửi',
    category: 'EXTERNAL_BUSINESS_RECIPIENT',
    scope: 'MALL',
    resourceKind: 'PROPOSAL',
    eligibleRoles: LEASING_INTERNAL,
    requiredActionPermission: 'proposal-send-external',
    deliveryEventTypes: ['PROPOSAL_EXTERNAL_SEND'],
    producer: 'proposals/document/proposal-document-delivery.service.ts',
    transport: 'DIRECT_LEDGER',
    active: true,
  },

  // ─── Group C — workflow approver (never configurable) ─────────────────────
  {
    eventKey: 'PROPOSAL_APPROVAL_REQUIRED',
    displayNameVi: 'Tờ trình chờ phê duyệt',
    descriptionVi: 'Thông báo tới người duyệt hiện hành của tờ trình.',
    defaultRecipientRuleVi: 'Người duyệt hiện tại theo Chính sách phê duyệt',
    category: 'WORKFLOW_APPROVER',
    scope: 'MALL',
    resourceKind: 'PROPOSAL',
    eligibleRoles: [],
    deliveryEventTypes: ['PROPOSAL_APPROVAL'],
    producer: 'proposals/document/proposal-document-delivery.service.ts',
    transport: 'QUEUED',
    active: true,
  },
  {
    eventKey: 'FITOUT_SUBMITTAL_APPROVAL_REQUIRED',
    displayNameVi: 'Hồ sơ fitout chờ phê duyệt',
    descriptionVi: 'Thông báo tới người duyệt hiện hành của hồ sơ fitout.',
    defaultRecipientRuleVi: 'Người duyệt hiện tại theo Chính sách phê duyệt',
    category: 'WORKFLOW_APPROVER',
    scope: 'MALL',
    resourceKind: 'FITOUT_SUBMITTAL',
    eligibleRoles: [],
    deliveryEventTypes: ['FITOUT_SUBMITTAL_APPROVAL'],
    producer: 'fitout/fitout-submittal.service.ts',
    transport: 'QUEUED',
    active: true,
  },
  {
    eventKey: 'BOOKING_PRICE_APPROVAL_REQUIRED',
    displayNameVi: 'Duyệt giá booking',
    descriptionVi: 'Thông báo tới người duyệt giá của booking lệch khung giá.',
    defaultRecipientRuleVi: 'Người duyệt hiện tại theo Chính sách phê duyệt',
    category: 'WORKFLOW_APPROVER',
    scope: 'MALL',
    resourceKind: 'UNIT_BOOKING',
    eligibleRoles: [],
    deliveryEventTypes: ['BOOKING_PRICE_APPROVAL'],
    producer: 'booking/booking.service.ts',
    transport: 'DIRECT',
    active: true,
  },
];

/**
 * Producers deliberately NOT in the registry (CR section 5 requires each to be
 * classified rather than silently omitted):
 *  - email-settings.controller.ts `POST /email-settings/test` -- SMTP connectivity
 *    check sent to the acting administrator. No business recipient to govern.
 *  - email-delivery.service.ts `processBatch()` -- the transport worker that
 *    sends already-routed EmailDelivery rows. Not a producer.
 */
export const OUT_OF_SCOPE_EMAIL_PRODUCERS = [
  { producer: 'email-settings/email-settings.controller.ts', reason: 'Kiểm tra kết nối SMTP, gửi cho chính quản trị viên đang thao tác' },
  { producer: 'notifications/email-delivery.service.ts', reason: 'Worker vận chuyển, không phải nơi phát sinh người nhận' },
] as const;

const BY_KEY = new Map(NOTIFICATION_EVENTS.map((e) => [e.eventKey, e]));

/** Unknown keys fail closed (CR section 33): never treated as Group A. */
export function findNotificationEvent(eventKey: string): NotificationEventDefinition | null {
  return BY_KEY.get(eventKey) ?? null;
}

export function allowedRoutingModes(event: NotificationEventDefinition): NotificationRoutingMode[] {
  switch (event.category) {
    case 'INTERNAL_ROLE_ROUTED':
      return ['DEFAULT', 'REPLACE', 'DEFAULT_PLUS_CC'];
    case 'EXTERNAL_BUSINESS_RECIPIENT':
      return ['DEFAULT', 'DEFAULT_PLUS_CC'];
    case 'WORKFLOW_APPROVER':
      return ['DEFAULT'];
  }
}

export function isConfigurable(event: NotificationEventDefinition): boolean {
  return event.category !== 'WORKFLOW_APPROVER';
}
