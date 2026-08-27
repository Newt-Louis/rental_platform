import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import type { ApprovalWorkflowCompletedEvent, ApprovalWorkflowRejectedEvent, ApprovalWorkflowStepAdvancedEvent } from '../approvals/approvals.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailDeliveryService } from '../notifications/email-delivery.service';
import { FitoutAccessPolicyService } from './fitout-access-policy.service';
import { Prisma, Role } from '@prisma/client';

const ENTITY_TYPE = 'FITOUT_SUBMITTAL';
const DEFAULT_APPROVER_ROLE = 'OPERATION';

@Injectable()
export class FitoutSubmittalService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private notifications: NotificationsService,
    private emailDelivery: EmailDeliveryService,
    private accessPolicy: FitoutAccessPolicyService,
  ) {}

  async list(projectId: string, query: { formTypeId?: string; status?: string } = {}) {
    const submittals = await this.prisma.fitoutSubmittal.findMany({
      where: { projectId, formTypeId: query.formTypeId, status: query.status },
      include: {
        formType: true,
        submittedBy: { select: { id: true, fullName: true } },
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' }, include: { approver: { select: { id: true, fullName: true } } } } } },
        parent: { select: { id: true, revisionNo: true } },
      },
      orderBy: [{ formTypeId: 'asc' }, { revisionNo: 'desc' }],
    });
    // FitoutSubmittal <-> UnifiedDocument has no FK/relation (polymorphic entityType/entityId,
    // same as approvals.service.ts's attachFitoutAttachments) — batch-fetch and merge manually
    // so the workspace can show/download attachments and gate "Gửi duyệt" without an N+1 query
    // per submittal card.
    const attachments = submittals.length
      ? await this.prisma.unifiedDocument.findMany({
          where: { entityType: ENTITY_TYPE, entityId: { in: submittals.map((s) => s.id) }, isActive: true },
          select: { id: true, entityId: true, fileName: true, mimeType: true, fileSize: true, version: true, isLatest: true, uploadedAt: true },
          orderBy: [{ entityId: 'asc' }, { version: 'desc' }],
        })
      : [];
    const byEntity = new Map<string, typeof attachments>();
    for (const attachment of attachments) {
      const list = byEntity.get(attachment.entityId) ?? [];
      list.push(attachment);
      byEntity.set(attachment.entityId, list);
    }
    return submittals.map((s) => ({ ...s, attachments: byEntity.get(s.id) ?? [] }));
  }

  /**
   * Phase 5 (docs/program/RELIABILITY_BACKLOG.md): resolves a submittal id to its owning
   * project id so the controller can run the same mall-access check every other
   * project-scoped fitout route already runs — this controller previously had no
   * mall-access enforcement at all, unlike FitoutController.
   */
  async getProjectId(submittalId: string): Promise<string> {
    const submittal = await this.prisma.fitoutSubmittal.findUnique({
      where: { id: submittalId },
      select: { projectId: true },
    });
    if (!submittal) throw new NotFoundException('Submittal not found');
    return submittal.projectId;
  }

  async getOne(id: string) {
    const submittal = await this.prisma.fitoutSubmittal.findUnique({
      where: { id },
      include: {
        formType: true,
        project: { select: { id: true, tenantId: true, unitId: true } },
        submittedBy: { select: { id: true, fullName: true } },
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' }, include: { approver: { select: { id: true, fullName: true } } } } } },
        parent: true,
        children: true,
      },
    });
    if (!submittal) throw new NotFoundException('Submittal not found');
    return submittal;
  }

  private buildApprovalSteps(formType: { approvalLevels: number; approverRoles: any; name: string }) {
    const roles: string[] = Array.isArray(formType.approverRoles) && formType.approverRoles.length > 0
      ? formType.approverRoles
      : Array.from({ length: formType.approvalLevels || 1 }, () => DEFAULT_APPROVER_ROLE);

    return roles.map((role, idx) => ({
      stepName: `${formType.name} — Cấp ${idx + 1}`,
      stepOrder: idx + 1,
      approverRole: role,
    }));
  }

  /**
   * Tạo submittal ở trạng thái nháp (SUBMITTED, chưa có ApprovalWorkflow) — người phụ trách
   * còn phải đính kèm ít nhất 1 tệp rồi gọi submitForReview() thì hồ sơ mới thực sự vào hàng
   * chờ duyệt và người duyệt mới được thông báo. Tách 2 bước này để không thể "gửi duyệt" một
   * hồ sơ không có tệp đính kèm — trước đây workflow được tạo + duyệt viên được thông báo ngay
   * trong create(), nên người duyệt có thể nhận việc cần xem xét một hồ sơ trống tệp.
   */
  async create(projectId: string, dto: { formTypeId: string; title: string; dueDate?: string }, submittedById: string) {
    const project = await this.prisma.fitoutProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Fitout project not found');

    const formType = await this.prisma.fitoutFormType.findUnique({ where: { id: dto.formTypeId } });
    if (!formType || !formType.isActive) throw new BadRequestException('Invalid or inactive form type');

    return this.prisma.fitoutSubmittal.create({
      data: {
        projectId,
        formTypeId: dto.formTypeId,
        stageCode: project.status,
        title: dto.title,
        submittedById,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: 'SUBMITTED',
      },
    });
  }

  /** Chuyển 1 submittal nháp (SUBMITTED, chưa có workflow) sang hàng chờ duyệt — bắt buộc đã có ít nhất 1 tệp đính kèm. */
  async submitForReview(id: string) {
    const submittal = await this.getOne(id);
    if (submittal.workflowId) {
      throw new BadRequestException('Hồ sơ này đã được gửi duyệt trước đó');
    }
    if (submittal.status !== 'SUBMITTED') {
      throw new BadRequestException(`Không thể gửi duyệt hồ sơ đang ở trạng thái ${submittal.status}`);
    }
    const attachmentCount = await this.prisma.unifiedDocument.count({
      where: { entityType: ENTITY_TYPE, entityId: id, isActive: true },
    });
    if (attachmentCount === 0) {
      throw new BadRequestException('Cần đính kèm ít nhất 1 tệp trước khi gửi duyệt để người duyệt có thể xem hồ sơ');
    }

    const formType = await this.prisma.fitoutFormType.findUnique({ where: { id: submittal.formTypeId } });
    if (!formType) throw new NotFoundException('Form type not found');
    const steps = this.buildApprovalSteps(formType);

    const updated = await this.prisma.$transaction(async (tx) => {
      const workflow = await tx.approvalWorkflow.create({
        data: {
          entityType: ENTITY_TYPE,
          entityId: id,
          status: 'IN_PROGRESS',
          steps: { create: steps as any },
        },
      });
      return tx.fitoutSubmittal.update({
        where: { id },
        data: { workflowId: workflow.id, status: 'IN_PROGRESS' },
      });
    });

    await this.notifyPendingApprovers(updated.workflowId!, 1);
    return updated;
  }

  /** Tạo revision mới (nháp, chưa có workflow) từ 1 submittal bị từ chối — cũng phải qua submitForReview() với tệp đính kèm mới trước khi vào hàng chờ duyệt (tệp của revision cũ không tự động mang sang). */
  async resubmit(id: string, dto: { title?: string; dueDate?: string }, submittedById: string) {
    const parent = await this.getOne(id);
    if (parent.status !== 'REJECTED') {
      throw new BadRequestException('Only a rejected submittal can be resubmitted');
    }

    const project = await this.prisma.fitoutProject.findUnique({ where: { id: parent.projectId } });

    return this.prisma.$transaction(async (tx) => {
      await tx.fitoutSubmittal.update({ where: { id }, data: { status: 'OBSOLETED' } });

      return tx.fitoutSubmittal.create({
        data: {
          projectId: parent.projectId,
          formTypeId: parent.formTypeId,
          stageCode: project?.status ?? parent.stageCode,
          title: dto.title ?? parent.title,
          revisionNo: parent.revisionNo + 1,
          parentSubmittalId: id,
          submittedById,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : parent.dueDate,
          status: 'SUBMITTED',
        },
      });
    });
  }

  async publish(id: string) {
    const submittal = await this.getOne(id);
    if (submittal.status !== 'APPROVED') {
      throw new BadRequestException('Only an approved submittal can be published');
    }
    return this.prisma.fitoutSubmittal.update({ where: { id }, data: { status: 'PUBLISHED' } });
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  async listComments(id: string) {
    return this.prisma.entityComment.findMany({
      where: { entityType: ENTITY_TYPE, entityId: id },
      include: { author: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addComment(id: string, authorId: string, body: string) {
    await this.getOne(id);
    return this.prisma.entityComment.create({
      data: { entityType: ENTITY_TYPE, entityId: id, authorId, body },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  // ── Distribution ─────────────────────────────────────────────────────────
  async listDistribution(id: string) {
    return this.prisma.entityDistribution.findMany({
      where: { entityType: ENTITY_TYPE, entityId: id },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async addDistribution(id: string, userId: string) {
    const submittal = await this.getOne(id);
    await this.accessPolicy.assertActiveProjectMallUser(submittal.projectId, userId);
    return this.prisma.entityDistribution.upsert({
      where: { entityType_entityId_userId: { entityType: ENTITY_TYPE, entityId: id, userId } },
      create: { entityType: ENTITY_TYPE, entityId: id, userId, notifiedAt: new Date() },
      update: { notifiedAt: new Date() },
    });
  }

  // ── Attachments (UnifiedDocument) ───────────────────────────────────────
  async listAttachments(id: string) {
    return this.prisma.unifiedDocument.findMany({
      where: { entityType: ENTITY_TYPE, entityId: id, isActive: true },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async uploadAttachment(id: string, file: Express.Multer.File, uploadedById: string) {
    const submittal = await this.getOne(id);
    const mutableStatuses = ['SUBMITTED', 'IN_PROGRESS'];
    if (!mutableStatuses.includes(submittal.status)) {
      throw new BadRequestException(
        submittal.status === 'REJECTED'
          ? 'Rejected submittals must be resubmitted before attachments can be uploaded'
          : `Attachments cannot be uploaded to a ${submittal.status} submittal revision`,
      );
    }
    // Trạng thái SUBMITTED giờ có 2 pha: nháp chưa gửi duyệt (workflowId null — vẫn cho phép
    // đính kèm, đây chính là bước bắt buộc trước submitForReview()) và trường hợp cũ IN_PROGRESS
    // (đã vào hàng chờ, chỉ cho đính kèm thêm khi workflow còn IN_PROGRESS).
    if (submittal.workflowId && submittal.workflow?.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Attachments can only be uploaded while the approval workflow is in progress');
    }
    const saved = await this.storageService.saveFile(file, `fitout-submittal/${id}`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Fitout's operational database is PostgreSQL. Lock the revision and its
        // workflow in one statement so a concurrent terminal approval/rejection
        // either completes before this recheck or waits until this upload commits.
        const locked = await tx.$queryRaw<Array<{
          id: string;
          status: string;
          workflowId: string | null;
          workflowStatus: string | null;
        }>>(Prisma.sql`
          SELECT s.id, s.status, s."workflowId", w.status::text AS "workflowStatus"
          FROM "FitoutSubmittal" s
          LEFT JOIN "ApprovalWorkflow" w ON w.id = s."workflowId"
          WHERE s.id = ${id}
          FOR UPDATE OF s
        `);
        const current = locked[0];
        if (!current) throw new NotFoundException('Submittal not found');
        // workflowId null (nháp, chưa gửi duyệt) is mutable; once a workflow exists it must
        // still be IN_PROGRESS (mirrors the pre-transaction check above, revalidated under lock).
        if (!mutableStatuses.includes(current.status) || (current.workflowId && current.workflowStatus !== 'IN_PROGRESS')) {
          throw new BadRequestException(
            'Submittal revision is no longer mutable; refresh and resubmit if it was rejected',
          );
        }

        const latestVersion = await tx.unifiedDocument.findFirst({
          where: { entityType: ENTITY_TYPE, entityId: id },
          orderBy: { version: 'desc' },
        });

        if (latestVersion) {
          await tx.unifiedDocument.update({ where: { id: latestVersion.id }, data: { isLatest: false } });
        }

        return tx.unifiedDocument.create({
          data: {
            entityType: ENTITY_TYPE,
            entityId: id,
            category: 'ORIGINAL',
            documentType: submittal.formType.code,
            fileName: saved.fileName,
            filePath: saved.filePath,
            fileSize: file.size,
            mimeType: file.mimetype,
            version: (latestVersion?.version ?? 0) + 1,
            uploadedById,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      await this.storageService.deleteFile(saved.filePath);
      throw error;
    }
  }

  // ── Approval workflow event handlers ────────────────────────────────────

  @OnEvent('approval.workflow.completed')
  async onWorkflowCompleted(payload: ApprovalWorkflowCompletedEvent) {
    if (payload.entityType !== ENTITY_TYPE) return;
    await this.prisma.fitoutSubmittal.update({
      where: { id: payload.entityId },
      data: { status: 'APPROVED' },
    });

    const submittal = await this.prisma.fitoutSubmittal.findUnique({
      where: { id: payload.entityId },
      include: { project: true, formType: true, submittedBy: true },
    });
    if (submittal?.submittedById) {
      await this.notifications.create({
        userId: submittal.submittedById,
        title: `Submittal đã được duyệt — ${submittal.formType.name}`,
        body: `"${submittal.title}" đã hoàn tất phê duyệt.`,
        type: 'FITOUT_SUBMITTAL_APPROVED',
        entityType: ENTITY_TYPE,
        entityId: submittal.id,
      });
    }
  }

  @OnEvent('approval.workflow.step-advanced')
  async onWorkflowStepAdvanced(payload: ApprovalWorkflowStepAdvancedEvent) {
    if (payload.entityType !== ENTITY_TYPE) return;
    await this.prisma.fitoutSubmittal.updateMany({
      where: { id: payload.entityId, status: 'SUBMITTED' },
      data: { status: 'IN_PROGRESS' },
    });
    await this.notifyPendingApprovers(payload.workflowId, payload.nextStepOrder);
  }

  @OnEvent('approval.workflow.rejected')
  async onWorkflowRejected(payload: ApprovalWorkflowRejectedEvent) {
    if (payload.entityType !== ENTITY_TYPE) return;
    await this.prisma.fitoutSubmittal.update({
      where: { id: payload.entityId },
      data: { status: 'REJECTED' },
    });

    const submittal = await this.prisma.fitoutSubmittal.findUnique({
      where: { id: payload.entityId },
      include: { formType: true },
    });
    if (submittal?.submittedById) {
      await this.notifications.create({
        userId: submittal.submittedById,
        title: `Submittal bị từ chối — ${submittal.formType.name}`,
        body: payload.comment ? `Lý do: ${payload.comment}` : `"${submittal.title}" cần nộp lại.`,
        type: 'FITOUT_SUBMITTAL_REJECTED',
        entityType: ENTITY_TYPE,
        entityId: submittal.id,
      });
    }
  }

  private async notifyPendingApprovers(workflowId: string, stepOrder: number) {
    const step = await this.prisma.approvalStep.findFirst({
      where: { workflowId, stepOrder, status: 'PENDING' },
    });
    if (!step) return;

    const submittal = await this.prisma.fitoutSubmittal.findUnique({
      where: { workflowId },
      include: { formType: true, project: { include: { tenant: true, unit: { select: { code: true } } } } },
    });
    if (!submittal) return;

    const approvers = await this.accessPolicy.findProjectMallRecipients(
      submittal.project.id,
      step.approverRole as Role,
    );

    for (const approver of approvers) {
      await this.notifications.create({
        userId: approver.id,
        title: `Submittal chờ duyệt — ${submittal.formType.name}`,
        body: `${submittal.project.tenant.brandName} (${submittal.project.unit.code}) — "${submittal.title}"`,
        type: 'FITOUT_SUBMITTAL_PENDING',
        entityType: ENTITY_TYPE,
        entityId: submittal.id,
      });
      if (approver.email) {
        // Phase 5 hardening (docs/program/RELIABILITY_BACKLOG.md item 9): used to call
        // emailService.sendMail() directly — a synchronous, non-retried send, unlike the
        // fitout-SLA/AR-dunning emails in adjacent modules, which correctly use this same
        // retryable queue. The eventKey is per-(submittal, step, approver), so re-running
        // notifyPendingApprovers for the same step (e.g. a retried event) re-enqueues
        // safely rather than sending a duplicate.
        await this.emailDelivery.enqueue(this.prisma, {
          eventKey: `fitout-submittal:${submittal.id}:step:${stepOrder}:approver:${approver.id}`,
          to: approver.email,
          subject: `[Fitout] Submittal chờ duyệt — ${submittal.formType.name}`,
          html: `<p>Kính gửi ${approver.fullName},</p><p>Submittal <strong>${submittal.title}</strong> của ${submittal.project.tenant.brandName} (${submittal.project.unit.code}) đang chờ bạn phê duyệt.</p>`,
        });
      }
    }
  }
}
