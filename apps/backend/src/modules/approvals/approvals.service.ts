import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, StepStatus, WorkflowStatus } from '@prisma/client';
import { CreateApprovalPolicyRuleDto } from './dto/create-approval-policy-rule.dto';
import { UpdateApprovalPolicyRuleDto } from './dto/update-approval-policy-rule.dto';
import { OutboxService } from '../../common/services/outbox.service';

/**
 * Sinh khi 1 ApprovalWorkflow hoàn tất (tất cả step đã APPROVED).
 * Consumer theo entityType (vd ProposalsService, FitoutSubmittalService) tự lắng nghe
 * và quyết định hành động — ApprovalsService không biết gì về nghiệp vụ cụ thể.
 */
export interface ApprovalWorkflowCompletedEvent {
  workflowId: string;
  entityType: string;
  entityId: string;
  decidedByUserId: string;
}

export interface ApprovalWorkflowStepAdvancedEvent {
  workflowId: string;
  entityType: string;
  entityId: string;
  nextStepOrder: number;
}

export interface ApprovalWorkflowRejectedEvent {
  workflowId: string;
  entityType: string;
  entityId: string;
  decidedByUserId: string;
  comment?: string;
}

@Injectable()
export class ApprovalsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private outbox: OutboxService,
  ) {}

  async getPending(userId: string, userRole: string, query: { page?: number; limit?: number } = {}) {
    const { page = 1, limit = 15 } = query;

    const where: any = {
      status: StepStatus.PENDING,
      workflow: { status: WorkflowStatus.IN_PROGRESS },
    };
    if (userRole !== 'ADMIN') {
      where.approverRole = userRole as any;
    }

    const steps = await this.prisma.approvalStep.findMany({
      where,
      include: {
        workflow: {
          include: {
            proposal: {
              include: {
                unit: { select: { id: true, code: true, name: true, floor: { select: { id: true, name: true } } } },
                tenant: { select: { id: true, brandName: true } },
              },
            },
            steps: { orderBy: { stepOrder: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Only return steps where all earlier steps in the same workflow are APPROVED.
    const filtered = steps.filter((step) => {
      const earlierSteps = step.workflow.steps.filter((s) => s.stepOrder < step.stepOrder);
      return earlierSteps.every((s) => s.status === StepStatus.APPROVED);
    });

    const total = filtered.length;
    const skip = (Number(page) - 1) * Number(limit);
    const data = filtered.slice(skip, skip + Number(limit));

    return { data, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }

  async getWorkflow(workflowId: string) {
    const workflow = await this.prisma.approvalWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        steps: {
          include: {
            approver: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { stepOrder: 'asc' },
        },
        proposal: {
          include: {
            unit: { include: { floor: true } },
            tenant: true,
            lead: true,
          },
        },
      },
    });

    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }

  async getAllWorkflows(query: { status?: WorkflowStatus; page?: number; limit?: number }) {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * +limit;

    const where: any = {};
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.approvalWorkflow.findMany({
        where,
        skip,
        take: +limit,
        include: {
          steps: { orderBy: { stepOrder: 'asc' } },
          proposal: {
            include: {
              unit: { select: { id: true, code: true, name: true } },
              tenant: { select: { id: true, brandName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.approvalWorkflow.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  /** Tạo 1 ApprovalWorkflow generic cho bất kỳ entityType nào (Proposal, FitoutSubmittal, ...). */
  async createWorkflow(entityType: string, entityId: string, steps: { stepName: string; stepOrder: number; approverRole: string }[], extra: Record<string, unknown> = {}) {
    if (!steps.length) throw new BadRequestException('At least one approval step is required');

    return this.prisma.approvalWorkflow.create({
      data: {
        entityType,
        entityId,
        status: WorkflowStatus.IN_PROGRESS,
        steps: { create: steps as any },
        ...extra,
      },
    });
  }

  async approve(stepId: string, userId: string, userRole: string, comment?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const step = await tx.approvalStep.findUnique({
        where: { id: stepId },
        include: {
          workflow: {
            include: {
              steps: { orderBy: { stepOrder: 'asc' } },
            },
          },
        },
      });

      if (!step) throw new NotFoundException('Approval step not found');
      if (step.status !== StepStatus.PENDING) throw new BadRequestException('Step is not pending');
      if (step.workflow.status !== WorkflowStatus.IN_PROGRESS) {
        throw new BadRequestException('Workflow is not in progress');
      }
      if (userRole !== 'ADMIN' && step.approverRole !== (userRole as any)) {
        throw new ForbiddenException('Not authorized for this step');
      }

      const unapprovedEarlierStep = step.workflow.steps.find(
        (s) => s.stepOrder < step.stepOrder && s.status !== StepStatus.APPROVED,
      );
      if (unapprovedEarlierStep) {
        throw new BadRequestException(`Step ${unapprovedEarlierStep.stepOrder} (${unapprovedEarlierStep.stepName}) must be approved first`);
      }

      await tx.approvalStep.update({
        where: { id: stepId },
        data: { status: StepStatus.APPROVED, approverId: userId, comment, decidedAt: new Date() },
      });

      const completed = step.workflow.steps
        .filter((s) => s.id !== step.id)
        .every((s) => s.status === StepStatus.APPROVED);

      if (completed) {
        await tx.approvalWorkflow.update({
          where: { id: step.workflowId },
          data: { status: WorkflowStatus.APPROVED },
        });
        await this.outbox.enqueue(tx, {
          eventKey: `approval:${step.workflowId}:completed`,
          eventName: 'approval.workflow.completed',
          aggregateType: 'APPROVAL_WORKFLOW',
          aggregateId: step.workflowId,
          payload: {
            workflowId: step.workflowId,
            entityType: step.workflow.entityType,
            entityId: step.workflow.entityId,
            decidedByUserId: userId,
          },
        });
      }

      const nextStep = completed ? undefined : step.workflow.steps.find(
        (s) => s.stepOrder === step.stepOrder + 1 && s.status === StepStatus.PENDING,
      );

      return { step, completed, nextStepOrder: nextStep?.stepOrder };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!result.completed && result.nextStepOrder !== undefined) {
      this.eventEmitter.emit('approval.workflow.step-advanced', {
        workflowId: result.step.workflowId,
        entityType: result.step.workflow.entityType,
        entityId: result.step.workflow.entityId,
        nextStepOrder: result.nextStepOrder,
      } satisfies ApprovalWorkflowStepAdvancedEvent);
    }

    return { message: 'Step approved successfully' };
  }

  async reject(stepId: string, userId: string, userRole: string, comment?: string) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.approvalStep.findUnique({
        where: { id: stepId },
        include: { workflow: true },
      });

      if (!current) throw new NotFoundException('Approval step not found');
      if (current.status !== StepStatus.PENDING) throw new BadRequestException('Step is not pending');
      if (current.workflow.status !== WorkflowStatus.IN_PROGRESS) {
        throw new BadRequestException('Workflow is not in progress');
      }
      if (userRole !== 'ADMIN' && current.approverRole !== (userRole as any)) {
        throw new ForbiddenException('Not authorized for this step');
      }

      await tx.approvalStep.update({
        where: { id: stepId },
        data: { status: StepStatus.REJECTED, approverId: userId, comment, decidedAt: new Date() },
      });

      await tx.approvalWorkflow.update({
        where: { id: current.workflowId },
        data: { status: WorkflowStatus.REJECTED },
      });
      await this.outbox.enqueue(tx, {
        eventKey: `approval:${current.workflowId}:rejected`,
        eventName: 'approval.workflow.rejected',
        aggregateType: 'APPROVAL_WORKFLOW',
        aggregateId: current.workflowId,
        payload: {
          workflowId: current.workflowId,
          entityType: current.workflow.entityType,
          entityId: current.workflow.entityId,
          decidedByUserId: userId,
          comment,
        },
      });

      return current;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { message: 'Step rejected' };
  }

  async getHistory(userId: string, userRole: string, query: { page?: number; limit?: number; status?: string }) {
    const { page = 1, limit = 25, status } = query;
    const skip = (page - 1) * +limit;

    const where: any = {
      status: status ? { in: [status] } : { in: [StepStatus.APPROVED, StepStatus.REJECTED] },
      workflow: { entityType: 'PROPOSAL' },
    };
    if (userRole !== 'ADMIN') {
      where.approverId = userId;
    }

    const [data, total] = await Promise.all([
      this.prisma.approvalStep.findMany({
        where,
        include: {
          approver: { select: { id: true, fullName: true, role: true } },
          workflow: {
            include: {
              proposal: {
                include: {
                  tenant: { select: { id: true, brandName: true } },
                  unit: { select: { id: true, code: true, floor: { select: { name: true } } } },
                },
              },
            },
          },
        },
        orderBy: { decidedAt: 'desc' },
        skip,
        take: +limit,
      }),
      this.prisma.approvalStep.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async listPolicyRules() {
    return this.prisma.approvalPolicyRule.findMany({
      orderBy: [{ stepOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createPolicyRule(dto: CreateApprovalPolicyRuleDto) {
    return this.prisma.approvalPolicyRule.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        stepName: dto.stepName.trim(),
        stepOrder: dto.stepOrder,
        approverRole: dto.approverRole,
        conditionType: dto.conditionType,
        operator: dto.operator,
        threshold: dto.threshold,
        matchValue: dto.matchValue,
        isRequired: dto.isRequired ?? false,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updatePolicyRule(id: string, dto: UpdateApprovalPolicyRuleDto) {
    const existing = await this.prisma.approvalPolicyRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Approval policy rule not found');

    return this.prisma.approvalPolicyRule.update({
      where: { id },
      data: {
        code: dto.code?.trim(),
        name: dto.name?.trim(),
        stepName: dto.stepName?.trim(),
        stepOrder: dto.stepOrder,
        approverRole: dto.approverRole,
        conditionType: dto.conditionType,
        operator: dto.operator,
        threshold: dto.threshold,
        matchValue: dto.matchValue,
        isRequired: dto.isRequired,
        isActive: dto.isActive,
      },
    });
  }
}
