import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StepStatus, WorkflowStatus, ProposalStatus } from '@prisma/client';
import { CreateApprovalPolicyRuleDto } from './dto/create-approval-policy-rule.dto';
import { UpdateApprovalPolicyRuleDto } from './dto/update-approval-policy-rule.dto';
import { ProposalsService } from '../proposals/proposals.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ApprovalsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => ProposalsService))
    private proposalsService: ProposalsService,
    private notifications: NotificationsService,
  ) {}

  async getPending(userId: string, userRole: string) {
    const steps = await this.prisma.approvalStep.findMany({
      where: {
        status: StepStatus.PENDING,
        approverRole: userRole as any,
        workflow: { status: WorkflowStatus.IN_PROGRESS },
      },
      include: {
        workflow: {
          include: {
            proposal: {
              include: {
                unit: { select: { id: true, code: true, name: true } },
                tenant: { select: { id: true, brandName: true } },
              },
            },
            steps: { orderBy: { stepOrder: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return steps;
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

  async approve(stepId: string, userId: string, userRole: string, comment?: string) {
    const step = await this.prisma.approvalStep.findUnique({
      where: { id: stepId },
      include: {
        workflow: {
          include: {
            steps: { orderBy: { stepOrder: 'asc' } },
            proposal: { select: { id: true, proposalNumber: true, createdById: true } },
          },
        },
      },
    });

    if (!step) throw new NotFoundException('Approval step not found');
    if (step.status !== StepStatus.PENDING) throw new BadRequestException('Step is not pending');
    if (step.approverRole !== (userRole as any)) throw new ForbiddenException('Not authorized for this step');

    await this.prisma.approvalStep.update({
      where: { id: stepId },
      data: { status: StepStatus.APPROVED, approverId: userId, comment, decidedAt: new Date() },
    });

    const allSteps = step.workflow.steps;
    const nextStep = allSteps.find((s) => s.stepOrder === step.stepOrder + 1 && s.status === StepStatus.PENDING);

    if (!nextStep) {
      await this.prisma.approvalWorkflow.update({
        where: { id: step.workflowId },
        data: { status: WorkflowStatus.APPROVED },
      });

      if (step.workflow.proposalId) {
        await this.prisma.proposal.update({
          where: { id: step.workflow.proposalId },
          data: { status: ProposalStatus.APPROVED },
        });

        await this.proposalsService.handleProposalFullyApproved(
          step.workflow.proposalId,
          userId,
        );

        const proposal = step.workflow.proposal;
        if (proposal?.createdById) {
          await this.notifications.create({
            userId: proposal.createdById,
            title: `Proposal ${proposal.proposalNumber} đã được phê duyệt`,
            body: 'Deal đã hoàn tất quy trình phê duyệt.',
            type: 'PROPOSAL_APPROVED',
            entityType: 'PROPOSAL',
            entityId: step.workflow.proposalId,
          });
        }
      }
    } else {
      await this.proposalsService.notifyPendingApprovers(step.workflowId, nextStep.stepOrder);
    }

    return { message: 'Step approved successfully' };
  }

  async reject(stepId: string, userId: string, userRole: string, comment?: string) {
    const step = await this.prisma.approvalStep.findUnique({
      where: { id: stepId },
      include: { workflow: true },
    });

    if (!step) throw new NotFoundException('Approval step not found');
    if (step.status !== StepStatus.PENDING) throw new BadRequestException('Step is not pending');
    if (step.approverRole !== (userRole as any)) throw new ForbiddenException('Not authorized for this step');

    await this.prisma.approvalStep.update({
      where: { id: stepId },
      data: { status: StepStatus.REJECTED, approverId: userId, comment, decidedAt: new Date() },
    });

    await this.prisma.approvalWorkflow.update({
      where: { id: step.workflowId },
      data: { status: WorkflowStatus.REJECTED },
    });

    if (step.workflow.proposalId) {
      await this.prisma.proposal.update({
        where: { id: step.workflow.proposalId },
        data: { status: ProposalStatus.REJECTED },
      });
    }

    return { message: 'Step rejected' };
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
