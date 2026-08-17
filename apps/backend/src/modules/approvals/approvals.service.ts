import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, StepStatus, WorkflowStatus } from '@prisma/client';
import {
  ApprovalPolicyConditionType,
  ApprovalPolicyOperator,
  CreateApprovalPolicyRuleDto,
} from './dto/create-approval-policy-rule.dto';
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

  private workflowMallScope(mallIds?: string[]) {
    if (!mallIds) return {};
    return { OR: [
      { proposal: { unit: { mallId: { in: mallIds } } } },
      { fitoutSubmittal: { project: { unit: { mallId: { in: mallIds } } } } },
    ] };
  }

  private workflowListScope(query: { floorId?: string; unitId?: string; search?: string; leaseTermType?: string }) {
    const AND: any[] = [];
    if (query.floorId) AND.push({ proposal: { unit: { floorId: query.floorId } } });
    if (query.unitId) AND.push({ proposal: { unitId: query.unitId } });
    if (query.leaseTermType) AND.push({ proposal: { unit: { leaseTermType: query.leaseTermType } } });
    if (query.search?.trim()) {
      const search = query.search.trim();
      AND.push({ OR: [
        { proposal: { proposalNumber: { contains: search, mode: 'insensitive' } } },
        { proposal: { tenant: { brandName: { contains: search, mode: 'insensitive' } } } },
        { proposal: { lead: { brandName: { contains: search, mode: 'insensitive' } } } },
        { proposal: { unit: { code: { contains: search, mode: 'insensitive' } } } },
      ] });
    }
    return AND.length ? { AND } : {};
  }

  async getPending(userId: string, userRole: string, query: { page?: number; limit?: number; floorId?: string; unitId?: string; search?: string; leaseTermType?: string } = {}, mallIds?: string[]) {
    const { page = 1, limit = 15 } = query;

    const where: any = {
      status: StepStatus.PENDING,
      workflow: { status: WorkflowStatus.IN_PROGRESS, ...this.workflowMallScope(mallIds), ...this.workflowListScope(query) },
    };
    if (userRole !== 'ADMIN') {
      where.OR = [
        { approverId: userId },
        { approverId: null, approverRole: userRole as any },
      ];
    }

    const steps = await this.prisma.approvalStep.findMany({
      where,
      include: {
        workflow: {
          include: {
            proposal: {
              include: {
                unit: { select: { id: true, code: true, name: true, leaseTermType: true, floor: { select: { id: true, name: true } } } },
                tenant: { select: { id: true, brandName: true } },
              },
            },
            steps: { orderBy: { stepOrder: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
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
            approver: { select: { id: true, fullName: true, role: true, email: true, department: true } },
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

  async getAllWorkflows(query: { status?: WorkflowStatus; page?: number; limit?: number }, mallIds?: string[]) {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * +limit;

    const where: any = { ...this.workflowMallScope(mallIds) };
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
      if (userRole !== 'ADMIN' && step.approverId && step.approverId !== userId) {
        throw new ForbiddenException('This approval step is assigned to another user');
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
      if (userRole !== 'ADMIN' && current.approverId && current.approverId !== userId) {
        throw new ForbiddenException('This approval step is assigned to another user');
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

  async getHistory(userId: string, userRole: string, query: { page?: number; limit?: number; status?: string; floorId?: string; unitId?: string; search?: string; leaseTermType?: string }, mallIds?: string[]) {
    const { page = 1, limit = 25, status } = query;
    const skip = (page - 1) * +limit;

    const where: any = {
      status: status ? { in: [status] } : { in: [StepStatus.APPROVED, StepStatus.REJECTED] },
      workflow: { entityType: 'PROPOSAL', ...this.workflowMallScope(mallIds), ...this.workflowListScope(query) },
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
                  unit: { select: { id: true, code: true, leaseTermType: true, floor: { select: { name: true } } } },
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
    const data = this.normalizeAndValidatePolicyRule(dto);
    await this.assertPolicyRuleUnique(data);
    return this.prisma.approvalPolicyRule.create({
      data,
    });
  }

  async updatePolicyRule(id: string, dto: UpdateApprovalPolicyRuleDto) {
    const existing = await this.prisma.approvalPolicyRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Approval policy rule not found');

    const data = this.normalizeAndValidatePolicyRule({ ...existing, ...dto });
    await this.assertPolicyRuleUnique(data, id);
    return this.prisma.approvalPolicyRule.update({
      where: { id },
      data,
    });
  }

  private normalizeAndValidatePolicyRule(rule: any) {
    const code = rule.code?.trim().toUpperCase();
    const name = rule.name?.trim();
    const stepName = rule.stepName?.trim();
    const conditionType = rule.conditionType as ApprovalPolicyConditionType;
    let operator = rule.operator || null;
    let matchValue = typeof rule.matchValue === 'string' ? rule.matchValue.trim() || null : null;
    let threshold = rule.threshold ?? null;

    if (!code || !name || !stepName) {
      throw new BadRequestException('Code, name and step name must not be empty');
    }

    const isRequired = rule.isRequired ?? false;

    const numericConditions = new Set([
      ApprovalPolicyConditionType.DISCOUNT_PCT,
      ApprovalPolicyConditionType.RENT_FREE_DAYS,
      ApprovalPolicyConditionType.PRICE_DEVIATION_PCT,
    ]);
    const numericOperators = new Set(['>', '>=', '<', '<=', '=']);

    if (isRequired) {
      // An unconditional approval step has no predicate. Clearing these fields is important
      // when an existing conditional rule is changed to "always required".
      operator = null;
      threshold = null;
      matchValue = null;
    } else if (numericConditions.has(conditionType)) {
      if (!operator || (!numericOperators.has(operator) && !(conditionType === ApprovalPolicyConditionType.PRICE_DEVIATION_PCT && operator === ApprovalPolicyOperator.BETWEEN))) {
        throw new BadRequestException('Numeric conditions require a supported comparison operator');
      }
      if (threshold === null || !Number.isFinite(threshold)) {
        throw new BadRequestException('Numeric conditions require a finite threshold');
      }
      if (operator === ApprovalPolicyOperator.BETWEEN) {
        const maximum = Number(matchValue);
        if (matchValue === null || !Number.isFinite(maximum) || maximum <= threshold) {
          throw new BadRequestException('BETWEEN requires matchValue to be a number greater than threshold');
        }
      } else if (matchValue !== null) {
        throw new BadRequestException('matchValue is only allowed for BETWEEN numeric conditions');
      }
    } else if (conditionType === ApprovalPolicyConditionType.INDUSTRY_TAG) {
      if (!matchValue) throw new BadRequestException('INDUSTRY_TAG requires matchValue');
      if (operator || threshold !== null) throw new BadRequestException('INDUSTRY_TAG does not accept operator or threshold');
    } else if ([ApprovalPolicyConditionType.HAS_AR_DEBT, ApprovalPolicyConditionType.PRICE_BELOW_MIN].includes(conditionType)) {
      if (operator || threshold !== null || matchValue !== null) {
        throw new BadRequestException(`${conditionType} does not accept operator, threshold or matchValue`);
      }
    } else {
      throw new BadRequestException('Unsupported approval policy condition type');
    }

    return {
      code, name, stepName, stepOrder: rule.stepOrder, approverRole: rule.approverRole,
      conditionType, operator, threshold, matchValue,
      isRequired, isActive: rule.isActive ?? true,
    };
  }

  private async assertPolicyRuleUnique(rule: any, excludeId?: string) {
    const rules = await this.prisma.approvalPolicyRule.findMany({
      where: excludeId ? { id: { not: excludeId } } : undefined,
    });
    if (rules.some((item: any) => item.code.toLowerCase() === rule.code.toLowerCase())) {
      throw new BadRequestException(`Approval policy code ${rule.code} already exists`);
    }
    if (!rule.isActive) return;
    const activeRules = rules.filter((item: any) => item.isActive);
    const sameTarget = (item: any) => item.conditionType === rule.conditionType
      && item.stepOrder === rule.stepOrder && item.approverRole === rule.approverRole
      && item.stepName.trim().toLowerCase() === rule.stepName.toLowerCase();
    const exact = activeRules.find((item: any) => sameTarget(item) && (item.operator ?? null) === rule.operator
      && (item.threshold ?? null) === rule.threshold
      && (item.matchValue?.trim().toLowerCase() ?? null) === (rule.matchValue?.toLowerCase() ?? null));
    if (exact) throw new BadRequestException(`Approval policy duplicates active rule ${exact.code}`);

    if (rule.operator === ApprovalPolicyOperator.BETWEEN) {
      const min = rule.threshold;
      const max = Number(rule.matchValue);
      const overlap = activeRules.find((item: any) => sameTarget(item) && item.operator === ApprovalPolicyOperator.BETWEEN
        && Math.max(min, item.threshold) <= Math.min(max, Number(item.matchValue)));
      if (overlap) throw new BadRequestException(`Approval policy range overlaps active rule ${overlap.code}`);
    }
  }
}
