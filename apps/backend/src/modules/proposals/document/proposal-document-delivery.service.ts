import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { CurrencyCode, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MallAccessService } from '../../../common/services/mall-access.service';
import { PermissionsService } from '../../../common/services/permissions.service';
import { MODULE_ROLES } from '../../../common/constants/role-permissions';
import { EmailDeliveryService } from '../../notifications/email-delivery.service';
import { EmailService } from '../../notifications/email.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { emailSubject, toPlainText } from '../../notifications/email-design-system';
import {
  describeAttachment,
  EmailAttachment,
  EmailAttachmentRegistry,
} from '../../notifications/email-attachments';
import { ProposalPdfService } from '../proposal-pdf.service';
import { ProposalDocumentService } from './proposal-document.service';
import type { ProposalDocumentModel } from './proposal-document.types';

export const PROPOSAL_DOCUMENT_PDF_ATTACHMENT = 'PROPOSAL_DOCUMENT_VERSION_PDF';
export const PROPOSAL_SEND_EXTERNAL_PERMISSION = 'proposal-send-external';

type Audience = 'INTERNAL' | 'EXTERNAL';

export interface SendProposalDocumentInput {
  documentVersionId: string;
  to: string[];
  cc?: string[];
  subject?: string;
  message?: string;
}

/**
 * CR-PROPOSAL-DOCUMENT-FINALIZATION — everything that carries an official
 * Tờ trình out of the system: approver notifications and external sends.
 *
 * The PDF always comes from ProposalPdfService rendering a submitted version,
 * never from the live Proposal. It is rendered "as of" a recorded instant so the
 * email ledger can regenerate and verify identical bytes at send time.
 */
@Injectable()
export class ProposalDocumentDeliveryService implements OnModuleInit {
  private readonly logger = new Logger(ProposalDocumentDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: ProposalDocumentService,
    private readonly pdf: ProposalPdfService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    private readonly attachments: EmailAttachmentRegistry,
    private readonly permissions: PermissionsService,
    private readonly mallAccess: MallAccessService,
  ) {}

  protected now(): Date {
    return new Date();
  }

  onModuleInit() {
    this.attachments.register(PROPOSAL_DOCUMENT_PDF_ATTACHMENT, async (ref) => {
      const { attachment } = await this.renderVersionAttachment({
        proposalId: String(ref.proposalId),
        documentVersionId: String(ref.documentVersionId),
        asOf: new Date(String(ref.asOf)),
        audience: ref.audience === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL',
      });
      return attachment;
    });
  }

  /** Deterministic: the same Proposal and version always get the same name. */
  static attachmentFilename(proposalNumber: string, versionNumber: number) {
    return `to-trinh-${proposalNumber.replace(/[^A-Za-z0-9._-]/g, '-')}-v${versionNumber}.pdf`;
  }

  async renderVersionAttachment(input: {
    proposalId: string;
    documentVersionId: string;
    asOf: Date;
    audience: Audience;
  }): Promise<{ attachment: EmailAttachment; model: ProposalDocumentModel }> {
    const model = await this.documents.getVersionDocument(input.proposalId, input.documentVersionId, this.prisma, { asOf: input.asOf });
    const content = await this.pdf.render(model, { audience: input.audience });
    return {
      model,
      attachment: {
        filename: ProposalDocumentDeliveryService.attachmentFilename(model.proposalNumber, model.version!.versionNumber),
        content,
        contentType: 'application/pdf',
        source: {
          kind: PROPOSAL_DOCUMENT_PDF_ATTACHMENT,
          ref: {
            proposalId: input.proposalId,
            documentVersionId: input.documentVersionId,
            asOf: input.asOf.toISOString(),
            audience: input.audience,
          },
        },
      },
    };
  }

  // ── Approver notification ────────────────────────────────────────────────

  /**
   * Called from the durable `approval.workflow.step-advanced` outbox event.
   * Safe to replay: the in-app notification is looked up before it is created
   * and the email ledger row is keyed per step and approver.
   */
  async notifyApprovalStep(workflowId: string, stepOrder: number) {
    const step = await this.prisma.approvalStep.findFirst({
      where: { workflowId, stepOrder, status: 'PENDING' },
      include: {
        approver: { select: { id: true, email: true, fullName: true, isActive: true, deletedAt: true } },
        workflow: { select: { id: true, entityType: true, entityId: true, status: true, documentVersionId: true } },
      },
    });
    if (!step || step.workflow.entityType !== 'PROPOSAL' || step.workflow.status !== 'IN_PROGRESS') {
      return { notified: 0 };
    }

    const proposalId = step.workflow.entityId;
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { proposalNumber: true, unit: { select: { code: true, mallId: true } } },
    });
    if (!proposal) return { notified: 0 };

    // Assigned approver only. Legacy role-routed steps are limited to people who
    // can see this Mall, not every holder of the role platform-wide.
    const recipients = step.approverId
      ? (step.approver && step.approver.isActive && !step.approver.deletedAt ? [step.approver] : [])
      : await this.prisma.user.findMany({
          where: {
            role: step.approverRole,
            isActive: true,
            deletedAt: null,
            OR: [{ role: Role.ADMIN }, { mallAccess: { some: { mallId: proposal.unit.mallId, isActive: true } } }],
          },
          select: { id: true, email: true, fullName: true, isActive: true, deletedAt: true },
        });
    if (!recipients.length) return { notified: 0 };

    let model: ProposalDocumentModel;
    let attachment: EmailAttachment | null = null;
    if (step.workflow.documentVersionId) {
      const rendered = await this.renderVersionAttachment({
        proposalId,
        documentVersionId: step.workflow.documentVersionId,
        asOf: this.now(),
        audience: 'INTERNAL',
      });
      model = rendered.model;
      attachment = rendered.attachment;
    } else {
      // Submitted before versioning existed: no immutable document to attach.
      model = await this.documents.getLiveDocument(proposalId);
    }

    const facts = model.facts as ProposalDocumentModel['facts'] & {
      area?: number; termMonths?: number; rentPerSqm?: number;
    };
    const previousDecisions = model.approval.steps
      .filter((s) => s.presentation === 'APPROVED_BY' || s.presentation === 'REJECTED_BY')
      .map((s) => ({
        stepName: s.stepName,
        approverName: s.approverName,
        decision: s.status as 'APPROVED' | 'REJECTED',
        decidedAt: s.decidedAt,
        comment: s.comment,
      }));
    const versionLabel = model.version ? ` · phiên bản ${model.version.versionNumber}` : '';

    for (const recipient of recipients) {
      const body = `${step.stepName} — ${model.facts.party.brandName ?? 'Chưa có khách thuê'} / ${proposal.unit.code}${versionLabel}`;
      const existing = await this.prisma.notification.findFirst({
        where: { userId: recipient.id, type: 'APPROVAL_PENDING', entityType: 'PROPOSAL', entityId: proposalId, body },
        select: { id: true },
      });
      if (!existing) {
        await this.notifications.create({
          userId: recipient.id,
          title: `Phê duyệt: ${proposal.proposalNumber}`,
          body,
          type: 'APPROVAL_PENDING',
          entityType: 'PROPOSAL',
          entityId: proposalId,
        });
      }

      if (!recipient.email) continue;
      const html = this.email.proposalApprovalRequestHtml({
        approverName: recipient.fullName,
        stepName: step.stepName,
        proposalId,
        proposalNumber: proposal.proposalNumber,
        documentVersionNumber: model.version?.versionNumber ?? null,
        mallName: model.facts.mall.name,
        tenantName: model.facts.party.brandName,
        unitCode: proposal.unit.code,
        area: typeof facts.area === 'number' ? facts.area : null,
        termMonths: typeof facts.termMonths === 'number' ? facts.termMonths : null,
        rentPerSqm: typeof facts.rentPerSqm === 'number' ? facts.rentPerSqm : null,
        currencyCode: (model.facts.currency as CurrencyCode) ?? null,
        preparedBy: model.facts.preparedBy.fullName,
        submittedAt: model.version?.submittedAt ?? null,
        previousDecisions,
        attachmentFilename: attachment?.filename ?? null,
      });
      await this.emailDelivery.enqueue(this.prisma, {
        eventKey: `proposal-approval:${proposalId}:${step.id}:${recipient.id}`,
        eventType: 'PROPOSAL_APPROVAL',
        entityType: 'Proposal',
        entityId: proposalId,
        mallId: proposal.unit.mallId,
        to: recipient.email,
        subject: emailSubject(`Tờ trình ${proposal.proposalNumber}${versionLabel} chờ phê duyệt`),
        html,
        attachments: attachment ? [describeAttachment(attachment)] : undefined,
      });
    }
    return { notified: recipients.length, attachment: attachment?.filename ?? null };
  }

  // ── External send ────────────────────────────────────────────────────────

  private async assertSendPermission(user: { id: string; role: Role }, mallId: string) {
    await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    if (user.role === Role.ADMIN) return;
    const configured = await this.permissions.getAllowedRoles(PROPOSAL_SEND_EXTERNAL_PERMISSION, mallId);
    const allowed = configured
      ? configured.has(user.role)
      : (MODULE_ROLES.proposalSendExternal as readonly Role[]).includes(user.role);
    if (!allowed) {
      throw new ForbiddenException({
        code: 'PROPOSAL_SEND_EXTERNAL_FORBIDDEN',
        message: 'Bạn không có quyền gửi tờ trình ra bên ngoài.',
      });
    }
  }

  private async proposalMall(proposalId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        proposalNumber: true,
        unit: { select: { code: true, mallId: true } },
        tenant: { select: { contactEmail: true, contactName: true, brandName: true } },
        lead: { select: { email: true, contactName: true, brandName: true } },
      },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    return proposal;
  }

  async canSend(user: { id: string; role: Role }, mallId: string) {
    return this.assertSendPermission(user, mallId).then(() => true, () => false);
  }

  /** What the send dialog needs: approved versions and contacts the user can pick from. */
  async sendContext(proposalId: string, user: { id: string; role: Role }) {
    const proposal = await this.proposalMall(proposalId);
    const versions = await this.documents.listVersions(proposalId);
    const approved = versions.filter((v) => v.status === 'APPROVED');
    const suggested: Array<{ email: string; name: string | null; source: 'TENANT_CONTACT' | 'LEAD_CONTACT' }> = [];
    if (proposal.tenant?.contactEmail) suggested.push({ email: proposal.tenant.contactEmail, name: proposal.tenant.contactName, source: 'TENANT_CONTACT' });
    if (proposal.lead?.email && proposal.lead.email !== proposal.tenant?.contactEmail) {
      suggested.push({ email: proposal.lead.email, name: proposal.lead.contactName, source: 'LEAD_CONTACT' });
    }
    return {
      canSend: await this.canSend(user, proposal.unit.mallId),
      approvedVersions: approved.map((v) => ({
        ...v,
        attachmentFilename: ProposalDocumentDeliveryService.attachmentFilename(proposal.proposalNumber, v.versionNumber),
      })),
      suggestedRecipients: suggested,
      defaultSubject: approved[0] ? `Tờ trình ${proposal.proposalNumber} - phiên bản ${approved[0].versionNumber}` : null,
    };
  }

  private normalizeEmails(values: string[] | undefined) {
    return [...new Set((values ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean))];
  }

  async sendExternal(proposalId: string, input: SendProposalDocumentInput, user: { id: string; role: Role }, idempotencyKey?: string) {
    const key = idempotencyKey?.trim();
    if (!key || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Thiếu Idempotency-Key hợp lệ cho thao tác gửi.' });
    }
    const proposal = await this.proposalMall(proposalId);
    await this.assertSendPermission(user, proposal.unit.mallId);

    const to = this.normalizeEmails(input.to);
    const cc = this.normalizeEmails(input.cc).filter((e) => !to.includes(e));
    if (!to.length) throw new BadRequestException('Cần ít nhất một người nhận');

    const replay = await this.findSend(proposalId, key);
    if (replay) return this.replayOrConflict(replay, input.documentVersionId, to, cc);

    const version = await this.documents.loadVersion(proposalId, input.documentVersionId);
    if (version.status !== 'APPROVED') {
      throw new BadRequestException({
        code: 'PROPOSAL_SEND_VERSION_NOT_APPROVED',
        message: 'Chỉ gửi ra bên ngoài phiên bản tờ trình đã được phê duyệt.',
      });
    }

    const { attachment, model } = await this.renderVersionAttachment({
      proposalId,
      documentVersionId: version.id,
      asOf: this.now(),
      audience: 'EXTERNAL',
    });
    const meta = describeAttachment(attachment);
    const sender = await this.prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    const subject = input.subject?.trim() || `Tờ trình ${proposal.proposalNumber} - phiên bản ${version.versionNumber}`;
    const html = this.email.proposalExternalSendHtml({
      proposalNumber: proposal.proposalNumber,
      documentVersionNumber: version.versionNumber,
      mallName: model.facts.mall.name,
      unitCode: proposal.unit.code,
      message: input.message ?? null,
      senderName: sender?.fullName ?? null,
      attachmentFilename: attachment.filename,
    });

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const delivery = await tx.emailDelivery.create({
          data: {
            eventKey: `proposal-send:${proposalId}:${key}`,
            eventType: 'PROPOSAL_EXTERNAL_SEND',
            entityType: 'Proposal',
            entityId: proposalId,
            mallId: proposal.unit.mallId,
            recipient: { to, cc },
            payload: { subject, html, text: toPlainText(html), attachments: [meta] } as unknown as Prisma.InputJsonValue,
          },
        });
        const send = await tx.proposalDocumentSend.create({
          data: {
            proposalId,
            documentVersionId: version.id,
            idempotencyKey: key,
            recipients: { to, cc },
            subject,
            message: input.message?.trim() || null,
            attachmentFilename: attachment.filename,
            attachmentSha256: meta.sha256,
            emailDeliveryId: delivery.id,
            sentById: user.id,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'PROPOSAL_DOCUMENT_SENT_EXTERNAL',
            entityType: 'PROPOSAL',
            entityId: proposalId,
            payload: JSON.stringify({
              sendId: send.id,
              documentVersionId: version.id,
              versionNumber: version.versionNumber,
              recipientCount: to.length + cc.length,
              attachmentSha256: meta.sha256,
              emailDeliveryId: delivery.id,
            }),
            status: 'SUCCESS',
          },
        });
        return send.id;
      });
      return this.present((await this.findSendById(created))!, false);
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      // A concurrent request with the same key won; answer with its result.
      const winner = await this.findSend(proposalId, key);
      if (!winner) throw error;
      return this.replayOrConflict(winner, input.documentVersionId, to, cc);
    }
  }

  private findSend(proposalId: string, idempotencyKey: string) {
    return this.prisma.proposalDocumentSend.findUnique({
      where: { proposalId_idempotencyKey: { proposalId, idempotencyKey } },
      include: this.sendInclude,
    });
  }

  private findSendById(id: string) {
    return this.prisma.proposalDocumentSend.findUnique({ where: { id }, include: this.sendInclude });
  }

  private readonly sendInclude = {
    documentVersion: { select: { versionNumber: true } },
    emailDelivery: { select: { id: true, status: true, attempts: true, sentAt: true, lastAttemptAt: true } },
  };

  private replayOrConflict(existing: any, documentVersionId: string, to: string[], cc: string[]) {
    const recorded = existing.recipients as { to: string[]; cc: string[] };
    const same = existing.documentVersionId === documentVersionId
      && JSON.stringify(recorded.to) === JSON.stringify(to)
      && JSON.stringify(recorded.cc) === JSON.stringify(cc);
    if (!same) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency-Key này đã được dùng cho một lần gửi khác.',
      });
    }
    return this.present(existing, true);
  }

  private present(row: any, duplicate: boolean) {
    return {
      id: row.id,
      duplicate,
      proposalId: row.proposalId,
      documentVersionId: row.documentVersionId,
      versionNumber: row.documentVersion?.versionNumber ?? null,
      recipients: row.recipients,
      subject: row.subject,
      message: row.message,
      attachmentFilename: row.attachmentFilename,
      attachmentSha256: row.attachmentSha256,
      sentById: row.sentById,
      createdAt: row.createdAt,
      delivery: row.emailDelivery,
    };
  }

  async listSends(proposalId: string) {
    const rows = await this.prisma.proposalDocumentSend.findMany({
      where: { proposalId },
      orderBy: { createdAt: 'desc' },
      include: this.sendInclude,
    });
    return rows.map((row) => this.present(row, false));
  }
}
