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

const APPROVAL_ENTITY_TYPES = ['PROPOSAL', 'FITOUT_SUBMITTAL'] as const;
type ApprovalEntityType = (typeof APPROVAL_ENTITY_TYPES)[number];

interface ApprovalListQuery {
  page?: number;
  limit?: number;
  floorId?: string;
  unitId?: string;
  search?: string;
  leaseTermType?: string;
  entityType?: string;
}

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

  private parseEntityType(entityType?: string): ApprovalEntityType | undefined {
    if (entityType === undefined) return undefined;
    if (!APPROVAL_ENTITY_TYPES.includes(entityType as ApprovalEntityType)) {
      throw new BadRequestException('entityType must be PROPOSAL or FITOUT_SUBMITTAL');
    }
    return entityType as ApprovalEntityType;
  }

  private proposalMallBranch(mallIds?: string[]) {
    return {
      entityType: 'PROPOSAL',
      ...(mallIds ? { proposal: { unit: { mallId: { in: mallIds } } } } : {}),
    };
  }

  private fitoutMallBranch(mallIds?: string[]) {
    return {
      entityType: 'FITOUT_SUBMITTAL',
      fitoutSubmittal: {
        ...(mallIds ? {
          project: {
            unit: {
              OR: [
                { mallId: { in: mallIds } },
                { floor: { mallId: { in: mallIds } } },
              ],
            },
          },
        } : {}),
      },
    };
  }

  private workflowMallScope(entityType: ApprovalEntityType | undefined, proposalMallIds?: string[], fitoutMallIds?: string[]) {
    if (entityType === 'PROPOSAL') return this.proposalMallBranch(proposalMallIds);
    if (entityType === 'FITOUT_SUBMITTAL') return this.fitoutMallBranch(fitoutMallIds);
    if (!proposalMallIds && !fitoutMallIds) return {};
    return { OR: [this.proposalMallBranch(proposalMallIds), this.fitoutMallBranch(fitoutMallIds)] };
  }

  private workflowListScope(query: ApprovalListQuery, entityType?: ApprovalEntityType) {
    const AND: any[] = [];
    if (entityType === 'FITOUT_SUBMITTAL') {
      if (query.floorId) AND.push({ fitoutSubmittal: { project: { unit: { floorId: query.floorId } } } });
      if (query.unitId) AND.push({ fitoutSubmittal: { project: { unitId: query.unitId } } });
      if (query.search?.trim()) {
        const search = query.search.trim();
        AND.push({ OR: [
          { fitoutSubmittal: { title: { contains: search, mode: 'insensitive' } } },
          { fitoutSubmittal: { formType: { name: { contains: search, mode: 'insensitive' } } } },
          { fitoutSubmittal: { formType: { code: { contains: search, mode: 'insensitive' } } } },
          { fitoutSubmittal: { project: { tenant: { brandName: { contains: search, mode: 'insensitive' } } } } },
          { fitoutSubmittal: { project: { tenant: { companyName: { contains: search, mode: 'insensitive' } } } } },
          { fitoutSubmittal: { project: { unit: { code: { contains: search, mode: 'insensitive' } } } } },
          { fitoutSubmittal: { project: { unit: { name: { contains: search, mode: 'insensitive' } } } } },
        ] });
      }
      return AND.length ? { AND } : {};
    }
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

  async getPending(
    userId: string,
    userRole: string,
    query: ApprovalListQuery = {},
    proposalMallIds?: string[],
    fitoutMallIds: string[] | undefined = proposalMallIds,
  ) {
    const { page = 1, limit = 15 } = query;
    const entityType = this.parseEntityType(query.entityType);

    const where: any = {
      status: StepStatus.PENDING,
      workflow: {
        status: WorkflowStatus.IN_PROGRESS,
        ...this.workflowMallScope(entityType, proposalMallIds, fitoutMallIds),
        ...this.workflowListScope(query, entityType),
      },
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
            fitoutSubmittal: {
              select: {
                id: true, title: true, revisionNo: true, status: true, stageCode: true,
                submittedAt: true, dueDate: true, workflowId: true,
                formType: { select: { id: true, code: true, name: true } },
                submittedBy: { select: { id: true, fullName: true } },
                project: {
                  select: {
                    id: true, status: true,
                    tenant: { select: { id: true, brandName: true, companyName: true } },
                    unit: {
                      select: {
                        id: true, code: true, name: true, mallId: true,
                        floor: { select: { id: true, name: true, mallId: true } },
                      },
                    },
                  },
                },
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
      if (!earlierSteps.every((s) => s.status === StepStatus.APPROVED)) return false;
      if (step.workflow.entityType === 'FITOUT_SUBMITTAL') {
        return step.workflow.fitoutSubmittal?.id === step.workflow.entityId
          && step.workflow.fitoutSubmittal.workflowId === step.workflow.id;
      }
      return true;
    });

    const total = filtered.length;
    const skip = (Number(page) - 1) * Number(limit);
    const pageSteps = filtered.slice(skip, skip + Number(limit));
    const withAttachments = await this.attachFitoutAttachments(pageSteps);
    const withStageContext = await this.attachFitoutStageContext(withAttachments);
    const data = await this.attachPolicyReason(withStageContext);

    return { data, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }

  /**
   * FR-04 (docs/audit/04-UX-FRICTION-REPORT.md): the approvals queue only showed
   * step/status, forcing the approver to open the Proposal separately to see *why*
   * this step exists. `ApprovalStep` doesn't store which `ApprovalPolicyRule`
   * produced it (steps are renumbered per-proposal in buildApprovalStepsFromRules,
   * so `stepOrder` can't be mapped back to the rule table's own `stepOrder`) — the
   * best available correlation without a schema change is `stepName` + `approverRole`,
   * which is copied verbatim from the matching rule when the step is created. This
   * surfaces the rule's own human-authored `name` as the "why" explanation.
   */
  private async attachPolicyReason<T extends { stepName: string; approverRole: string }>(steps: T[]) {
    if (!steps.length) return steps;
    const proposalSteps = steps.filter((step: any) => step.workflow?.entityType === 'PROPOSAL');
    if (!proposalSteps.length) return steps.map((step) => ({ ...step, policyReason: null }));
    const rules = await this.prisma.approvalPolicyRule.findMany({ where: { isActive: true } });
    const byKey = new Map(rules.map((r) => [`${r.stepName}::${r.approverRole}`, r]));
    return steps.map((step) => ({
      ...step,
      policyReason: (step as any).workflow?.entityType === 'PROPOSAL'
        ? byKey.get(`${step.stepName}::${step.approverRole}`)?.name ?? null
        : null,
    }));
  }

  private async attachFitoutAttachments<T extends { workflow: any }>(steps: T[]): Promise<T[]> {
    const entityIds = steps
      .filter((step) => step.workflow.entityType === 'FITOUT_SUBMITTAL')
      .map((step) => step.workflow.entityId);
    if (!entityIds.length) return steps;
    const attachments = await this.prisma.unifiedDocument.findMany({
      where: { entityType: 'FITOUT_SUBMITTAL', entityId: { in: entityIds }, isActive: true },
      select: {
        id: true, entityId: true, fileName: true, mimeType: true, fileSize: true,
        version: true, isLatest: true, uploadedAt: true,
      },
      orderBy: [{ entityId: 'asc' }, { version: 'desc' }],
    });
    const byEntity = new Map<string, any[]>();
    for (const attachment of attachments as any[]) {
      const { entityId, ...safeAttachment } = attachment;
      if (!entityIds.includes(entityId)) continue;
      const current = byEntity.get(entityId) ?? [];
      current.push(safeAttachment);
      byEntity.set(entityId, current);
    }
    return steps.map((step) => step.workflow.entityType === 'FITOUT_SUBMITTAL'
      ? {
          ...step,
          workflow: {
            ...step.workflow,
            fitoutSubmittal: {
              ...step.workflow.fitoutSubmittal,
              attachments: byEntity.get(step.workflow.entityId) ?? [],
            },
          },
        }
      : step);
  }

  private async attachFitoutStageContext<T extends { workflow: any }>(steps: T[]): Promise<T[]> {
    const stageCodes = [...new Set(steps
      .filter((step) => step.workflow.entityType === 'FITOUT_SUBMITTAL')
      .map((step) => step.workflow.fitoutSubmittal?.stageCode)
      .filter((code): code is string => !!code))];
    if (!stageCodes.length) return steps;
    const stages = await this.prisma.fitoutStageConfig.findMany({
      where: { code: { in: stageCodes } },
      select: { code: true, name: true },
    });
    const byCode = new Map(stages.map((stage) => [stage.code, stage]));
    return steps.map((step) => step.workflow.entityType === 'FITOUT_SUBMITTAL'
      ? {
          ...step,
          workflow: {
            ...step.workflow,
            fitoutSubmittal: {
              ...step.workflow.fitoutSubmittal,
              stage: byCode.get(step.workflow.fitoutSubmittal.stageCode) ?? null,
            },
          },
        }
      : step);
  }

  private getCurrentActionableStep(steps: Array<{
    stepOrder: number;
    status: StepStatus;
    approverRole: unknown;
    approverId: string | null;
  }>) {
    return [...steps]
      .sort((left, right) => left.stepOrder - right.stepOrder)
      .find((step, index, ordered) => step.status === StepStatus.PENDING
        && ordered.slice(0, index).every((earlier) => earlier.status === StepStatus.APPROVED));
  }

  async getWorkflow(workflowId: string, user?: { id: string; role: string }, fitoutMallIds?: string[]) {
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
        fitoutSubmittal: {
          select: {
            id: true, title: true, revisionNo: true, status: true, stageCode: true,
            submittedAt: true, dueDate: true, workflowId: true,
            formType: { select: { id: true, code: true, name: true } },
            submittedBy: { select: { id: true, fullName: true } },
            project: {
              select: {
                id: true, status: true,
                tenant: { select: { id: true, brandName: true, companyName: true } },
                unit: {
                  select: {
                    id: true, code: true, name: true, mallId: true,
                    floor: { select: { id: true, name: true, mallId: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!workflow) throw new NotFoundException('Workflow not found');
    const workflowWithDepartments = await this.attachApproverDepartments(workflow);
    if (workflow.entityType !== 'FITOUT_SUBMITTAL') return workflowWithDepartments;

    const submittal = workflow.fitoutSubmittal;
    if (!submittal || submittal.id !== workflow.entityId || submittal.workflowId !== workflow.id) {
      throw new ForbiddenException('Fitout approval context is unresolved or mismatched');
    }
    if (!user) throw new ForbiddenException('Fitout dossier access requires an authenticated approver');
    const mallId = submittal.project.unit.mallId ?? submittal.project.unit.floor?.mallId;
    if (!mallId) throw new ForbiddenException('Fitout approval Mall is unresolved');
    if (user.role !== 'ADMIN' && (!fitoutMallIds || !fitoutMallIds.includes(mallId))) {
      throw new ForbiddenException('You do not have access to this Fitout project Mall');
    }
    if (user.role !== 'ADMIN') {
      if (workflow.status !== WorkflowStatus.IN_PROGRESS) {
        throw new ForbiddenException('Fitout dossier is not currently actionable');
      }
      const currentStep = this.getCurrentActionableStep(workflow.steps);
      if (!currentStep
        || currentStep.approverRole !== (user.role as any)
        || (currentStep.approverId && currentStep.approverId !== user.id)) {
        throw new ForbiddenException('You are not the current actionable Fitout approver');
      }
    }

    const attachments = await this.prisma.unifiedDocument.findMany({
      where: { entityType: 'FITOUT_SUBMITTAL', entityId: submittal.id, isActive: true },
      select: {
        id: true, fileName: true, mimeType: true, fileSize: true,
        version: true, isLatest: true, uploadedAt: true,
      },
      orderBy: { version: 'desc' },
    });
    const stage = await this.prisma.fitoutStageConfig.findUnique({
      where: { code: submittal.stageCode },
      select: { code: true, name: true },
    });
    return { ...workflowWithDepartments, fitoutSubmittal: { ...submittal, stage, attachments } };
  }

  private async attachApproverDepartments<T extends { steps: any[] }>(workflow: T) {
    const ids = [...new Set(
      workflow.steps
        .map((step) => step.approver?.department)
        .filter(Boolean),
    )] as string[];
    if (ids.length === 0) return workflow;
    const departments = ids.length
      ? await this.prisma.department.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, mallId: true },
        })
      : [];
    const byId = new Map(departments.map((department) => [department.id, department]));
    return {
      ...workflow,
      steps: workflow.steps.map((step) => ({
        ...step,
        approver: step.approver
          ? {
              ...step.approver,
              departmentInfo: step.approver.department
                ? byId.get(step.approver.department) ?? null
                : null,
            }
          : null,
      })),
    };
  }

  async getAllWorkflows(query: { status?: WorkflowStatus; page?: number; limit?: number }, mallIds?: string[]) {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * +limit;

    const where: any = { ...this.workflowMallScope(undefined, mallIds, mallIds) };
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

  private async assertFitoutDecisionMallAccess(
    tx: Prisma.TransactionClient,
    workflow: any,
    userId: string,
    userRole: string,
  ) {
    if (workflow.entityType !== 'FITOUT_SUBMITTAL') return;
    const submittal = workflow.fitoutSubmittal;
    if (!submittal || submittal.id !== workflow.entityId || submittal.workflowId !== workflow.id) {
      throw new ForbiddenException('Fitout approval context is unresolved or mismatched');
    }
    const mallId = submittal.project.unit.mallId ?? submittal.project.unit.floor?.mallId;
    if (!mallId) throw new ForbiddenException('Fitout approval Mall is unresolved');
    if (userRole === 'ADMIN') return;
    const access = await tx.userMallAccess.findFirst({ where: { userId, mallId, isActive: true }, select: { id: true } });
    if (!access) throw new ForbiddenException('You do not have access to this Fitout project Mall');
  }

  async approve(stepId: string, userId: string, userRole: string, comment?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const step = await tx.approvalStep.findUnique({
        where: { id: stepId },
        include: {
          workflow: {
            include: {
              steps: { orderBy: { stepOrder: 'asc' } },
              fitoutSubmittal: {
                select: {
                  id: true, workflowId: true,
                  project: {
                    select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
                  },
                },
              },
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
      await this.assertFitoutDecisionMallAccess(tx, step.workflow, userId, userRole);

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
        include: {
          workflow: {
            include: {
              steps: { orderBy: { stepOrder: 'asc' } },
              fitoutSubmittal: {
                select: {
                  id: true, workflowId: true,
                  project: {
                    select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
                  },
                },
              },
            },
          },
        },
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
      await this.assertFitoutDecisionMallAccess(tx, current.workflow, userId, userRole);
      const unapprovedEarlierStep = (current.workflow.steps ?? []).find(
        (step) => step.stepOrder < current.stepOrder && step.status !== StepStatus.APPROVED,
      );
      if (unapprovedEarlierStep) {
        throw new BadRequestException(`Step ${unapprovedEarlierStep.stepOrder} (${unapprovedEarlierStep.stepName}) must be approved first`);
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
      workflow: { entityType: 'PROPOSAL', ...this.workflowMallScope('PROPOSAL', mallIds, mallIds), ...this.workflowListScope(query, 'PROPOSAL') },
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
