import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailDeliveryService } from '../notifications/email-delivery.service';
import { appUrl, EmailDocument, emailSubject, esc, EmailSeverity, InfoRow, renderEmail } from '../notifications/email-design-system';
import { HandoverReadinessAccessService } from './handover-readiness-access.service';
import { NotificationRoutingService } from '../notifications/routing/notification-routing.service';
import { formatBusinessDate, ReadinessEvaluation } from './handover-readiness.policy';

type Db = PrismaService | Prisma.TransactionClient;

/** Mall-management roles that receive every readiness notification for their Mall. */
export const HANDOVER_MALL_RECIPIENT_ROLES: Role[] = [Role.MALL_DIRECTOR, Role.LEASING_MANAGER];

export interface ReadinessNotifyContext {
  id: string;
  mallId: string;
  mallName: string;
  unitId: string;
  unitCode: string;
  unitName: string | null;
  targetReadyDate: Date;
  originalTargetDate: Date;
  projectOwnerId: string | null;
  projectOwnerLabel: string | null;
  evaluation: ReadinessEvaluation;
}

export type ReadinessNotifyKind =
  | { kind: 'REMINDER'; slotKey: string }
  | { kind: 'TARGET_DATE_CHANGED'; oldDate: Date; newDate: Date; reason: string; actorName: string }
  | { kind: 'HIGH_RISK_ADDED'; riskTitle: string; actorName: string }
  | { kind: 'COMMITMENT_CONFLICT' }
  | { kind: 'CONFIRMED'; confirmedAt: Date; confirmedByName: string; note: string; evidenceCount: number; openRiskSummary: string }
  | { kind: 'REOPENED'; reason: string; actorName: string };

export interface HandoverRecipient {
  id: string;
  email: string;
  fullName: string;
}

/** dd/mm/yyyy of a business date, from its UTC components (no timezone shift). */
export function fmtBusinessDateVN(value: Date | null | undefined): string | null {
  const iso = formatBusinessDate(value);
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const STATUS_LABEL: Record<string, string> = {
  TRACKING: 'Đang theo dõi',
  AT_RISK: 'Có rủi ro',
  OVERDUE: 'Quá hạn',
  CONFIRMED: 'Đã xác nhận đủ điều kiện',
  CANCELLED: 'Đã hủy theo dõi',
};

/**
 * The CTA is a convenience. appUrl() deliberately throws on an unsafe
 * FRONTEND_URL (e.g. plain HTTP in production); that must never roll back the
 * business transaction the email rides in (a confirmation, a date change), so
 * a bad link config drops the button instead of blocking Operation.
 */
function safeAppUrl(path: string, logger: Logger): string | null {
  try {
    return appUrl(path);
  } catch (error) {
    logger.warn(`Handover email CTA omitted: ${(error as Error).message}`);
    return null;
  }
}

/**
 * renderEmail() also resolves the logo through appUrl(), so the same config
 * error makes the whole branded template throw. Fall back to a minimal,
 * fully-escaped body: the durable intent is still recorded and the business
 * transaction is never rolled back by a presentation/config problem.
 */
function renderSafely(doc: EmailDocument, logger: Logger): string {
  try {
    return renderEmail(doc);
  } catch (error) {
    logger.warn(`Handover email rendered without branding: ${(error as Error).message}`);
    const rows = (doc.info?.rows ?? [])
      .filter((r) => r.value !== null && r.value !== undefined && String(r.value).trim() !== '')
      .map((r) => `<tr><td>${esc(r.label)}</td><td><strong>${esc(r.value)}</strong></td></tr>`)
      .join('');
    return `<!DOCTYPE html><html lang="vi"><body><h2>${esc(doc.title)}</h2>${doc.description ? `<p>${doc.description}</p>` : ''}<table>${rows}</table></body></html>`;
  }
}

function daysLabel(evaluation: ReadinessEvaluation): string {
  if (evaluation.status === 'CONFIRMED' || evaluation.status === 'CANCELLED') return STATUS_LABEL[evaluation.status];
  if (evaluation.daysRemaining < 0) return `Quá hạn ${-evaluation.daysRemaining} ngày`;
  if (evaluation.daysRemaining === 0) return 'Hôm nay là ngày dự kiến';
  return `Còn ${evaluation.daysRemaining} ngày`;
}

@Injectable()
export class HandoverReadinessNotifierService {
  private readonly logger = new Logger(HandoverReadinessNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly access: HandoverReadinessAccessService,
    private readonly routing: NotificationRoutingService,
  ) {}

  /**
   * followers + project owner (when a User) + the Mall's Mall Director /
   * Leasing Manager. Every candidate is re-validated for active account, real
   * Mall access and the `view` action at send time -- a revoked follower
   * silently stops receiving mail. Global ADMINs are NOT included by default.
   */
  async recipients(db: Db, readinessId: string, mallId: string, projectOwnerId: string | null): Promise<HandoverRecipient[]> {
    const followers = await db.unitHandoverFollower.findMany({ where: { readinessId }, select: { userId: true } });
    const mallManagers = await this.mallManagerIds(db, mallId);
    const candidateIds = new Set<string>([
      ...followers.map((f) => f.userId),
      ...(projectOwnerId ? [projectOwnerId] : []),
      ...mallManagers,
    ]);
    return this.validRecipients(db, mallId, candidateIds);
  }

  async mallManagerIds(db: Db, mallId: string): Promise<string[]> {
    const managers = await db.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        role: { in: HANDOVER_MALL_RECIPIENT_ROLES },
        mallAccess: { some: { mallId, isActive: true } },
      },
      select: { id: true },
    });
    return managers.map((m) => m.id);
  }

  async validRecipients(db: Db, mallId: string, candidateIds: Iterable<string>): Promise<HandoverRecipient[]> {
    const out: HandoverRecipient[] = [];
    for (const userId of candidateIds) {
      const check = await this.access.userCanView(userId, mallId, db);
      if (check.ok && check.user?.email) out.push({ id: check.user.id, email: check.user.email, fullName: check.user.fullName });
    }
    return out;
  }

  /**
   * Durable notification intent: one EmailDelivery (+ in-app Notification) per
   * recipient, written through the caller's transaction so it commits or rolls
   * back with the business change. `baseKey` must be deterministic -- the
   * EmailDelivery.eventKey unique index makes retries a no-op.
   */
  async notify(
    db: Db,
    ctx: ReadinessNotifyContext,
    event: ReadinessNotifyKind,
    baseKey: string,
    opts: { excludeUserId?: string } = {},
  ): Promise<number> {
    const recipients = (await this.recipients(db, ctx.id, ctx.mallId, ctx.projectOwnerId))
      .filter((r) => r.id !== opts.excludeUserId);
    // CR-NOTIFICATION-RECIPIENT-ROUTING: the list above is this event's DEFAULT
    // rule; an administrator may have replaced or extended it for this Mall.
    const plan = await this.routing.plan({
      eventKey: 'HANDOVER_READINESS_EVENT',
      mallId: ctx.mallId,
      resourceId: ctx.id,
      defaults: recipients.map((r) => ({ email: r.email, userId: r.id, fullName: r.fullName, keySuffix: r.id })),
    }, db);
    if (plan.failClosed) {
      this.logger.error(`Handover notification ${baseKey} withheld: configured recipients are no longer eligible`);
      return 0;
    }
    if (plan.recipients.length === 0) return 0;
    const content = this.compose(ctx, event);
    for (const recipient of plan.recipients) {
      await this.emailDelivery.enqueue(db, {
        eventKey: `${baseKey}:${recipient.keySuffix}`,
        eventType: `HANDOVER_READINESS_${event.kind}`,
        entityType: 'UnitHandoverReadiness',
        entityId: ctx.id,
        mallId: ctx.mallId,
        to: recipient.email,
        subject: content.subject,
        html: content.html,
      });
      if (!recipient.userId) continue;
      await db.notification.create({
        data: {
          userId: recipient.userId,
          type: `HANDOVER_READINESS_${event.kind}`,
          title: content.notificationTitle,
          body: content.notificationBody,
          entityType: 'UNIT_HANDOVER_READINESS',
          entityId: ctx.id,
        },
      });
    }
    return plan.recipients.length;
  }

  private baseRows(ctx: ReadinessNotifyContext): InfoRow[] {
    const e = ctx.evaluation;
    const rows: InfoRow[] = [
      { label: 'Mall', value: ctx.mallName },
      { label: 'Mặt bằng', value: ctx.unitName ? `${ctx.unitCode} — ${ctx.unitName}` : ctx.unitCode },
      { label: 'Ngày Ban dự án dự kiến bàn giao', value: fmtBusinessDateVN(ctx.targetReadyDate), emphasis: true },
      { label: 'Ngày dự kiến ban đầu', value: fmtBusinessDateVN(ctx.originalTargetDate) },
      { label: 'Tình trạng', value: `${STATUS_LABEL[e.status]} · ${daysLabel(e)}` },
      { label: 'Số lần lùi ngày', value: e.dateChangeCount > 0 ? `${e.dateChangeCount} lần (trễ ${Math.max(e.delayDays, 0)} ngày so với ban đầu)` : null },
      { label: 'Rủi ro mức CAO đang mở', value: e.openHighRiskCount > 0 ? String(e.openHighRiskCount) : null },
      { label: 'Đầu mối Ban dự án', value: ctx.projectOwnerLabel },
    ];
    if (e.conflict) {
      rows.push({
        label: 'Cam kết bàn giao cho khách',
        value: `${fmtBusinessDateVN(new Date(`${e.conflict.commitmentDate}T00:00:00Z`))} (sớm hơn ${e.conflict.differenceDays} ngày${e.conflict.sourceRef ? ` · ${e.conflict.sourceRef}` : ''})`,
        emphasis: true,
      });
    }
    return rows;
  }

  compose(ctx: ReadinessNotifyContext, event: ReadinessNotifyKind): { subject: string; html: string; notificationTitle: string; notificationBody: string } {
    const unitLabel = ctx.unitCode;
    const ctaUrl = safeAppUrl('/spaces?view=analytics', this.logger);
    const cta = ctaUrl ? { label: 'Xem theo dõi bàn giao', url: ctaUrl } : undefined;
    let severity: EmailSeverity = 'WARNING';
    let title: string;
    let description: string;
    const extra: InfoRow[] = [];

    switch (event.kind) {
      case 'REMINDER': {
        const d = ctx.evaluation.daysRemaining;
        severity = d <= 7 ? 'CRITICAL' : 'WARNING';
        title = d < 0
          ? `Mặt bằng ${unitLabel} đã quá hạn bàn giao ${-d} ngày`
          : d === 0
            ? `Hôm nay là ngày Ban dự án dự kiến bàn giao ${unitLabel}`
            : `Còn ${d} ngày đến hạn bàn giao mặt bằng ${unitLabel}`;
        description = 'Mặt bằng chưa được Vận hành xác nhận đủ điều kiện bàn giao. Vui lòng kiểm tra tiến độ với Ban dự án.';
        break;
      }
      case 'TARGET_DATE_CHANGED': {
        const later = event.newDate.getTime() > event.oldDate.getTime();
        severity = later ? 'WARNING' : 'INFO';
        title = later ? `Ban dự án lùi ngày bàn giao ${unitLabel}` : `Cập nhật ngày bàn giao ${unitLabel}`;
        description = `Ngày dự kiến đổi từ ${esc(fmtBusinessDateVN(event.oldDate))} sang ${esc(fmtBusinessDateVN(event.newDate))}.`;
        extra.push({ label: 'Lý do', value: event.reason }, { label: 'Người cập nhật', value: event.actorName });
        break;
      }
      case 'HIGH_RISK_ADDED':
        severity = 'CRITICAL';
        title = `Rủi ro mức CAO cho bàn giao ${unitLabel}`;
        description = `Rủi ro mới: <strong>${esc(event.riskTitle)}</strong>`;
        extra.push({ label: 'Người ghi nhận', value: event.actorName });
        break;
      case 'COMMITMENT_CONFLICT':
        severity = 'CRITICAL';
        title = `Xung đột cam kết bàn giao ${unitLabel}`;
        description = esc(ctx.evaluation.conflict?.message ?? '');
        break;
      case 'CONFIRMED':
        severity = 'SUCCESS';
        title = `Mặt bằng ${unitLabel} đã đủ điều kiện bàn giao`;
        description = 'Vận hành đã xác nhận mặt bằng đủ điều kiện bàn giao từ Ban dự án. Ảnh xác nhận chỉ xem được trong hệ thống (cần đăng nhập và có quyền).';
        extra.push(
          { label: 'Thời điểm xác nhận', value: new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(event.confirmedAt) },
          { label: 'Người xác nhận', value: event.confirmedByName },
          { label: 'Ghi chú xác nhận', value: event.note },
          { label: 'Số ảnh xác nhận', value: String(event.evidenceCount) },
          { label: 'Rủi ro còn mở', value: event.openRiskSummary },
        );
        break;
      case 'REOPENED':
        severity = 'WARNING';
        title = `Mở lại theo dõi bàn giao ${unitLabel}`;
        description = 'Xác nhận đủ điều kiện trước đó đã được mở lại. Lịch sử và ảnh xác nhận cũ vẫn được lưu.';
        extra.push({ label: 'Lý do', value: event.reason }, { label: 'Người mở lại', value: event.actorName });
        break;
    }

    const html = renderSafely({
      preheader: `${ctx.mallName} · ${unitLabel} · ${daysLabel(ctx.evaluation)}`,
      severity,
      eyebrow: 'Bàn giao mặt bằng · Ban dự án',
      title,
      description,
      info: { title: 'Thông tin theo dõi', rows: [...extra, ...this.baseRows(ctx)] },
      cta,
    }, this.logger);
    return {
      subject: emailSubject(`[Bàn giao MB] ${title}`),
      html,
      notificationTitle: title,
      notificationBody: `${ctx.mallName} · ${unitLabel} · Ngày dự kiến ${fmtBusinessDateVN(ctx.targetReadyDate)} · ${daysLabel(ctx.evaluation)}`,
    };
  }

  composeDigest(mallName: string, weekKey: string, kpis: Record<string, number>): { subject: string; html: string } {
    const html = renderSafely({
      preheader: `${mallName} · ${kpis.dueWithin30} mặt bằng ≤30 ngày · ${kpis.overdue} quá hạn`,
      severity: kpis.overdue > 0 || kpis.conflicts > 0 ? 'CRITICAL' : kpis.dueWithin30 > 0 ? 'WARNING' : 'INFO',
      eyebrow: `Bàn giao mặt bằng · Tổng hợp tuần ${weekKey}`,
      title: `Tình hình bàn giao mặt bằng — ${mallName}`,
      info: {
        title: 'Tổng hợp',
        rows: [
          { label: 'Đang theo dõi', value: String(kpis.tracking) },
          { label: 'Còn ≤30 ngày', value: String(kpis.dueWithin30), emphasis: kpis.dueWithin30 > 0 },
          { label: 'Còn ≤7 ngày', value: String(kpis.dueWithin7), emphasis: kpis.dueWithin7 > 0 },
          { label: 'Quá hạn', value: String(kpis.overdue), emphasis: kpis.overdue > 0 },
          { label: 'Xung đột cam kết với khách', value: String(kpis.conflicts), emphasis: kpis.conflicts > 0 },
          { label: 'Rủi ro mức CAO đang mở', value: String(kpis.highRisks), emphasis: kpis.highRisks > 0 },
        ],
      },
      cta: (() => { const url = safeAppUrl('/spaces?view=analytics', this.logger); return url ? { label: 'Mở phân tích bàn giao', url } : undefined; })(),
    }, this.logger);
    return { subject: emailSubject(`[Bàn giao MB] Tổng hợp tuần ${weekKey} — ${mallName}`), html };
  }
}
