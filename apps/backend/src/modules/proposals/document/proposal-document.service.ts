import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, ProposalStatus, StepStatus, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { recordProposalVersion } from '../proposal-version.recorder';
import { SaveProposalDocumentContentDto } from '../dto/proposal-document-content.dto';
import {
  buildFacts,
  buildProposalDocument,
  computeSourceFingerprint,
  editorialDefaults,
  isNarrativeEditable,
  normalizeStoredContent,
  PROPOSAL_DOCUMENT_ITEMS,
  ProposalDocumentSource,
  ProposalDocumentVersionRow,
  buildVersionDocument,
  snapshotForVersion,
  approvalFromRoutePreview,
} from './proposal-document.mapper';
import { ProposalApprovalRouteService } from '../proposal-approval-route.service';
import {
  PROPOSAL_DOCUMENT_SCHEMA_VERSION,
  ProposalDocumentEditableContent,
  ProposalDocumentItemKey,
  ProposalDocumentModel,
  ProposalDocumentRenderedSnapshot,
  StoredProposalDocumentContentV2,
} from './proposal-document.types';

type Client = PrismaService | Prisma.TransactionClient;

/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 — loads, saves and gates the canonical
 * Tờ trình. The editor, `GET /proposals/:id/pdf` and the approval screen all
 * come through `getDocument`; there is no second mapping anywhere.
 *
 * Authorisation is not done here: the controller validates Mall access from
 * the Proposal id before any of these methods run.
 */
@Injectable()
export class ProposalDocumentService {
  private readonly logger = new Logger(ProposalDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly routes?: ProposalApprovalRouteService,
  ) {}

  /** Overridable clock so draft dating is testable. */
  protected now(): Date {
    return new Date();
  }

  async loadSource(id: string, client: Client = this.prisma): Promise<ProposalDocumentSource> {
    const proposal = await client.proposal.findUnique({
      where: { id },
      include: {
        // Proposal → Unit → Mall is the ownership path MallAccessService uses.
        unit: {
          select: {
            id: true,
            code: true,
            floor: { select: { name: true } },
            zone: { select: { name: true } },
            mall: { select: { id: true, code: true, name: true, city: true } },
          },
        },
        tenant: {
          select: {
            companyName: true, brandName: true, category: true,
            categoryRef: { select: { id: true, code: true, name: true } },
          },
        },
        lead: {
          select: {
            company: true, brandName: true, category: true,
            categoryRef: { select: { id: true, code: true, name: true } },
          },
        },
        approvalWorkflow: {
          select: {
            status: true,
            createdAt: true,
            steps: {
              select: {
                id: true, stepOrder: true, stepName: true, approverRole: true, approverId: true,
                status: true, decidedAt: true, comment: true, decidedByUserId: true, decidedByDisplayName: true,
                approver: { select: { id: true, fullName: true } },
              },
              orderBy: [{ stepOrder: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');

    // Proposal carries createdById without a Prisma relation; resolve it
    // explicitly rather than falling back to a named person.
    const creator = await client.user.findUnique({
      where: { id: proposal.createdById },
      select: { id: true, fullName: true, role: true, department: true },
    });

    // Review evidence: who last saved the document, and whether a submission has
    // since used that review up.
    const savedById = (proposal.editorContent as { savedById?: unknown } | null)?.savedById;
    const [reviewer, latestVersion] = await Promise.all([
      typeof savedById === 'string'
        ? client.user.findUnique({ where: { id: savedById }, select: { id: true, fullName: true, isActive: true, deletedAt: true } })
        : Promise.resolve(null),
      client.proposalDocumentVersion.findFirst({
        where: { proposalId: id },
        orderBy: { versionNumber: 'desc' },
        select: { submittedAt: true },
      }),
    ]);

    return { ...proposal, creator, reviewer, lastSubmittedAt: latestVersion?.submittedAt ?? null } as unknown as ProposalDocumentSource;
  }

  /** The DRAFT document: today's Proposal facts plus saved editorial content. */
  async getLiveDocument(id: string, client: Client = this.prisma): Promise<ProposalDocumentModel> {
    return buildProposalDocument(await this.loadSource(id, client), this.now());
  }

  /**
   * The document a reader of this Proposal should see now. A DRAFT is built
   * live. Once submitted it is the immutable version bound to the current
   * workflow, whatever has happened to the Proposal or its master data since.
   * A Proposal submitted before versioning existed has no version and is shown
   * live, flagged LEGACY_SUBMISSION_UNVERSIONED.
   */
  async getDocument(id: string, client: Client = this.prisma, opts: { asOf?: Date | null } = {}): Promise<ProposalDocumentModel> {
    const proposal = await client.proposal.findUnique({
      where: { id },
      select: { status: true, approvalWorkflow: { select: { documentVersionId: true } } },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    const versionId = proposal.status !== ProposalStatus.DRAFT ? proposal.approvalWorkflow?.documentVersionId : null;
    if (versionId) return this.getVersionDocument(id, versionId, client, opts);

    const live = await this.getLiveDocument(id, client);
    if (proposal.status === ProposalStatus.DRAFT) {
      await this.attachRoutePreview(live);
    } else {
      live.warnings = [...live.warnings, 'Proposal được trình trước khi có phiên bản tờ trình; nội dung hiển thị theo dữ liệu hiện tại.'];
      live.warningCodes = [...live.warningCodes, 'LEGACY_SUBMISSION_UNVERSIONED'];
    }
    return live;
  }

  /**
   * The draft shows the full route it would get if submitted now, named with
   * the current position holders. A preview failure never hides the document:
   * the approval block then says the route could not be worked out.
   */
  private async attachRoutePreview(live: ProposalDocumentModel) {
    if (!this.routes || live.approval.steps.length) return;
    try {
      live.approval = approvalFromRoutePreview(await this.routes.preview(live.proposalId));
    } catch (error: any) {
      this.logger.warn(JSON.stringify({ event: 'proposal.route.preview.failed', proposalId: live.proposalId, error: error?.message }));
    }
  }

  private readonly versionInclude = {
    approvalWorkflow: {
      select: {
        id: true,
        status: true,
        createdAt: true,
        steps: {
          select: {
            id: true, stepOrder: true, stepName: true, approverRole: true, approverId: true,
            status: true, decidedAt: true, comment: true, decidedByUserId: true, decidedByDisplayName: true,
            approver: { select: { id: true, fullName: true } },
          },
          orderBy: [{ stepOrder: 'asc' as const }, { id: 'asc' as const }],
        },
      },
    },
  };

  /** A version of *this* Proposal; an id belonging to another Proposal is not found. */
  async loadVersion(proposalId: string, versionId: string, client: Client = this.prisma) {
    const row = await client.proposalDocumentVersion.findFirst({
      where: { id: versionId, proposalId },
      include: this.versionInclude,
    });
    if (!row) throw new NotFoundException('Proposal document version not found');
    return row;
  }

  async getVersionDocument(
    proposalId: string,
    versionId: string,
    client: Client = this.prisma,
    opts: { asOf?: Date | null } = {},
  ): Promise<ProposalDocumentModel> {
    const row = await this.loadVersion(proposalId, versionId, client);
    const source = await this.loadSource(proposalId, client);
    return buildVersionDocument(row as unknown as ProposalDocumentVersionRow, {
      proposalStatus: source.status,
      liveFingerprint: computeSourceFingerprint(buildFacts(source)),
      asOf: opts.asOf ?? null,
    });
  }

  async listVersions(proposalId: string, client: Client = this.prisma) {
    const rows = await client.proposalDocumentVersion.findMany({
      where: { proposalId },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true, versionNumber: true, status: true, submittedAt: true, submittedById: true,
        sourceFingerprint: true, renderedSnapshot: true,
        approvalWorkflow: { select: { id: true, status: true } },
      },
    });
    return rows.map(({ renderedSnapshot, ...row }) => ({
      ...row,
      submittedByName: (renderedSnapshot as unknown as ProposalDocumentRenderedSnapshot)?.submittedByName ?? null,
    }));
  }

  /**
   * Writes the immutable version inside the caller's submit transaction, from
   * the live document that transaction just re-read and fingerprint-checked.
   */
  async createSubmittedVersion(tx: Prisma.TransactionClient, live: ProposalDocumentModel, actorId: string) {
    const [latest, actor] = await Promise.all([
      tx.proposalDocumentVersion.aggregate({ where: { proposalId: live.proposalId }, _max: { versionNumber: true } }),
      tx.user.findUnique({ where: { id: actorId }, select: { fullName: true } }),
    ]);
    const snapshot = snapshotForVersion(live, actor?.fullName ?? null);
    return tx.proposalDocumentVersion.create({
      data: {
        proposalId: live.proposalId,
        versionNumber: (latest._max.versionNumber ?? 0) + 1,
        status: 'SUBMITTED',
        sourceFingerprint: snapshot.sourceFingerprint,
        contentVersion: snapshot.contentVersion,
        factsSnapshot: snapshot.factsSnapshot as unknown as Prisma.InputJsonValue,
        contentSnapshot: snapshot.contentSnapshot as unknown as Prisma.InputJsonValue,
        renderedSnapshot: snapshot.renderedSnapshot as unknown as Prisma.InputJsonValue,
        submittedById: actorId,
      },
    });
  }

  /**
   * Re-opens the Tờ trình as a DRAFT so the author can change it and route it
   * again. The previous workflow is detached from the Proposal but stays bound
   * to the version it was deciding on, so its evidence is never mixed into the
   * next version.
   *
   *  - SUBMITTED / UNDER_REVIEW: the submission is withdrawn. Steps nobody has
   *    decided are SKIPPED, the workflow becomes WITHDRAWN and the version
   *    SUPERSEDED. Approvers who already signed keep their signature on it.
   *  - APPROVED, no contract yet: the approved version is SUPERSEDED. The new
   *    version needs a complete approval from the start.
   *  - REJECTED: as before.
   *  - CONVERTED, or any Proposal a contract was created from: refused.
   *
   * Serializable, so it cannot interleave with an approval decision on the same
   * workflow: one of the two commits and the other gets a conflict.
   */
  async startRevision(proposalId: string, actorId: string, reason?: string | null) {
    const note = reason?.trim() || null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ status: string; proposalNumber: string }>>(Prisma.sql`
          SELECT status::text AS status, "proposalNumber" FROM "Proposal" WHERE id = ${proposalId} FOR UPDATE
        `);
        if (!locked.length) throw new NotFoundException('Proposal not found');
        const status = locked[0].status as ProposalStatus;

        if (status === ProposalStatus.DRAFT) {
          throw new BadRequestException({
            code: 'PROPOSAL_ALREADY_DRAFT',
            message: 'Tờ trình đang ở trạng thái nháp và có thể chỉnh sửa trực tiếp.',
          });
        }
        const contract = await tx.contract.findFirst({ where: { proposalId }, select: { contractNumber: true } });
        if (status === ProposalStatus.CONVERTED || contract) {
          throw new BadRequestException({
            code: 'PROPOSAL_REVISION_NOT_ALLOWED',
            message: contract
              ? `Proposal đã tạo hợp đồng ${contract.contractNumber}; không thể lập lại tờ trình.`
              : 'Proposal đã chuyển hợp đồng; không thể lập lại tờ trình.',
          });
        }
        const withdrawing = status === ProposalStatus.SUBMITTED || status === ProposalStatus.UNDER_REVIEW;
        if ((withdrawing || status === ProposalStatus.APPROVED) && (!note || note.length < 5)) {
          throw new BadRequestException({
            code: 'PROPOSAL_REVISION_REASON_REQUIRED',
            message: 'Vui lòng nhập lý do lập lại tờ trình (tối thiểu 5 ký tự).',
          });
        }

        const workflow = await tx.approvalWorkflow.findUnique({
          where: { proposalId },
          select: {
            id: true, status: true, documentVersionId: true,
            steps: { where: { status: StepStatus.PENDING }, select: { approverId: true } },
          },
        });

        // The workflow already reached its outcome but the Proposal has not
        // caught up yet (the outcome event is still being processed).
        const settled = !!workflow && (
          (withdrawing && workflow.status !== WorkflowStatus.IN_PROGRESS)
          || (status === ProposalStatus.APPROVED && workflow.status !== WorkflowStatus.APPROVED)
          || (status === ProposalStatus.REJECTED && workflow.status !== WorkflowStatus.REJECTED)
        );
        if (settled) {
          throw new ConflictException({
            code: 'PROPOSAL_REVISION_CONFLICT',
            message: 'Kết quả phê duyệt vừa được cập nhật. Vui lòng tải lại Proposal rồi thử lại.',
          });
        }

        let skippedSteps = 0;
        if (workflow) {
          if (withdrawing) {
            skippedSteps = (await tx.approvalStep.updateMany({
              where: { workflowId: workflow.id, status: StepStatus.PENDING },
              data: { status: StepStatus.SKIPPED },
            })).count;
            await tx.approvalWorkflow.update({
              where: { id: workflow.id },
              data: { status: WorkflowStatus.WITHDRAWN, proposalId: null },
            });
          } else {
            await tx.approvalWorkflow.update({ where: { id: workflow.id }, data: { proposalId: null } });
          }
          if (workflow.documentVersionId && status !== ProposalStatus.REJECTED) {
            await tx.proposalDocumentVersion.updateMany({
              where: { id: workflow.documentVersionId, status: { in: ['SUBMITTED', 'APPROVED'] } },
              data: { status: 'SUPERSEDED' },
            });
          }
          // Approvers still waiting on this document are told it was taken back.
          if (withdrawing) {
            const recipients = [...new Set(workflow.steps.map((s) => s.approverId).filter((id): id is string => !!id))];
            for (const userId of recipients) {
              await tx.notification.create({
                data: {
                  userId,
                  title: `Tờ trình ${locked[0].proposalNumber} đã được thu hồi`,
                  body: `Người lập đã thu hồi tờ trình để chỉnh sửa. Lý do: ${note}`,
                  type: 'APPROVAL_WITHDRAWN',
                  entityType: 'PROPOSAL',
                  entityId: proposalId,
                },
              });
            }
          }
        }

        await tx.proposal.update({ where: { id: proposalId }, data: { status: ProposalStatus.DRAFT } });
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: 'PROPOSAL_DOCUMENT_REVISION_STARTED',
            entityType: 'PROPOSAL',
            entityId: proposalId,
            payload: JSON.stringify({
              previousStatus: status,
              reason: note,
              previousWorkflowId: workflow?.id ?? null,
              previousDocumentVersionId: workflow?.documentVersionId ?? null,
              skippedSteps,
            }),
            status: 'SUCCESS',
          },
        });
        return {
          proposalId,
          previousStatus: status,
          previousDocumentVersionId: workflow?.documentVersionId ?? null,
          skippedSteps,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      if (error?.code === 'P2034') {
        throw new ConflictException({
          code: 'PROPOSAL_REVISION_CONFLICT',
          message: 'Tờ trình vừa có thao tác phê duyệt khác. Vui lòng tải lại Proposal rồi thử lại.',
        });
      }
      throw error;
    }
  }

  async saveContent(id: string, dto: SaveProposalDocumentContentDto, actorId: string): Promise<ProposalDocumentModel> {
    return this.prisma.$transaction(async (tx) => {
      // Serialise concurrent saves on this Proposal: the second writer waits,
      // then sees the first writer's contentVersion and is refused.
      const locked = await tx.$queryRaw<Array<{ id: string; status: string; editorContent: unknown }>>(Prisma.sql`
        SELECT id, status::text AS status, "editorContent"
        FROM "Proposal"
        WHERE id = ${id}
        FOR UPDATE
      `);
      if (!locked.length) throw new NotFoundException('Proposal not found');
      if (locked[0].status !== ProposalStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT proposals can be edited');
      }

      const stored = normalizeStoredContent(locked[0].editorContent);
      if (dto.expectedContentVersion !== stored.contentVersion) {
        throw new ConflictException({
          code: 'PROPOSAL_DOCUMENT_VERSION_CONFLICT',
          message: 'Nội dung tờ trình đã được lưu bởi một phiên làm việc khác. Vui lòng tải lại trước khi lưu.',
          currentContentVersion: stored.contentVersion,
        });
      }

      const source = await this.loadSource(id, tx);
      const now = this.now();
      const facts = buildFacts(source);
      const fingerprint = computeSourceFingerprint(facts);
      if (dto.reviewedFingerprint !== fingerprint) {
        // Saving marks the document as reviewed against these facts, so it may
        // only happen when the author actually saw them.
        throw new ConflictException({
          code: 'PROPOSAL_DOCUMENT_SOURCE_CHANGED',
          message: 'Thông tin Proposal đã thay đổi sau khi mở tờ trình. Vui lòng tải lại để kiểm tra trước khi lưu.',
        });
      }

      const content = this.toStoredContent(dto, source, now);
      const next: StoredProposalDocumentContentV2 = {
        schemaVersion: PROPOSAL_DOCUMENT_SCHEMA_VERSION,
        content,
        sourceFingerprint: fingerprint,
        contentVersion: stored.contentVersion + 1,
        savedAt: now.toISOString(),
        savedById: actorId,
      };

      const updated = await tx.proposal.update({
        where: { id },
        data: { editorContent: next as unknown as Prisma.InputJsonValue },
      });

      // Fingerprints and versions only: the commercial body stays out of the log.
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'PROPOSAL_DOCUMENT_CONTENT_SAVED',
          entityType: 'PROPOSAL',
          entityId: id,
          payload: JSON.stringify({
            fromContentVersion: stored.contentVersion,
            toContentVersion: next.contentVersion,
            previousFingerprint: stored.savedFingerprint,
            newFingerprint: fingerprint,
            migratedFromLegacy: stored.kind === 'LEGACY',
          }),
          status: 'SUCCESS',
        },
      });

      await recordProposalVersion(tx, updated as unknown as Record<string, unknown>, actorId, 'EDITOR_UPDATED');

      const reviewer = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, fullName: true, isActive: true, deletedAt: true } });
      return buildProposalDocument({ ...source, editorContent: next, reviewer }, now);
    });
  }

  /**
   * Refuses to route a Tờ trình whose business facts changed after the author
   * last reviewed it. A Proposal whose document was never customised has no
   * reviewed wording to go stale and passes.
   */
  async assertSubmittable(
    id: string,
    client: Client = this.prisma,
    reviewedFingerprint?: string | null,
  ): Promise<ProposalDocumentModel> {
    const document = await this.getLiveDocument(id, client);
    // PROPOSAL-DOC-02: no submission without a human review of today's document.
    if (document.sync.reviewState === 'NOT_REVIEWED') {
      throw new BadRequestException({
        code: 'PROPOSAL_DOCUMENT_NOT_REVIEWED',
        message: 'Tờ trình chưa được người lập kiểm tra và xác nhận nội dung. Vui lòng mở tờ trình, kiểm tra thông tin và lưu xác nhận trước khi trình duyệt.',
      });
    }
    // PROPOSAL-DOC-03: a review of fingerprint F1 cannot authorise F2 — neither the
    // stored review nor one the client claims to have made.
    const reviewedOther = !!reviewedFingerprint && reviewedFingerprint !== document.sync.sourceFingerprint;
    if (document.sync.reviewState === 'STALE' || reviewedOther) {
      throw new BadRequestException({
        code: 'PROPOSAL_DOCUMENT_STALE',
        message: 'Thông tin Proposal đã thay đổi sau lần xác nhận nội dung tờ trình gần nhất. Vui lòng kiểm tra và lưu lại tờ trình trước khi trình duyệt.',
      });
    }
    return document;
  }

  /**
   * Keeps only what the author changed. Text identical to the generated
   * default is not stored, so it keeps following the facts instead of being
   * frozen the way the pre-v2 editor froze whole documents.
   */
  private toStoredContent(
    dto: SaveProposalDocumentContentDto,
    source: ProposalDocumentSource,
    now: Date,
  ): ProposalDocumentEditableContent {
    const input = dto.content ?? {};
    const defaults = editorialDefaults(source, buildFacts(source), now);
    const text = (value: string | null | undefined, fallback: string | null) => {
      if (typeof value !== 'string' || !value.trim()) return null;
      return value === fallback ? null : value;
    };

    const items: ProposalDocumentEditableContent['items'] = {};
    const seen = new Set<ProposalDocumentItemKey>();
    for (const item of input.items ?? []) {
      if (seen.has(item.key)) throw new BadRequestException(`Mục ${item.key} xuất hiện nhiều lần`);
      seen.add(item.key);

      const override: { narrativeText?: string; note?: string } = {};
      if (typeof item.narrativeText === 'string') {
        if (!isNarrativeEditable(item.key)) {
          const label = PROPOSAL_DOCUMENT_ITEMS.find((d) => d.key === item.key)?.label.split('\n')[0] ?? item.key;
          throw new BadRequestException({
            code: 'PROPOSAL_DOCUMENT_FACT_NOT_EDITABLE',
            message: `Mục "${label}" lấy trực tiếp từ dữ liệu Proposal và không thể sửa trong tờ trình.`,
          });
        }
        const narrative = text(item.narrativeText, defaults.narratives[item.key] ?? null);
        if (narrative !== null) override.narrativeText = narrative;
      }
      if (typeof item.note === 'string' && item.note !== (defaults.notes[item.key] ?? '')) {
        override.note = item.note;
      }
      if (Object.keys(override).length) items[item.key] = override;
    }

    const preamble = input.preamble?.length && JSON.stringify(input.preamble) !== JSON.stringify(defaults.preamble)
      ? input.preamble
      : null;
    const itemOrder = input.itemOrder?.length ? [...new Set(input.itemOrder)] : null;
    const defaultOrder = PROPOSAL_DOCUMENT_ITEMS.map((d) => d.key);
    const orderIsDefault = itemOrder
      ? itemOrder.every((k, i) => k === defaultOrder.filter((d) => itemOrder.includes(d))[i])
      : true;

    return {
      docNumber: text(input.docNumber, defaults.docNumber),
      documentDate: input.documentDate && input.documentDate !== defaults.documentDate ? input.documentDate : null,
      subject: text(input.subject, defaults.subject),
      preamble,
      bodyIntro: text(input.bodyIntro, defaults.bodyIntro),
      closingLine: text(input.closingLine, defaults.closingLine),
      items,
      itemOrder: orderIsDefault ? null : itemOrder,
      logoDataUrl: input.logoDataUrl ?? null,
      layoutImageDataUrl: input.layoutImageDataUrl ?? null,
      primaryColor: input.primaryColor ?? null,
    };
  }
}
