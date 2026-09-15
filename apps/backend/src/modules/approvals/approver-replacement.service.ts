import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PriceApprovalStatus, Role, StepStatus, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../common/services/outbox.service';
import { ApprovalsService } from './approvals.service';

export type ApproverIssue = 'INACTIVE' | 'ROLE_NOT_ELIGIBLE' | 'NO_MALL_ACCESS';

export interface ReplacementSkip {
  entityType: 'PROPOSAL' | 'BOOKING_PRICE';
  entityId: string;
  reference: string;
  stepName: string;
  reason: 'SELF_APPROVAL';
}

/**
 * Replacing the person in charge of approvals in a Mall, in one place.
 *
 * Approval rules name a person. When that person leaves or hands over, every
 * rule naming them had to be edited one by one, and steps already routed to
 * them stayed stuck. Replacing A with B here rewrites, atomically:
 *  - every approval rule of the Mall naming A,
 *  - every still-pending Proposal approval step assigned to A in the Mall,
 *  - every still-pending booking price step assigned to A in the Mall,
 * and notifies B of the steps now waiting on them. A decided step is never
 * touched: it keeps the identity captured when it was decided.
 */
@Injectable()
export class ApproverReplacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /** Everyone the Mall's approvals currently depend on, and what would block them. */
  async listApproversInUse(mallId: string) {
    await this.assertMall(mallId);
    const [rules, proposalSteps, bookingSteps] = await Promise.all([
      this.prisma.approvalPolicyRule.groupBy({ by: ['approverId'], where: { mallId }, _count: { _all: true } }),
      this.prisma.approvalStep.groupBy({ by: ['approverId'], where: this.pendingProposalStepWhere(mallId), _count: { _all: true } }),
      this.prisma.bookingPriceApprovalStep.groupBy({ by: ['approverId'], where: this.pendingBookingStepWhere(mallId), _count: { _all: true } }),
    ]);
    const ids = [...new Set([...rules, ...proposalSteps, ...bookingSteps].map((r) => r.approverId).filter((id): id is string => !!id))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: {
            id: true, fullName: true, email: true, role: true, isActive: true, deletedAt: true,
            mallAccess: { where: { mallId, isActive: true }, select: { id: true }, take: 1 },
          },
        })
      : [];
    const count = (rows: Array<{ approverId: string | null; _count: { _all: number } }>, id: string) =>
      rows.find((r) => r.approverId === id)?._count._all ?? 0;

    return users
      .map((user) => ({
        user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, isActive: user.isActive && !user.deletedAt },
        issues: this.issuesOf(user),
        ruleCount: count(rules, user.id),
        pendingProposalSteps: count(proposalSteps, user.id),
        pendingBookingPriceSteps: count(bookingSteps, user.id),
      }))
      .sort((a, b) => a.user.fullName.localeCompare(b.user.fullName, 'vi'));
  }

  async replace(input: { mallId: string; fromUserId: string; toUserId: string }, actorId: string) {
    const { mallId, fromUserId, toUserId } = input;
    if (fromUserId === toUserId) {
      throw new BadRequestException({ code: 'APPROVER_REPLACEMENT_SAME_USER', message: 'Người phụ trách mới phải khác người phụ trách hiện tại.' });
    }
    await this.assertMall(mallId);
    const successor = await this.assertEligibleSuccessor(mallId, toUserId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const nonce = Date.now();
        const skipped: ReplacementSkip[] = [];

        // The rule's role follows the person, as when a rule is created.
        const rulesUpdated = (await tx.approvalPolicyRule.updateMany({
          where: { mallId, approverId: fromUserId },
          data: { approverId: toUserId, approverRole: successor.role },
        })).count;

        const proposalSteps = await tx.approvalStep.findMany({
          where: { ...this.pendingProposalStepWhere(mallId), approverId: fromUserId },
          select: {
            id: true, stepOrder: true, stepName: true, workflowId: true,
            workflow: {
              select: {
                entityId: true,
                steps: { select: { stepOrder: true, status: true } },
                proposal: { select: { createdById: true, proposalNumber: true } },
              },
            },
          },
        });
        let reassignedProposalSteps = 0;
        for (const step of proposalSteps) {
          const proposal = step.workflow.proposal;
          if (proposal?.createdById === toUserId) {
            skipped.push({ entityType: 'PROPOSAL', entityId: step.workflow.entityId, reference: proposal.proposalNumber, stepName: step.stepName, reason: 'SELF_APPROVAL' });
            continue;
          }
          const moved = await tx.approvalStep.updateMany({
            where: { id: step.id, status: StepStatus.PENDING },
            data: { approverId: toUserId, approverRole: successor.role },
          });
          if (moved.count !== 1) continue;
          reassignedProposalSteps += 1;
          if (this.isCurrent(step.stepOrder, step.workflow.steps)) {
            await this.outbox.enqueue(tx, {
              eventKey: `approval:${step.workflowId}:step-reassigned:${step.id}:${toUserId}:${nonce}`,
              eventName: 'approval.workflow.step-advanced',
              aggregateType: 'APPROVAL_WORKFLOW',
              aggregateId: step.workflowId,
              payload: { workflowId: step.workflowId, entityType: 'PROPOSAL', entityId: step.workflow.entityId, nextStepOrder: step.stepOrder },
            });
          }
        }

        const bookingSteps = await tx.bookingPriceApprovalStep.findMany({
          where: { ...this.pendingBookingStepWhere(mallId), approverId: fromUserId },
          select: {
            id: true, stepOrder: true, stepName: true, bookingId: true,
            booking: {
              select: {
                bookingNumber: true, createdById: true, priceProposedById: true,
                priceApprovalSteps: { select: { stepOrder: true, status: true } },
              },
            },
          },
        });
        let reassignedBookingPriceSteps = 0;
        for (const step of bookingSteps) {
          // The same separation of duties the booking price decision enforces.
          if (step.booking.createdById === toUserId || step.booking.priceProposedById === toUserId) {
            skipped.push({ entityType: 'BOOKING_PRICE', entityId: step.bookingId, reference: step.booking.bookingNumber, stepName: step.stepName, reason: 'SELF_APPROVAL' });
            continue;
          }
          const moved = await tx.bookingPriceApprovalStep.updateMany({
            where: { id: step.id, status: StepStatus.PENDING },
            data: { approverId: toUserId, approverRole: successor.role },
          });
          if (moved.count !== 1) continue;
          reassignedBookingPriceSteps += 1;
          if (this.isCurrent(step.stepOrder, step.booking.priceApprovalSteps)) {
            await this.outbox.enqueue(tx, {
              eventKey: `booking-price:${step.bookingId}:step-reassigned:${step.id}:${toUserId}:${nonce}`,
              eventName: 'booking.price-approval.reassigned',
              aggregateType: 'UNIT_BOOKING',
              aggregateId: step.bookingId,
              payload: { bookingId: step.bookingId },
            });
          }
        }

        const summary = { mallId, fromUserId, toUserId, rulesUpdated, reassignedProposalSteps, reassignedBookingPriceSteps, skipped };
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: 'APPROVAL_APPROVER_REPLACED',
            entityType: 'MALL',
            entityId: mallId,
            payload: JSON.stringify(summary),
            status: 'SUCCESS',
          },
        });
        return summary;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      if (error?.code === 'P2034') {
        throw new ConflictException({
          code: 'APPROVER_REPLACEMENT_CONFLICT',
          message: 'Có thao tác duyệt hoặc cấu hình khác vừa diễn ra. Vui lòng thử lại.',
        });
      }
      throw error;
    }
  }

  private isCurrent(stepOrder: number, steps: Array<{ stepOrder: number; status: StepStatus }>) {
    return steps.filter((s) => s.stepOrder < stepOrder).every((s) => s.status === StepStatus.APPROVED);
  }

  private issuesOf(user: { role: Role; isActive: boolean; deletedAt: Date | null; mallAccess: unknown[] }): ApproverIssue[] {
    const issues: ApproverIssue[] = [];
    if (!user.isActive || user.deletedAt) issues.push('INACTIVE');
    if (!ApprovalsService.ELIGIBLE_APPROVER_ROLES.includes(user.role)) issues.push('ROLE_NOT_ELIGIBLE');
    if (user.role !== Role.ADMIN && !user.mallAccess.length) issues.push('NO_MALL_ACCESS');
    return issues;
  }

  private pendingProposalStepWhere(mallId: string): Prisma.ApprovalStepWhereInput {
    return {
      status: StepStatus.PENDING,
      workflow: { status: WorkflowStatus.IN_PROGRESS, entityType: 'PROPOSAL', proposal: { unit: { mallId } } },
    };
  }

  private pendingBookingStepWhere(mallId: string): Prisma.BookingPriceApprovalStepWhereInput {
    return {
      status: StepStatus.PENDING,
      booking: { priceApprovalStatus: PriceApprovalStatus.PENDING, unit: { mallId } },
    };
  }

  private async assertMall(mallId: string) {
    const mall = await this.prisma.mall.findUnique({ where: { id: mallId }, select: { id: true } });
    if (!mall) throw new NotFoundException('Mall not found');
  }

  /** The same requirements a rule's approver must meet when the rule is written. */
  private async assertEligibleSuccessor(mallId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, fullName: true, role: true, isActive: true, deletedAt: true,
        mallAccess: { where: { mallId, isActive: true }, select: { id: true }, take: 1 },
      },
    });
    if (!user || user.deletedAt) {
      throw new BadRequestException({ code: 'APPROVER_REPLACEMENT_USER_NOT_FOUND', message: 'Tài khoản người phụ trách mới không tồn tại.' });
    }
    const issue = this.issuesOf(user)[0];
    if (issue === 'INACTIVE') {
      throw new BadRequestException({ code: 'APPROVER_REPLACEMENT_USER_INACTIVE', message: `Tài khoản "${user.fullName}" đang bị khoá.` });
    }
    if (issue === 'ROLE_NOT_ELIGIBLE') {
      throw new BadRequestException({ code: 'APPROVER_REPLACEMENT_ROLE_NOT_ELIGIBLE', message: `Tài khoản "${user.fullName}" (${user.role}) không có quyền duyệt đề xuất.` });
    }
    if (issue === 'NO_MALL_ACCESS') {
      throw new BadRequestException({ code: 'APPROVER_REPLACEMENT_NO_MALL_ACCESS', message: `Tài khoản "${user.fullName}" chưa được cấp quyền truy cập Mall này.` });
    }
    return user;
  }
}
