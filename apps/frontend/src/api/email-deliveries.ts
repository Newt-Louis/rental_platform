import api from '@/lib/axios';

export type EmailDeliveryStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'RETRYING' | string;

export interface EmailDelivery {
  id: string;
  eventType?: string;
  entityType?: string;
  entityId?: string;
  mallId?: string;
  mall?: { id?: string; name?: string };
  recipient?: string;
  subject?: string;
  status: EmailDeliveryStatus;
  attemptCount?: number;
  lastError?: string | null;
  providerMessageId?: string | null;
  createdAt: string;
  lastAttemptAt?: string | null;
  sentAt?: string | null;
  originalDeliveryId?: string | null;
  resendOfId?: string | null;
  capabilities?: {
    canRetry: boolean;
    canResend: boolean;
    resendMode: 'PAYLOAD_REPLAY' | 'REGENERATE_DOMAIN_TOKEN' | 'NOT_ALLOWED';
  };
}

export interface EmailDeliveryFilters {
  status?: string;
  eventType?: string;
  recipient?: string;
  mallId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const emailDeliveriesApi = {
  list: (params?: EmailDeliveryFilters) => api.get('/notifications/email-deliveries', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/notifications/email-deliveries/${id}`).then((r) => r.data),
  preview: (id: string) => api.get(`/notifications/email-deliveries/${id}/preview`).then((r) => r.data),
  retry: (id: string, operationId: string) => api.post(
    `/notifications/email-deliveries/${id}/retry`,
    undefined,
    { headers: { 'Idempotency-Key': operationId } },
  ).then((r) => r.data),
  resend: (id: string, operationId: string) => api.post(
    `/notifications/email-deliveries/${id}/resend`,
    undefined,
    { headers: { 'Idempotency-Key': operationId } },
  ).then((r) => r.data),
};
