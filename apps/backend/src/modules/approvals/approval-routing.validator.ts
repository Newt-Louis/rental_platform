import { BadRequestException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

/**
 * Proposal governance — approval routing pre-flight.
 *
 * Validates the steps a submit is about to persist, before any workflow row is
 * written. Every failure here used to surface only later, as a workflow nobody
 * could ever approve: a step routed to the Proposal's own preparer (blocked by
 * SoD), a step with no assignee (blocked by assignment authority), or a step
 * assigned to an account that has since been locked or lost its Mall.
 *
 * The rules are the ones ApprovalPolicyRule configuration already enforces when
 * a rule is created (approver exists, is active, holds an eligible role that
 * still matches the rule, and can access the Mall); they are re-checked here
 * because users change after rules are written. No hierarchy is inferred and no
 * fallback approver is chosen: routing comes only from configuration.
 */

export type RoutingIssueReason =
  | 'STEP_UNASSIGNED'
  | 'SELF_APPROVAL'
  | 'APPROVER_NOT_FOUND'
  | 'APPROVER_INACTIVE'
  | 'APPROVER_ROLE_NOT_ELIGIBLE'
  | 'APPROVER_ROLE_CHANGED'
  | 'APPROVER_NO_MALL_ACCESS'
  | 'NO_ACTIONABLE_STEP'
  | 'NO_ACTIVE_POLICY';

export interface RoutingIssue {
  stepOrder: number | null;
  stepName: string | null;
  reason: RoutingIssueReason;
}

export interface RoutingStep {
  stepOrder: number;
  stepName: string;
  approverRole: Role;
  approverId: string | null;
}

export interface RoutingApprover {
  id: string;
  role: Role;
  isActive: boolean;
  deletedAt: Date | null;
  hasMallAccess: boolean;
}

export const ROUTING_MESSAGES = {
  APPROVAL_STEP_UNASSIGNED:
    'Quy trình phê duyệt chưa được gán người phê duyệt cho một hoặc nhiều bước. Vui lòng hoàn tất cấu hình trước khi trình.',
  APPROVAL_ROUTING_SELF_CONFLICT:
    'Quy trình phê duyệt hiện tại phân công người lập Proposal làm người duyệt. Vui lòng điều chỉnh cấu hình người phê duyệt trước khi trình.',
  APPROVAL_ROUTING_INVALID:
    'Cấu hình quy trình phê duyệt không hợp lệ cho Proposal này. Vui lòng kiểm tra lại người phê duyệt của các bước trước khi trình.',
} as const;

export function findRoutingIssues(
  steps: RoutingStep[],
  ctx: { creatorId: string; approvers: Map<string, RoutingApprover>; eligibleRoles: readonly Role[] },
): RoutingIssue[] {
  if (!steps.length) return [{ stepOrder: null, stepName: null, reason: 'NO_ACTIONABLE_STEP' }];
  const issues: RoutingIssue[] = [];
  for (const step of steps) {
    const at = (reason: RoutingIssueReason) => issues.push({ stepOrder: step.stepOrder, stepName: step.stepName, reason });
    if (!step.approverId) { at('STEP_UNASSIGNED'); continue; }
    if (step.approverId === ctx.creatorId) { at('SELF_APPROVAL'); continue; }
    const approver = ctx.approvers.get(step.approverId);
    if (!approver || approver.deletedAt) { at('APPROVER_NOT_FOUND'); continue; }
    if (!approver.isActive) { at('APPROVER_INACTIVE'); continue; }
    if (!ctx.eligibleRoles.includes(approver.role)) { at('APPROVER_ROLE_NOT_ELIGIBLE'); continue; }
    if (approver.role !== step.approverRole) { at('APPROVER_ROLE_CHANGED'); continue; }
    if (approver.role !== Role.ADMIN && !approver.hasMallAccess) at('APPROVER_NO_MALL_ACCESS');
  }
  return issues;
}

/** Most specific code first, so the UI can say exactly what must be fixed. */
export function routingErrorCode(issues: RoutingIssue[]) {
  if (issues.some((i) => i.reason === 'STEP_UNASSIGNED')) return 'APPROVAL_STEP_UNASSIGNED' as const;
  if (issues.some((i) => i.reason === 'SELF_APPROVAL')) return 'APPROVAL_ROUTING_SELF_CONFLICT' as const;
  return 'APPROVAL_ROUTING_INVALID' as const;
}

/**
 * Loads what the check needs, through the caller's transaction, and throws a
 * structured 400 when routing cannot produce a usable workflow. The response
 * carries step numbers, step names and reasons only — no approver identities.
 */
export async function assertApprovalRoutable(
  tx: Prisma.TransactionClient,
  steps: RoutingStep[],
  ctx: { creatorId: string; mallId: string; eligibleRoles: readonly Role[] },
) {
  const ids = [...new Set(steps.map((s) => s.approverId).filter((id): id is string => !!id))];
  const users = ids.length
    ? await tx.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, role: true, isActive: true, deletedAt: true,
          mallAccess: { where: { mallId: ctx.mallId, isActive: true }, select: { id: true }, take: 1 },
        },
      })
    : [];
  const approvers = new Map<string, RoutingApprover>(users.map((u) => [u.id, {
    id: u.id, role: u.role, isActive: u.isActive, deletedAt: u.deletedAt, hasMallAccess: u.mallAccess.length > 0,
  }]));
  const issues = findRoutingIssues(steps, { creatorId: ctx.creatorId, approvers, eligibleRoles: ctx.eligibleRoles });
  if (!issues.length) return;
  const code = routingErrorCode(issues);
  throw new BadRequestException({ code, message: ROUTING_MESSAGES[code], errors: issues });
}
