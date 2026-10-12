import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  HandoverReadinessEventType,
  HandoverReadinessLifecycle,
  HandoverRiskSeverity,
  HandoverRiskStatus,
  Prisma,
  UnitStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { HandoverActor, HandoverReadinessAccessService } from './handover-readiness-access.service';
import { HandoverReadinessCommitmentsService } from './handover-readiness-commitments.service';
import { HandoverReadinessNotifierService, ReadinessNotifyContext } from './handover-readiness-notifier.service';
import { validateEvidenceImage } from './handover-readiness-evidence';
import {
  businessToday,
  CustomerCommitment,
  daysBetween,
  evaluateReadiness,
  formatBusinessDate,
  HANDOVER_POLICY,
  HandoverDerivedStatus,
  parseBusinessDate,
  ReadinessEvaluation,
} from './handover-readiness.policy';
import {
  AddHandoverRiskDto,
  ChangeHandoverTargetDateDto,
  ConfirmHandoverReadyDto,
  StartHandoverTrackingDto,
} from './dto/handover-readiness.dto';

type Tx = Prisma.TransactionClient;
type Db = PrismaService | Tx;

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };
const STATUS_ORDER: Record<HandoverDerivedStatus, number> = { OVERDUE: 0, AT_RISK: 1, TRACKING: 2, CONFIRMED: 3, CANCELLED: 4 };

const readinessInclude = {
  unit: { select: { id: true, code: true, name: true, status: true, isActive: true, floor: { select: { name: true } } } },
  mall: { select: { id: true, name: true } },
  projectOwner: { select: { id: true, fullName: true } },
  recordedBy: { select: { id: true, fullName: true } },
  confirmedBy: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.UnitHandoverReadinessInclude;

type ReadinessRow = Prisma.UnitHandoverReadinessGetPayload<{ include: typeof readinessInclude }>;

function trimmed(value: string | undefined | null, field: string, min = 5): string {
  const v = (value ?? '').trim();
  if (v.length < min) throw new BadRequestException({ code: 'HANDOVER_REASON_REQUIRED', message: `${field} phải có ít nhất ${min} ký tự.` });
  return v;
}

@Injectable()
export class HandoverReadinessService {
  private readonly logger = new Logger(HandoverReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HandoverReadinessAccessService,
    private readonly commitments: HandoverReadinessCommitmentsService,
    private readonly notifier: HandoverReadinessNotifierService,
    private readonly storage: StorageService,
  ) {}

  // ─── Loading & evaluation (single path for every consumer) ──────────────────

  /** Authoritative Mall of a readiness record -- from the row, never the client. */
  private async mallOf(readinessId: string): Promise<string> {
    const row = await this.prisma.unitHandoverReadiness.findUnique({ where: { id: readinessId }, select: { mallId: true } });
    if (!row) throw new NotFoundException('Không tìm thấy theo dõi bàn giao');
    return row.mallId;
  }

  private async unitOf(unitId: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { id: true, mallId: true, code: true, name: true, status: true, isActive: true },
    });
    if (!unit) throw new NotFoundException('Không tìm thấy mặt bằng');
    return unit;
  }

  /** Row lock serializing every mutation of one readiness record. */
  private async lock(tx: Tx, readinessId: string): Promise<ReadinessRow> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "UnitHandoverReadiness" WHERE "id" = ${readinessId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException('Không tìm thấy theo dõi bàn giao');
    return tx.unitHandoverReadiness.findUniqueOrThrow({ where: { id: readinessId }, include: readinessInclude });
  }

  private async evaluationInputs(db: Db, ids: string[]) {
    const [dateChanges, highRisks] = await Promise.all([
      db.unitHandoverReadinessEvent.groupBy({
        by: ['readinessId'],
        where: { readinessId: { in: ids }, eventType: HandoverReadinessEventType.TARGET_DATE_CHANGED },
        _count: { _all: true },
      }),
      db.unitHandoverRisk.groupBy({
        by: ['readinessId'],
        where: { readinessId: { in: ids }, status: HandoverRiskStatus.OPEN, severity: HandoverRiskSeverity.HIGH },
        _count: { _all: true },
      }),
    ]);
    return {
      dateChanges: new Map(dateChanges.map((r) => [r.readinessId, r._count._all])),
      highRisks: new Map(highRisks.map((r) => [r.readinessId, r._count._all])),
    };
  }

  /** Evaluate many rows with one batch of queries. The ONLY status derivation path. */
  async evaluateRows(
    db: Db,
    rows: Array<{ id: string; unitId: string; lifecycleStatus: HandoverReadinessLifecycle; targetReadyDate: Date; originalTargetDate: Date }>,
    today: Date = businessToday(),
  ): Promise<Map<string, { evaluation: ReadinessEvaluation; commitments: CustomerCommitment[] }>> {
    const out = new Map<string, { evaluation: ReadinessEvaluation; commitments: CustomerCommitment[] }>();
    if (rows.length === 0) return out;
    const inputs = await this.evaluationInputs(db, rows.map((r) => r.id));
    const commitments = await this.commitments.forUnits([...new Set(rows.map((r) => r.unitId))], db);
    for (const r of rows) {
      const unitCommitments = commitments.get(r.unitId) ?? [];
      out.set(r.id, {
        commitments: unitCommitments,
        evaluation: evaluateReadiness({
          lifecycleStatus: r.lifecycleStatus,
          targetReadyDate: r.targetReadyDate,
          originalTargetDate: r.originalTargetDate,
          dateChangeCount: inputs.dateChanges.get(r.id) ?? 0,
          openHighRiskCount: inputs.highRisks.get(r.id) ?? 0,
          commitments: unitCommitments,
        }, today),
      });
    }
    return out;
  }

  private async evaluateOne(db: Db, row: ReadinessRow, today?: Date) {
    return (await this.evaluateRows(db, [row], today)).get(row.id)!;
  }

  notifyContext(row: ReadinessRow, evaluation: ReadinessEvaluation): ReadinessNotifyContext {
    return {
      id: row.id,
      mallId: row.mallId,
      mallName: row.mall.name,
      unitId: row.unitId,
      unitCode: row.unit.code,
      unitName: row.unit.name,
      targetReadyDate: row.targetReadyDate,
      originalTargetDate: row.originalTargetDate,
      projectOwnerId: row.projectOwnerId,
      projectOwnerLabel: row.projectOwner?.fullName ?? row.projectOwnerName ?? null,
      evaluation,
    };
  }

  private summary(row: ReadinessRow, evaluation: ReadinessEvaluation) {
    return {
      id: row.id,
      mallId: row.mallId,
      mallName: row.mall.name,
      unitId: row.unitId,
      unitCode: row.unit.code,
      unitName: row.unit.name,
      floorName: row.unit.floor?.name ?? null,
      lifecycleStatus: row.lifecycleStatus,
      status: evaluation.status,
      targetReadyDate: formatBusinessDate(row.targetReadyDate),
      originalTargetDate: formatBusinessDate(row.originalTargetDate),
      projectOwner: row.projectOwner ? { id: row.projectOwner.id, fullName: row.projectOwner.fullName } : null,
      projectOwnerName: row.projectOwnerName,
      recordedBy: row.recordedBy,
      confirmedAt: row.confirmedAt,
      confirmedBy: row.confirmedBy,
      confirmNote: row.confirmNote,
      version: row.version,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      evaluation,
    };
  }

  private async audit(tx: Tx, actorId: string, action: string, readinessId: string, payload: Record<string, unknown>) {
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action,
        entityType: 'UnitHandoverReadiness',
        entityId: readinessId,
        newValue: JSON.stringify(payload),
      },
    });
  }

  private async actorName(db: Db, userId: string): Promise<string> {
    const u = await db.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    return u?.fullName ?? userId;
  }

  /**
   * Records + notifies a customer-commitment conflict the FIRST time a given
   * (source, commitment date, project target) combination is seen. Idempotent
   * via the event dedupeKey (INSERT ... ON CONFLICT DO NOTHING), so the
   * scheduler, a date change and a concurrent instance can all call it.
   */
  async recordConflictIfNew(tx: Tx, row: ReadinessRow, evaluation: ReadinessEvaluation): Promise<boolean> {
    const c = evaluation.conflict;
    if (!c || row.lifecycleStatus !== HandoverReadinessLifecycle.TRACKING) return false;
    const dedupeKey = `conflict:${row.id}:${c.sourceType}:${c.sourceId}:${c.commitmentDate}:${c.projectTargetDate}`;
    const inserted = await tx.unitHandoverReadinessEvent.createMany({
      data: [{
        readinessId: row.id,
        eventType: HandoverReadinessEventType.COMMITMENT_CONFLICT_DETECTED,
        dedupeKey,
        metadata: c as unknown as Prisma.InputJsonValue,
      }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return false;
    await this.notifier.notify(tx, this.notifyContext(row, evaluation), { kind: 'COMMITMENT_CONFLICT' }, `handover:${row.id}:CONFLICT:${c.sourceType}:${c.sourceId}:${c.commitmentDate}:${c.projectTargetDate}`);
    return true;
  }

  // ─── Reads ─────────────────────────────────────────────────────────────────

  async getForUnit(actor: HandoverActor, unitId: string) {
    const unit = await this.unitOf(unitId);
    await this.access.assert(actor, 'view', unit.mallId);
    const capabilities = await this.access.capabilities(actor, unit.mallId);
    const current = await this.prisma.unitHandoverReadiness.findUnique({ where: { activeUnitId: unitId }, select: { id: true } });
    const history = await this.prisma.unitHandoverReadiness.findMany({
      where: { unitId, lifecycleStatus: HandoverReadinessLifecycle.CANCELLED },
      select: { id: true, cancelledAt: true, cancelReason: true, originalTargetDate: true, targetReadyDate: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return {
      unit: { id: unit.id, code: unit.code, name: unit.name, mallId: unit.mallId, isActive: unit.isActive, status: unit.status },
      capabilities,
      canStart: capabilities.manage && !current && unit.isActive && unit.status !== UnitStatus.MERGED,
      readiness: current ? await this.detailUnchecked(actor, current.id) : null,
      cancelledHistory: history.map((h) => ({
        id: h.id,
        cancelledAt: h.cancelledAt,
        cancelReason: h.cancelReason,
        originalTargetDate: formatBusinessDate(h.originalTargetDate),
        targetReadyDate: formatBusinessDate(h.targetReadyDate),
      })),
    };
  }

  async detail(actor: HandoverActor, readinessId: string) {
    await this.access.assert(actor, 'view', await this.mallOf(readinessId));
    return this.detailUnchecked(actor, readinessId);
  }

  private async detailUnchecked(actor: HandoverActor, readinessId: string) {
    const row = await this.prisma.unitHandoverReadiness.findUniqueOrThrow({ where: { id: readinessId }, include: readinessInclude });
    const { evaluation, commitments } = await this.evaluateOne(this.prisma, row);
    const [risks, followers, evidence, events, capabilities] = await Promise.all([
      this.prisma.unitHandoverRisk.findMany({
        where: { readinessId },
        include: { owner: { select: { id: true, fullName: true } }, createdBy: { select: { id: true, fullName: true } } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.unitHandoverFollower.findMany({
        where: { readinessId },
        include: { user: { select: { id: true, fullName: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.unitHandoverEvidence.findMany({
        where: { readinessId, deletedAt: null },
        include: { uploadedBy: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.timelineRows(readinessId),
      this.access.capabilities(actor, row.mallId),
    ]);

    // HANDOVER-SOD-01: evaluated here only to explain the UI; confirm() re-checks.
    let sodBlockedReason: string | null = null;
    if (row.recordedById === actor.id) sodBlockedReason = 'Bạn là người đặt/cập nhật ngày dự kiến bàn giao gần nhất nên không thể tự xác nhận (tách biệt nhiệm vụ).';
    else if (row.projectOwnerId && row.projectOwnerId === actor.id) sodBlockedReason = 'Bạn là đầu mối Ban dự án (bên bàn giao) nên không thể tự xác nhận.';
    const stagedEvidence = evidence.filter((e) => !e.confirmationEventId).length;

    return {
      ...this.summary(row, evaluation),
      note: row.note,
      commitments: commitments.map((c) => ({ ...c, commitmentDate: formatBusinessDate(c.commitmentDate) })),
      risks: risks.map((r) => ({ ...r, dueDate: formatBusinessDate(r.dueDate) })),
      followers: followers.map((f) => ({ id: f.id, userId: f.userId, fullName: f.user.fullName, role: f.user.role, createdAt: f.createdAt })),
      evidence: evidence.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        mimeType: e.mimeType,
        fileSize: e.fileSize,
        caption: e.caption,
        uploadedBy: e.uploadedBy,
        createdAt: e.createdAt,
        confirmationEventId: e.confirmationEventId,
        // Never the storage path: the file is reachable only through this route.
        downloadPath: `/handover-readiness/${readinessId}/evidence/${e.id}/file`,
      })),
      stagedEvidenceCount: stagedEvidence,
      minConfirmationImages: HANDOVER_POLICY.minConfirmationImages,
      timeline: events,
      capabilities,
      isFollowing: followers.some((f) => f.userId === actor.id),
      sod: { canSelfConfirm: sodBlockedReason === null, reason: sodBlockedReason },
    };
  }

  private async timelineRows(readinessId: string) {
    const events = await this.prisma.unitHandoverReadinessEvent.findMany({
      where: { readinessId },
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: { sequence: 'asc' },
    });
    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      occurredAt: e.occurredAt,
      actor: e.actor,
      reason: e.reason,
      oldDate: formatBusinessDate(e.oldDate),
      newDate: formatBusinessDate(e.newDate),
      riskId: e.riskId,
      metadata: e.metadata,
    }));
  }

  async timeline(actor: HandoverActor, readinessId: string) {
    await this.access.assert(actor, 'view', await this.mallOf(readinessId));
    return this.timelineRows(readinessId);
  }

  /** Users that may be picked as follower / project owner / risk owner for this Unit's Mall. */
  async candidates(actor: HandoverActor, unitId: string) {
    const unit = await this.unitOf(unitId);
    await this.access.assert(actor, 'view', unit.mallId);
    const users = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null, role: { not: 'TENANT' }, mallAccess: { some: { mallId: unit.mallId, isActive: true } } },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
      take: 500,
    });
    const out: typeof users = [];
    for (const u of users) if (await this.access.roleGranted(u.role, 'view', unit.mallId)) out.push(u);
    return out;
  }

  /**
   * Mall-scoped analytics list + KPIs, optionally narrowed to one floor. The
   * floor only narrows WITHIN the authorized Malls (a foreign floorId yields
   * nothing), and KPIs are computed on the narrowed set.
   */
  async list(actor: HandoverActor, mallId?: string | null, floorId?: string | null, today: Date = businessToday()) {
    const mallIds = await this.access.authorizedMallIds(actor, 'view', mallId || null);
    const rows = await this.prisma.unitHandoverReadiness.findMany({
      where: {
        lifecycleStatus: { in: [HandoverReadinessLifecycle.TRACKING, HandoverReadinessLifecycle.CONFIRMED] },
        unit: { isActive: true, ...(floorId ? { floorId } : {}) },
        ...(mallIds ? { mallId: { in: mallIds } } : {}),
      },
      include: readinessInclude,
    });
    const evaluations = await this.evaluateRows(this.prisma, rows, today);
    const items = rows.map((r) => this.summary(r, evaluations.get(r.id)!.evaluation));
    items.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      || a.evaluation.daysRemaining - b.evaluation.daysRemaining
      || a.unitCode.localeCompare(b.unitCode));
    return { items, kpis: this.kpis(items.map((i) => i.evaluation)), asOf: formatBusinessDate(today) };
  }

  kpis(evaluations: ReadinessEvaluation[]) {
    const live = evaluations.filter((e) => e.status !== 'CONFIRMED' && e.status !== 'CANCELLED');
    return {
      tracking: live.length,
      dueWithin30: live.filter((e) => e.daysRemaining >= 0 && e.daysRemaining <= HANDOVER_POLICY.warningDays).length,
      dueWithin7: live.filter((e) => e.daysRemaining >= 0 && e.daysRemaining <= HANDOVER_POLICY.criticalDays).length,
      overdue: live.filter((e) => e.status === 'OVERDUE').length,
      atRisk: live.filter((e) => e.status === 'AT_RISK').length,
      conflicts: live.filter((e) => e.conflict).length,
      highRisks: live.reduce((s, e) => s + e.openHighRiskCount, 0),
      confirmed: evaluations.filter((e) => e.status === 'CONFIRMED').length,
    };
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────

  private async assertOwnerCandidate(db: Db, userId: string | undefined, mallId: string, label: string) {
    if (!userId) return;
    const check = await this.access.userCanView(userId, mallId, db);
    if (!check.ok) {
      throw new BadRequestException({
        code: 'HANDOVER_USER_MALL_INVALID',
        message: `${label} phải là người dùng đang hoạt động, có quyền truy cập Mall này và quyền xem theo dõi bàn giao.`,
      });
    }
  }

  async start(actor: HandoverActor, unitId: string, dto: StartHandoverTrackingDto) {
    const unit = await this.unitOf(unitId);
    await this.access.assert(actor, 'manage', unit.mallId);
    if (!unit.isActive || unit.status === UnitStatus.MERGED) {
      throw new BadRequestException({ code: 'HANDOVER_UNIT_INACTIVE', message: 'Mặt bằng không còn hoạt động nên không thể theo dõi bàn giao.' });
    }
    const target = parseBusinessDate(dto.targetReadyDate, 'Ngày dự kiến bàn giao');
    await this.assertOwnerCandidate(this.prisma, dto.projectOwnerId, unit.mallId, 'Đầu mối Ban dự án');

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const created = await tx.unitHandoverReadiness.create({
          data: {
            mallId: unit.mallId,
            unitId,
            activeUnitId: unitId,
            originalTargetDate: target,
            targetReadyDate: target,
            projectOwnerId: dto.projectOwnerId || null,
            projectOwnerName: dto.projectOwnerName?.trim() || null,
            recordedById: actor.id,
            note: dto.note?.trim() || null,
            createdById: actor.id,
            updatedById: actor.id,
          },
          include: readinessInclude,
        });
        await tx.unitHandoverReadinessEvent.create({
          data: {
            readinessId: created.id,
            eventType: HandoverReadinessEventType.TRACKING_STARTED,
            actorId: actor.id,
            newDate: target,
            metadata: { projectOwnerId: created.projectOwnerId, projectOwnerName: created.projectOwnerName, note: created.note },
          },
        });
        // The starter follows by default when they are a valid recipient.
        if ((await this.access.userCanView(actor.id, unit.mallId, tx)).ok) {
          await tx.unitHandoverFollower.create({ data: { readinessId: created.id, userId: actor.id, addedById: actor.id } });
        }
        await this.audit(tx, actor.id, 'HANDOVER_READINESS_START', created.id, { unitId, targetReadyDate: dto.targetReadyDate });
        const { evaluation } = await this.evaluateOne(tx, created);
        await this.recordConflictIfNew(tx, created, evaluation);
        return created.id;
      }, TX_OPTIONS);
      return this.detailUnchecked(actor, id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'HANDOVER_ALREADY_TRACKING', message: 'Mặt bằng này đã đang được theo dõi bàn giao.' });
      }
      throw error;
    }
  }

  async changeTargetDate(actor: HandoverActor, readinessId: string, dto: ChangeHandoverTargetDateDto) {
    await this.access.assert(actor, 'manage', await this.mallOf(readinessId));
    const newDate = parseBusinessDate(dto.targetReadyDate, 'Ngày dự kiến bàn giao');
    const reason = trimmed(dto.reason, 'Lý do thay đổi');
    const actorName = await this.actorName(this.prisma, actor.id);

    await this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, readinessId);
      if (row.lifecycleStatus !== HandoverReadinessLifecycle.TRACKING) {
        throw new ConflictException({
          code: row.lifecycleStatus === HandoverReadinessLifecycle.CONFIRMED ? 'HANDOVER_ALREADY_CONFIRMED' : 'HANDOVER_CANCELLED',
          message: 'Chỉ đổi được ngày khi mặt bằng đang được theo dõi (chưa xác nhận/không bị hủy).',
        });
      }
      if (dto.expectedVersion !== undefined && dto.expectedVersion !== row.version) {
        throw new ConflictException({ code: 'HANDOVER_STALE', message: 'Dữ liệu đã được người khác cập nhật. Vui lòng tải lại.' });
      }
      const oldDate = row.targetReadyDate;
      if (oldDate.getTime() === newDate.getTime()) {
        throw new BadRequestException({ code: 'HANDOVER_DATE_UNCHANGED', message: 'Ngày mới trùng ngày hiện tại.' });
      }
      const updated = await tx.unitHandoverReadiness.update({
        where: { id: readinessId },
        data: { targetReadyDate: newDate, recordedById: actor.id, updatedById: actor.id, version: { increment: 1 } },
        include: readinessInclude,
      });
      const event = await tx.unitHandoverReadinessEvent.create({
        data: {
          readinessId,
          eventType: HandoverReadinessEventType.TARGET_DATE_CHANGED,
          actorId: actor.id,
          reason,
          oldDate,
          newDate,
          metadata: { deltaDays: daysBetween(oldDate, newDate), direction: newDate > oldDate ? 'DELAYED' : 'EARLIER' },
        },
      });
      await this.audit(tx, actor.id, 'HANDOVER_READINESS_TARGET_DATE_CHANGE', readinessId, {
        oldDate: formatBusinessDate(oldDate), newDate: dto.targetReadyDate, reason,
      });
      const { evaluation } = await this.evaluateOne(tx, updated);
      await this.notifier.notify(
        tx,
        this.notifyContext(updated, evaluation),
        { kind: 'TARGET_DATE_CHANGED', oldDate, newDate, reason, actorName },
        `handover:${readinessId}:DATE_CHANGED:${event.id}`,
        { excludeUserId: actor.id },
      );
      await this.recordConflictIfNew(tx, updated, evaluation);
    }, TX_OPTIONS);
    return this.detailUnchecked(actor, readinessId);
  }

  async addRisk(actor: HandoverActor, readinessId: string, dto: AddHandoverRiskDto) {
    const mallId = await this.mallOf(readinessId);
    await this.access.assert(actor, 'riskManage', mallId);
    await this.assertOwnerCandidate(this.prisma, dto.ownerId, mallId, 'Người phụ trách rủi ro');
    const dueDate = dto.dueDate ? parseBusinessDate(dto.dueDate, 'Hạn xử lý') : null;
    const title = trimmed(dto.title, 'Tiêu đề rủi ro', 3);
    const actorName = await this.actorName(this.prisma, actor.id);

    await this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, readinessId);
      if (row.lifecycleStatus !== HandoverReadinessLifecycle.TRACKING) {
        throw new ConflictException({ code: 'HANDOVER_NOT_TRACKING', message: 'Chỉ ghi nhận rủi ro khi mặt bằng đang được theo dõi.' });
      }
      const risk = await tx.unitHandoverRisk.create({
        data: {
          readinessId,
          title,
          description: dto.description?.trim() || null,
          severity: dto.severity,
          ownerId: dto.ownerId || null,
          dueDate,
          createdById: actor.id,
        },
      });
      await tx.unitHandoverReadinessEvent.create({
        data: {
          readinessId,
          eventType: HandoverReadinessEventType.RISK_ADDED,
          actorId: actor.id,
          riskId: risk.id,
          metadata: { title, severity: dto.severity, ownerId: risk.ownerId, dueDate: dto.dueDate ?? null },
        },
      });
      const updated = await tx.unitHandoverReadiness.update({
        where: { id: readinessId },
        data: { version: { increment: 1 }, updatedById: actor.id },
        include: readinessInclude,
      });
      await this.audit(tx, actor.id, 'HANDOVER_READINESS_RISK_ADD', readinessId, { riskId: risk.id, severity: dto.severity, title });
      if (dto.severity === HandoverRiskSeverity.HIGH) {
        const { evaluation } = await this.evaluateOne(tx, updated);
        await this.notifier.notify(
          tx,
          this.notifyContext(updated, evaluation),
          { kind: 'HIGH_RISK_ADDED', riskTitle: title, actorName },
          `handover:${readinessId}:HIGH_RISK:${risk.id}`,
          { excludeUserId: actor.id },
        );
      }
    }, TX_OPTIONS);
    return this.detailUnchecked(actor, readinessId);
  }

  async resolveRisk(actor: HandoverActor, readinessId: string, riskId: string, resolutionNote: string) {
    await this.access.assert(actor, 'riskManage', await this.mallOf(readinessId));
    const note = trimmed(resolutionNote, 'Ghi chú xử lý');
    await this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, readinessId);
      if (row.lifecycleStatus === HandoverReadinessLifecycle.CANCELLED) {
        throw new ConflictException({ code: 'HANDOVER_CANCELLED', message: 'Theo dõi bàn giao đã bị hủy.' });
      }
      const risk = await tx.unitHandoverRisk.findFirst({ where: { id: riskId, readinessId } });
      if (!risk) throw new NotFoundException('Không tìm thấy rủi ro');
      const resolved = await tx.unitHandoverRisk.updateMany({
        where: { id: riskId, readinessId, status: HandoverRiskStatus.OPEN },
        data: { status: HandoverRiskStatus.RESOLVED, resolvedAt: new Date(), resolvedById: actor.id, resolutionNote: note },
      });
      if (resolved.count === 0) {
        throw new ConflictException({ code: 'HANDOVER_RISK_ALREADY_RESOLVED', message: 'Rủi ro này đã được xử lý.' });
      }
      await tx.unitHandoverReadinessEvent.create({
        data: {
          readinessId,
          eventType: HandoverReadinessEventType.RISK_RESOLVED,
          actorId: actor.id,
          riskId,
          reason: note,
          metadata: { title: risk.title, severity: risk.severity },
        },
      });
      await tx.unitHandoverReadiness.update({ where: { id: readinessId }, data: { version: { increment: 1 }, updatedById: actor.id } });
      await this.audit(tx, actor.id, 'HANDOVER_READINESS_RISK_RESOLVE', readinessId, { riskId, note });
    }, TX_OPTIONS);
    return this.detailUnchecked(actor, readinessId);
  }

  async follow(actor: HandoverActor, readinessId: string, targetUserId?: string) {
    const mallId = await this.mallOf(readinessId);
    const userId = targetUserId || actor.id;
    await this.access.assert(actor, userId === actor.id ? 'view' : 'manage', mallId);
    const check = await this.access.userCanView(userId, mallId);
    if (!check.ok) {
      throw new BadRequestException({
        code: 'HANDOVER_FOLLOWER_MALL_INVALID',
        message: 'Người theo dõi phải có quyền truy cập Mall của mặt bằng và quyền xem theo dõi bàn giao.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, readinessId);
      if (row.lifecycleStatus === HandoverReadinessLifecycle.CANCELLED) {
        throw new ConflictException({ code: 'HANDOVER_CANCELLED', message: 'Theo dõi bàn giao đã bị hủy.' });
      }
      const inserted = await tx.unitHandoverFollower.createMany({ data: [{ readinessId, userId, addedById: actor.id }], skipDuplicates: true });
      if (inserted.count > 0) {
        await tx.unitHandoverReadinessEvent.create({
          data: { readinessId, eventType: HandoverReadinessEventType.FOLLOWER_ADDED, actorId: actor.id, metadata: { userId } },
        });
      }
    }, TX_OPTIONS);
    return this.detailUnchecked(actor, readinessId);
  }

  async unfollow(actor: HandoverActor, readinessId: string, targetUserId: string) {
    const mallId = await this.mallOf(readinessId);
    await this.access.assert(actor, targetUserId === actor.id ? 'view' : 'manage', mallId);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, readinessId);
      const removed = await tx.unitHandoverFollower.deleteMany({ where: { readinessId, userId: targetUserId } });
      if (removed.count > 0) {
        await tx.unitHandoverReadinessEvent.create({
          data: { readinessId, eventType: HandoverReadinessEventType.FOLLOWER_REMOVED, actorId: actor.id, metadata: { userId: targetUserId } },
        });
      }
    }, TX_OPTIONS);
    return this.detailUnchecked(actor, readinessId);
  }

  // ─── Evidence ──────────────────────────────────────────────────────────────

  async uploadEvidence(actor: HandoverActor, readinessId: string, file: Express.Multer.File, caption?: string) {
    const mallId = await this.mallOf(readinessId);
    await this.access.assert(actor, 'confirm', mallId);
    const image = validateEvidenceImage(file);
    const saved = await this.storage.saveFile(file, `handover-readiness/${readinessId}`);
    try {
      await this.prisma.$transaction(async (tx) => {
        const row = await this.lock(tx, readinessId);
        if (row.lifecycleStatus !== HandoverReadinessLifecycle.TRACKING) {
          throw new ConflictException({ code: 'HANDOVER_NOT_TRACKING', message: 'Chỉ tải ảnh xác nhận khi mặt bằng đang được theo dõi.' });
        }
        const evidence = await tx.unitHandoverEvidence.create({
          data: {
            readinessId,
            mallId: row.mallId,
            fileName: saved.fileName,
            filePath: saved.filePath,
            fileSize: file.size,
            mimeType: image.mimeType,
            sha256: image.sha256,
            caption: caption?.trim() || null,
            uploadedById: actor.id,
          },
        });
        await tx.unitHandoverReadinessEvent.create({
          data: {
            readinessId,
            eventType: HandoverReadinessEventType.EVIDENCE_ADDED,
            actorId: actor.id,
            metadata: { evidenceId: evidence.id, fileName: saved.fileName, sha256: image.sha256 },
          },
        });
      }, TX_OPTIONS);
    } catch (error) {
      await this.storage.deleteFile(saved.filePath);
      throw error;
    }
    return this.detailUnchecked(actor, readinessId);
  }

  /** Only photos never consumed by a confirmation; soft delete (file retained). */
  async removeEvidence(actor: HandoverActor, readinessId: string, evidenceId: string) {
    await this.access.assert(actor, 'confirm', await this.mallOf(readinessId));
    await this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, readinessId);
      if (row.lifecycleStatus !== HandoverReadinessLifecycle.TRACKING) {
        throw new ConflictException({ code: 'HANDOVER_EVIDENCE_LOCKED', message: 'Ảnh xác nhận không thể xóa sau khi đã xác nhận.' });
      }
      const removed = await tx.unitHandoverEvidence.updateMany({
        where: { id: evidenceId, readinessId, confirmationEventId: null, deletedAt: null },
        data: { deletedAt: new Date(), deletedById: actor.id },
      });
      if (removed.count === 0) throw new NotFoundException('Không tìm thấy ảnh có thể xóa');
      await tx.unitHandoverReadinessEvent.create({
        data: { readinessId, eventType: HandoverReadinessEventType.EVIDENCE_REMOVED, actorId: actor.id, metadata: { evidenceId } },
      });
    }, TX_OPTIONS);
    return this.detailUnchecked(actor, readinessId);
  }

  async evidenceFile(actor: HandoverActor, readinessId: string, evidenceId: string) {
    const evidence = await this.prisma.unitHandoverEvidence.findFirst({
      where: { id: evidenceId, readinessId, deletedAt: null },
      include: { readiness: { select: { mallId: true } } },
    });
    // Same 404 whether it doesn't exist or belongs to another record: no probing.
    if (!evidence || evidence.readiness.mallId !== evidence.mallId) throw new NotFoundException('Không tìm thấy ảnh');
    await this.access.assert(actor, 'view', evidence.readiness.mallId);
    const stream = this.storage.getFileStream(evidence.filePath);
    if (!stream) throw new NotFoundException('Ảnh không tồn tại trên máy chủ');
    return { stream, fileName: evidence.fileName, mimeType: evidence.mimeType };
  }

  // ─── Confirm / Reopen / Cancel ───────────────────────────────────────────────

  async confirm(actor: HandoverActor, readinessId: string, dto: ConfirmHandoverReadyDto) {
    const note = trimmed(dto.note, 'Ghi chú xác nhận');
    const actorName = await this.actorName(this.prisma, actor.id);
    await this.prisma.$transaction(async (tx) => {
      // 1. re-read under lock
      const row = await this.lock(tx, readinessId);
      // 2 + 3. Mall and permission from the locked row itself
      await this.access.assert(actor, 'confirm', row.mallId);
      // 4. lifecycle
      if (row.lifecycleStatus === HandoverReadinessLifecycle.CONFIRMED) {
        throw new ConflictException({ code: 'HANDOVER_ALREADY_CONFIRMED', message: 'Mặt bằng đã được xác nhận đủ điều kiện bàn giao.' });
      }
      if (row.lifecycleStatus === HandoverReadinessLifecycle.CANCELLED) {
        throw new ConflictException({ code: 'HANDOVER_CANCELLED', message: 'Theo dõi bàn giao đã bị hủy.' });
      }
      // 5. evidence
      const staged = await tx.unitHandoverEvidence.findMany({
        where: { readinessId, confirmationEventId: null, deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (staged.length < HANDOVER_POLICY.minConfirmationImages) {
        throw new BadRequestException({
          code: 'HANDOVER_EVIDENCE_REQUIRED',
          message: `Cần tối thiểu ${HANDOVER_POLICY.minConfirmationImages} ảnh xác nhận hợp lệ (hiện có ${staged.length}).`,
        });
      }
      // 6. HANDOVER-SOD-01 -- applies to ADMIN too.
      if (row.recordedById === actor.id) {
        throw new ForbiddenException({
          code: 'HANDOVER_SOD_SETTER',
          message: 'Người đặt/cập nhật ngày dự kiến bàn giao gần nhất không được tự xác nhận đủ điều kiện.',
        });
      }
      if (row.projectOwnerId && row.projectOwnerId === actor.id) {
        throw new ForbiddenException({
          code: 'HANDOVER_SOD_PROJECT_OWNER',
          message: 'Đầu mối Ban dự án (bên bàn giao) không được tự xác nhận đủ điều kiện.',
        });
      }
      // 7-9. state
      const confirmedAt = new Date();
      const updated = await tx.unitHandoverReadiness.update({
        where: { id: readinessId },
        data: {
          lifecycleStatus: HandoverReadinessLifecycle.CONFIRMED,
          confirmedAt,
          confirmedById: actor.id,
          confirmNote: note,
          updatedById: actor.id,
          version: { increment: 1 },
        },
        include: readinessInclude,
      });
      const openRisks = await tx.unitHandoverRisk.findMany({
        where: { readinessId, status: HandoverRiskStatus.OPEN },
        select: { id: true, title: true, severity: true },
      });
      // 10. ledger + immutable evidence link
      const event = await tx.unitHandoverReadinessEvent.create({
        data: {
          readinessId,
          eventType: HandoverReadinessEventType.CONFIRMED,
          actorId: actor.id,
          reason: note,
          newDate: row.targetReadyDate,
          metadata: {
            evidenceIds: staged.map((e) => e.id),
            targetReadyDate: formatBusinessDate(row.targetReadyDate),
            originalTargetDate: formatBusinessDate(row.originalTargetDate),
            recordedById: row.recordedById,
            openRisks,
          },
        },
      });
      const linked = await tx.unitHandoverEvidence.updateMany({
        where: { id: { in: staged.map((e) => e.id) }, confirmationEventId: null, deletedAt: null },
        data: { confirmationEventId: event.id },
      });
      if (linked.count !== staged.length) throw new ConflictException({ code: 'HANDOVER_EVIDENCE_CHANGED', message: 'Ảnh xác nhận vừa thay đổi. Vui lòng thử lại.' });
      // 11. audit
      await this.audit(tx, actor.id, 'HANDOVER_READINESS_CONFIRM', readinessId, { note, evidenceIds: staged.map((e) => e.id), eventId: event.id });
      // 12. durable notification intent
      const { evaluation } = await this.evaluateOne(tx, updated);
      const riskSummary = openRisks.length === 0
        ? 'Không có'
        : openRisks.map((r) => `[${r.severity}] ${r.title}`).join('; ');
      await this.notifier.notify(
        tx,
        this.notifyContext(updated, evaluation),
        { kind: 'CONFIRMED', confirmedAt, confirmedByName: actorName, note, evidenceCount: staged.length, openRiskSummary: riskSummary },
        `handover:${readinessId}:CONFIRMED:${event.id}`,
      );
    }, TX_OPTIONS);
    return this.detailUnchecked(actor, readinessId);
  }

  async reopen(actor: HandoverActor, readinessId: string, reasonInput: string) {
    const reason = trimmed(reasonInput, 'Lý do mở lại');
    const actorName = await this.actorName(this.prisma, actor.id);
    await this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, readinessId);
      await this.access.assert(actor, 'reopen', row.mallId);
      if (row.lifecycleStatus !== HandoverReadinessLifecycle.CONFIRMED) {
        throw new ConflictException({ code: 'HANDOVER_NOT_CONFIRMED', message: 'Chỉ mở lại được khi mặt bằng đã được xác nhận.' });
      }
      const lastConfirmation = await tx.unitHandoverReadinessEvent.findFirst({
        where: { readinessId, eventType: HandoverReadinessEventType.CONFIRMED },
        orderBy: { sequence: 'desc' },
        select: { id: true },
      });
      const updated = await tx.unitHandoverReadiness.update({
        where: { id: readinessId },
        data: {
          lifecycleStatus: HandoverReadinessLifecycle.TRACKING,
          confirmedAt: null,
          confirmedById: null,
          confirmNote: null,
          updatedById: actor.id,
          version: { increment: 1 },
        },
        include: readinessInclude,
      });
      const event = await tx.unitHandoverReadinessEvent.create({
        data: {
          readinessId,
          eventType: HandoverReadinessEventType.REOPENED,
          actorId: actor.id,
          reason,
          metadata: {
            reopenedConfirmationEventId: lastConfirmation?.id ?? null,
            previousConfirmedAt: row.confirmedAt?.toISOString() ?? null,
            previousConfirmedById: row.confirmedById,
            previousConfirmNote: row.confirmNote,
          },
        },
      });
      await this.audit(tx, actor.id, 'HANDOVER_READINESS_REOPEN', readinessId, { reason, eventId: event.id });
      const { evaluation } = await this.evaluateOne(tx, updated);
      await this.notifier.notify(
        tx,
        this.notifyContext(updated, evaluation),
        { kind: 'REOPENED', reason, actorName },
        `handover:${readinessId}:REOPENED:${event.id}`,
        { excludeUserId: actor.id },
      );
    }, TX_OPTIONS);
    return this.detailUnchecked(actor, readinessId);
  }

  async cancel(actor: HandoverActor, readinessId: string, reasonInput: string) {
    const reason = trimmed(reasonInput, 'Lý do hủy theo dõi');
    await this.access.assert(actor, 'manage', await this.mallOf(readinessId));
    await this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, readinessId);
      if (row.lifecycleStatus !== HandoverReadinessLifecycle.TRACKING) {
        throw new ConflictException({
          code: row.lifecycleStatus === HandoverReadinessLifecycle.CONFIRMED ? 'HANDOVER_ALREADY_CONFIRMED' : 'HANDOVER_CANCELLED',
          message: 'Chỉ hủy được theo dõi đang hoạt động (chưa xác nhận).',
        });
      }
      await tx.unitHandoverReadiness.update({
        where: { id: readinessId },
        data: {
          lifecycleStatus: HandoverReadinessLifecycle.CANCELLED,
          activeUnitId: null,
          cancelledAt: new Date(),
          cancelledById: actor.id,
          cancelReason: reason,
          updatedById: actor.id,
          version: { increment: 1 },
        },
      });
      await tx.unitHandoverReadinessEvent.create({
        data: { readinessId, eventType: HandoverReadinessEventType.CANCELLED, actorId: actor.id, reason },
      });
      await this.audit(tx, actor.id, 'HANDOVER_READINESS_CANCEL', readinessId, { reason });
    }, TX_OPTIONS);
    return this.detailUnchecked(actor, readinessId);
  }
}
