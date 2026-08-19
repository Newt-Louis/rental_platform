/**
 * Splits the platform's single `Notification.type` (free-form string, see
 * apps/backend/prisma/schema.prisma `Notification` model) into two UX
 * categories: something the user must act on ("task") vs. something they
 * should simply know ("notification"). Both categories share the same
 * underlying data — this is a display/query classification only, no new
 * backend model. See docs/audit/09-TASK-NOTIFICATION-CENTER.md.
 *
 * Type list verified 2026-08-18 against every live `notificationsService.create()`
 * call site under apps/backend/src/modules/**. Unlisted/unknown types default to
 * "notification" (the safer default — never hide something from the informational
 * feed just because its type wasn't in this map yet).
 */
export type NotificationCategory = "task" | "notification";

const TASK_TYPES = new Set<string>([
  "APPROVAL_PENDING", // proposals.service.ts — needs an approver decision
  "TICKET_SLA_BREACH", // ticket-sla.service.ts — needs assignee action
  "TICKET_ESCALATION", // ticket-sla.service.ts — needs escalation-target action
  "TICKET_INSPECTION_CREATED", // tickets.service.ts — new ticket needs assignment
  "MAINTENANCE", // tickets.service.ts — maintenance due-soon/overdue reminders
  "FITOUT_SLA_BREACH", // fitout-sla.service.ts
  "FITOUT_ESCALATION", // fitout-sla.service.ts
  "FITOUT_ISSUE_ASSIGNED", // fitout-issue.service.ts — needs assignee action
  "FITOUT_ISSUE_OVERDUE", // fitout-issue.service.ts
  "FITOUT_SUBMITTAL_PENDING", // fitout-submittal.service.ts — needs reviewer action
  "AR_DUNNING", // ar-dunning.service.ts — needs Finance action
  "SERVICE_CONTRACT_EXPIRING", // service-contract-reminder.scheduler.ts
  "CONTRACT_EXPIRY", // notifications/contract-expiry.scheduler.ts — needs renewal/handling
  "WORK_ORDER", // patrol.service.ts + work-orders.service.ts — shift/order assigned or overdue
]);

export function classifyNotification(type?: string): NotificationCategory {
  if (!type) return "notification";
  return TASK_TYPES.has(type.toUpperCase()) ? "task" : "notification";
}
