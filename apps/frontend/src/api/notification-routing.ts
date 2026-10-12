import api from '@/lib/axios';

/**
 * CR-NOTIFICATION-RECIPIENT-ROUTING -- admin governance of who receives each
 * notification. The event catalogue, the default rule text and the allowed
 * routing modes all come from the backend registry; this file never duplicates
 * that metadata.
 */

export type NotificationEventCategory = 'INTERNAL_ROLE_ROUTED' | 'EXTERNAL_BUSINESS_RECIPIENT' | 'WORKFLOW_APPROVER';
export type NotificationRoutingMode = 'DEFAULT' | 'REPLACE' | 'DEFAULT_PLUS_CC';
export type NotificationRecipientType = 'TO' | 'CC';

export interface RoutingRecipient {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  recipientType: NotificationRecipientType;
  eligible: boolean;
  reasonCodes: string[];
}

export interface RoutingEvent {
  eventKey: string;
  displayNameVi: string;
  descriptionVi: string;
  defaultRecipientRuleVi: string;
  category: NotificationEventCategory;
  scope: 'MALL' | 'GLOBAL';
  configurable: boolean;
  allowedModes: NotificationRoutingMode[];
  requiredActionPermission: string | null;
  eligibleRoles: string[];
  transport: string;
  producer: string;
  mode: NotificationRoutingMode;
  version: number | null;
  updatedAt: string | null;
  updatedById: string | null;
  recipients: RoutingRecipient[];
}

export interface RoutingCandidate {
  id: string;
  fullName: string;
  email: string;
  role: string;
  eligible: boolean;
  reasonCodes: string[];
}

export interface TestSendResult {
  eventKey: string;
  mallId: string;
  sentTo: Array<{ userId: string; email: string; skipped: boolean }>;
  diagnostics: Array<{ userId: string; eligible: boolean; reasonCodes: string[] }>;
}

export const CATEGORY_LABEL: Record<NotificationEventCategory, string> = {
  INTERNAL_ROLE_ROUTED: 'Nội bộ theo vai trò',
  EXTERNAL_BUSINESS_RECIPIENT: 'Gửi khách / đối tác',
  WORKFLOW_APPROVER: 'Theo quy trình phê duyệt',
};

export const MODE_LABEL: Record<NotificationRoutingMode, string> = {
  DEFAULT: 'Mặc định',
  REPLACE: 'Thay thế người nhận',
  DEFAULT_PLUS_CC: 'Mặc định + gửi thêm bản sao',
};

export const ELIGIBILITY_REASON_LABEL: Record<string, string> = {
  USER_INACTIVE: 'Tài khoản ngừng hoạt động',
  NO_EMAIL: 'Chưa có email',
  NO_MALL_ACCESS: 'Không có quyền vào Mall này',
  NO_MODULE_PERMISSION: 'Vai trò không được nhận email này',
  NO_ACTION_PERMISSION: 'Thiếu quyền thao tác liên quan',
  NO_RESOURCE_ACCESS: 'Không truy cập được dữ liệu của sự kiện',
  NO_LEASE_TYPE_ACCESS: 'Không thuộc loại hình thuê được phân công',
  EVENT_NOT_CONFIGURABLE: 'Sự kiện không cho phép cấu hình',
  RESOURCE_UNRESOLVED: 'Chưa xác định được đối tượng',
};

export const notificationRoutingApi = {
  listEvents: (mallId?: string | null): Promise<{ mallId: string; items: RoutingEvent[] }> =>
    api.get('/notification-routing/events', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  candidates: (eventKey: string, mallId?: string | null): Promise<RoutingCandidate[]> =>
    api.get(`/notification-routing/events/${eventKey}/candidates`, { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  upsert: (
    eventKey: string,
    mallId: string | null | undefined,
    data: { mode: NotificationRoutingMode; recipients: Array<{ userId: string; recipientType: NotificationRecipientType }>; expectedVersion?: number },
  ): Promise<RoutingEvent> =>
    api.put(`/notification-routing/events/${eventKey}`, data, { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  reset: (eventKey: string, mallId?: string | null) =>
    api.delete(`/notification-routing/events/${eventKey}`, { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  sendTest: (eventKey: string, mallId?: string | null): Promise<TestSendResult> =>
    api.post(`/notification-routing/events/${eventKey}/test`, {}, { params: mallId ? { mallId } : undefined }).then((r) => r.data),
};
