import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { CurrencyCode, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import {
  renderEmail,
  appUrl,
  esc,
  money,
  toPlainText,
  type EmailSeverity,
} from './email-design-system';
import { describeAttachment, EmailAttachment } from './email-attachments';

interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface TrackedEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  delivery?: {
    eventKey: string;
    eventType?: string;
    entityType?: string;
    entityId?: string;
    mallId?: string;
    originalDeliveryId?: string;
    resendOfId?: string;
  };
  preparedDeliveryId?: string;
  /**
   * Sent with the message. The ledger stores only metadata and each
   * attachment's `source`, so retry/resend can regenerate identical bytes.
   */
  attachments?: EmailAttachment[];
}

// Nguồn cấu hình SMTP ưu tiên: DB (EmailSettings, admin tự cấu hình qua UI) --
// fallback env var (SMTP_HOST/...) nếu DB chưa bật/chưa cấu hình, để tương
// thích ngược với deployment cũ chỉ dùng .env. Đọc lại mỗi lần gửi (không cache
// transporter) để admin đổi cấu hình có hiệu lực ngay, không cần restart.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly maxAttempts = this.envNumber('EMAIL_MAX_ATTEMPTS', 3, 1);
  private readonly retryBaseMs = this.envNumber('EMAIL_RETRY_BASE_MS', 250, 0);
  private readonly timeoutMs = this.envNumber('EMAIL_TIMEOUT_MS', 15_000, 100);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private async resolveConfig(): Promise<ResolvedSmtpConfig | null> {
    const dbSettings = await this.prisma.emailSettings.findFirst().catch(() => null);
    if (dbSettings?.isEnabled && dbSettings.smtpHost && dbSettings.smtpUser && dbSettings.smtpPassEncrypted) {
      if (!this.encryption.isConfigured) {
        this.logger.warn('EmailSettings bật trong DB nhưng ENCRYPTION_KEY chưa cấu hình -- không thể giải mã mật khẩu SMTP');
      } else {
        return {
          host: dbSettings.smtpHost,
          port: dbSettings.smtpPort,
          secure: dbSettings.smtpSecure,
          user: dbSettings.smtpUser,
          pass: this.encryption.decrypt(dbSettings.smtpPassEncrypted),
          from: dbSettings.emailFrom ?? 'THISO Leasing <noreply@thiso.com.vn>',
        };
      }
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (host && user && pass) {
      return {
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        user,
        pass,
        from: process.env.EMAIL_FROM ?? 'THISO Leasing <noreply@thiso.com.vn>',
      };
    }

    return null;
  }

  private deliveryData(opts: TrackedEmailOptions, status: 'PENDING' | 'SENDING') {
    if (!opts.delivery) throw new Error('Tracked delivery metadata is required');
    return {
      eventKey: opts.delivery.eventKey,
      eventType: opts.delivery.eventType,
      entityType: opts.delivery.entityType,
      entityId: opts.delivery.entityId,
      mallId: opts.delivery.mallId,
      originalDeliveryId: opts.delivery.originalDeliveryId,
      resendOfId: opts.delivery.resendOfId,
      recipient: { to: opts.to, cc: opts.cc ?? null },
      payload: {
        subject: opts.subject,
        html: opts.html,
        text: opts.text ?? toPlainText(opts.html),
        ...(opts.attachments?.length ? { attachments: opts.attachments.map(describeAttachment) } : {}),
      } as unknown as Prisma.InputJsonValue,
      status,
    };
  }

  prepareTrackedDelivery(
    db: Prisma.TransactionClient | PrismaService,
    opts: TrackedEmailOptions,
  ) {
    return db.emailDelivery.create({ data: this.deliveryData(opts, 'PENDING') });
  }

  async sendMail(opts: TrackedEmailOptions) {
    let ledger: any = null;
    if (opts.delivery) {
      if (opts.preparedDeliveryId) {
        const claim = await this.prisma.emailDelivery.updateMany({
          where: { id: opts.preparedDeliveryId, status: 'PENDING' },
          data: { status: 'SENDING' },
        });
        if (claim.count !== 1) {
          const existing = await this.prisma.emailDelivery.findUnique({
            where: { id: opts.preparedDeliveryId },
          });
          return {
            duplicate: true,
            deliveryId: existing?.id ?? opts.preparedDeliveryId,
            messageId: existing?.providerMessageId ?? undefined,
          };
        }
        ledger = { id: opts.preparedDeliveryId };
      } else {
        try {
          ledger = await this.prisma.emailDelivery.create({
            data: this.deliveryData(opts, 'SENDING'),
          });
        } catch (error: any) {
          if (error?.code !== 'P2002') throw error;
          const existing = await this.prisma.emailDelivery.findUnique({
            where: { eventKey: opts.delivery.eventKey },
          });
          if (!existing) throw error;
          return {
            duplicate: true,
            deliveryId: existing.id,
            messageId: existing.providerMessageId ?? undefined,
          };
        }
      }
    }
    const config = await this.resolveConfig();
    if (!config) {
      this.logger.warn(`[EMAIL DISABLED] Would send to ${Array.isArray(opts.to) ? opts.to.join(',') : opts.to}: ${opts.subject}`);
      if (ledger) await this.prisma.emailDelivery.update({ where: { id: ledger.id }, data: { status: 'SKIPPED', lastAttemptAt: new Date(), attempts: { increment: 1 } } });
      return { skipped: true, deliveryId: ledger?.id };
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: this.timeoutMs,
      greetingTimeout: this.timeoutMs,
      socketTimeout: this.timeoutMs,
      tls: {
        rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
      },
    });

    let lastError: unknown;
    let accepted: { messageId: string } | null = null;
    let attemptsMade = 0;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      attemptsMade = attempt;
      try {
        const info = await transporter.sendMail({
          from: config.from,
          to: Array.isArray(opts.to) ? opts.to.join(',') : opts.to,
          cc: opts.cc ? (Array.isArray(opts.cc) ? opts.cc.join(',') : opts.cc) : undefined,
          subject: opts.subject,
          html: opts.html,
          text: opts.text ?? toPlainText(opts.html),
          ...(opts.attachments?.length
            ? {
                attachments: opts.attachments.map((a) => ({
                  filename: a.filename,
                  content: a.content,
                  ...(a.contentType ? { contentType: a.contentType } : {}),
                  ...(a.cid ? { cid: a.cid } : {}),
                })),
              }
            : {}),
        });
        accepted = { messageId: info.messageId };
        break;
      } catch (error) {
        lastError = error;
        if (!this.isTransient(error) || attempt === this.maxAttempts) break;
        await this.delay(this.retryBaseMs * 2 ** (attempt - 1));
      }
    }

    if (accepted) {
      this.logger.log(`Email sent to ${opts.to}: ${accepted.messageId}`);
      // Persistence is deliberately outside the SMTP retry block. Once the
      // provider accepts the message, a ledger failure must not send it again.
      if (ledger) await this.prisma.emailDelivery.update({ where: { id: ledger.id }, data: { status: 'SENT', attempts: { increment: attemptsMade }, providerMessageId: accepted.messageId, sentAt: new Date(), deliveredAt: new Date(), lastAttemptAt: new Date(), lastError: null } });
      return { messageId: accepted.messageId, deliveryId: ledger?.id };
    }

    const error = lastError instanceof Error ? lastError : new Error('Email delivery failed');
    this.logger.error(`Failed to send email to ${opts.to}: ${error.message}`);
    if (ledger) await this.prisma.emailDelivery.update({ where: { id: ledger.id }, data: { status: 'FAILED', attempts: { increment: attemptsMade }, lastAttemptAt: new Date(), lastError: error.message.replace(/\b((?:pass(?:word)?|token|secret|auth(?:orization)?|username|user)[A-Za-z0-9_-]*)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]').slice(0, 1000) } });
    if (ledger) Object.assign(error, { deliveryId: ledger.id });
    throw error;
  }

  private envNumber(name: string, fallback: number, minimum: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= minimum ? value : fallback;
  }

  private isTransient(error: unknown) {
    const candidate = error as NodeJS.ErrnoException & { responseCode?: number };
    return ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT', 'ESOCKET'].includes(
      candidate?.code ?? '',
    ) || (candidate?.responseCode !== undefined && candidate.responseCode >= 400
      && candidate.responseCode < 500);
  }

  private async delay(ms: number) {
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Templates ─────────────────────────────────────────────────────────────
  //
  // Every template below renders through `renderEmail` in email-design-system.ts.
  // They decide WHAT to say and how urgent it is; the design system decides how
  // it looks. Business strings are passed as data and escaped there — no template
  // interpolates a tenant name into raw markup any more.

  /**
   * CONTRACT EXPIRY.
   *
   * Severity mirrors the thresholds this platform already uses (the amber/red
   * split in the previous template, driven by the `[180, 90, 60, 30]` schedule in
   * contract-expiry.scheduler.ts). Nothing about when an email is sent, or to
   * whom, is decided here.
   *
   * `mallName` and `managerName` are optional: the scheduler supplies them when
   * the contract has them, and the row simply disappears when it does not.
   * Nothing is filled in with a placeholder.
   */
  contractExpiryHtml(data: {
    tenantName: string;
    unitCode: string;
    contractNumber: string;
    endDate: string;
    daysLeft: number;
    contactName: string;
    contractId: string;
    mallName?: string | null;
    managerName?: string | null;
  }): string {
    // A contract already past its end date must never be described as having
    // days left. The scheduler only targets future dates, so this is a guard on
    // the template's own contract rather than a change to when mail is sent.
    const expired = data.daysLeft <= 0;
    const severity: EmailSeverity = expired || data.daysLeft <= 30
      ? 'CRITICAL'
      : data.daysLeft <= 60
        ? 'WARNING'
        : 'INFO';

    return renderEmail({
      severity,
      preheader: `${data.contractNumber} · ${data.tenantName} · hết hạn ${data.endDate}`,
      eyebrow: 'Hợp đồng',
      title: expired ? 'Hợp đồng đã hết hạn' : 'Hợp đồng sắp hết hạn',
      badgeLabel: expired ? 'ĐÃ HẾT HẠN' : undefined,
      description: `Kính gửi ${esc(data.contactName)}, hợp đồng <strong>${esc(data.contractNumber)}</strong> của ${esc(data.tenantName)} ${expired ? 'đã hết hạn' : 'sẽ hết hạn'} ngày ${esc(data.endDate)}.`,
      hero: expired
        ? { value: 'Đã hết hạn', unit: `Ngày hết hạn ${data.endDate}` }
        : { value: String(data.daysLeft), unit: 'ngày còn lại' },
      info: {
        title: 'Thông tin hợp đồng',
        rows: [
          { label: 'Khách thuê', value: data.tenantName },
          { label: 'Mã lô', value: data.unitCode },
          { label: 'Số hợp đồng', value: data.contractNumber },
          { label: 'Ngày hết hạn', value: data.endDate, emphasis: true },
          { label: 'Trung tâm', value: data.mallName },
          { label: 'Phụ trách', value: data.managerName },
        ],
      },
      cta: { label: 'Xem hợp đồng', url: appUrl(`/contracts?id=${encodeURIComponent(data.contractId)}`) },
      note: 'Vui lòng kiểm tra và thực hiện quy trình gia hạn hoặc xác nhận không gia hạn theo quy trình hiện hành.',
    });
  }

  /** APPROVAL — a proposal waiting on this recipient's decision. */
  /**
   * CR-PROPOSAL-DOCUMENT-FINALIZATION — a Tờ trình waiting on this approver.
   *
   * Carries what the approver needs to decide without guessing: which document
   * version, the commercial summary as submitted, and every decision already
   * taken on it. Only recorded decisions are listed; a pending step is never
   * shown as signed. The official PDF of that version is attached by the caller.
   */
  proposalApprovalRequestHtml(data: {
    approverName: string;
    stepName: string;
    proposalId: string;
    proposalNumber: string;
    documentVersionNumber: number | null;
    mallName: string | null;
    tenantName: string | null;
    unitCode: string | null;
    area: number | null;
    termMonths: number | null;
    rentPerSqm: number | null;
    currencyCode: CurrencyCode | null;
    preparedBy: string | null;
    submittedAt: string | null;
    previousDecisions: Array<{ stepName: string; approverName: string | null; decision: 'APPROVED' | 'REJECTED'; decidedAt: string | null; comment: string | null }>;
    attachmentFilename: string | null;
  }): string {
    const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '');
    const history = data.previousDecisions.length
      ? `<p style="margin:0 0 6px 0;font-weight:600;">Lịch sử phê duyệt</p>
<table role="presentation" width="100%" cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font-size:13px;">
<tr><th align="left" style="border-bottom:1px solid #E5E7EB;">Bước</th><th align="left" style="border-bottom:1px solid #E5E7EB;">Người duyệt</th><th align="left" style="border-bottom:1px solid #E5E7EB;">Quyết định</th><th align="left" style="border-bottom:1px solid #E5E7EB;">Thời điểm</th><th align="left" style="border-bottom:1px solid #E5E7EB;">Ý kiến</th></tr>
${data.previousDecisions.map((d) => `<tr><td style="border-bottom:1px solid #F1F2F4;">${esc(d.stepName)}</td><td style="border-bottom:1px solid #F1F2F4;">${esc(d.approverName ?? '—')}</td><td style="border-bottom:1px solid #F1F2F4;">${d.decision === 'APPROVED' ? 'Đã duyệt' : 'Từ chối'}</td><td style="border-bottom:1px solid #F1F2F4;">${esc(when(d.decidedAt))}</td><td style="border-bottom:1px solid #F1F2F4;">${esc(d.comment ?? '')}</td></tr>`).join('\n')}
</table>`
      : '<p style="margin:0;">Đây là bước phê duyệt đầu tiên; chưa có quyết định nào trước đó.</p>';
    const attachment = data.attachmentFilename
      ? `<p style="margin:12px 0 0 0;">Đính kèm: <strong>${esc(data.attachmentFilename)}</strong> — tờ trình chính thức của phiên bản đang chờ duyệt.</p>`
      : '<p style="margin:12px 0 0 0;">Proposal này được trình trước khi có phiên bản tờ trình nên không có tệp đính kèm.</p>';
    return renderEmail({
      severity: 'INFO',
      preheader: `${data.proposalNumber}${data.documentVersionNumber ? ` · phiên bản ${data.documentVersionNumber}` : ''} · ${data.tenantName ?? ''}`,
      eyebrow: 'Phê duyệt Tờ trình',
      title: 'Tờ trình chờ phê duyệt',
      badgeLabel: 'CHỜ DUYỆT',
      description: `Kính gửi ${esc(data.approverName)}, tờ trình <strong>${esc(data.proposalNumber)}</strong> đang chờ bạn phê duyệt ở bước <strong>${esc(data.stepName)}</strong>.`,
      info: {
        title: 'Thông tin tờ trình',
        rows: [
          { label: 'Số đề xuất', value: data.proposalNumber },
          { label: 'Phiên bản tờ trình', value: data.documentVersionNumber ? String(data.documentVersionNumber) : null },
          { label: 'Mall', value: data.mallName },
          { label: 'Khách thuê', value: data.tenantName },
          { label: 'Mặt bằng', value: data.unitCode },
          { label: 'Diện tích', value: data.area != null ? `${data.area.toLocaleString('vi-VN')} m²` : null },
          { label: 'Thời hạn thuê', value: data.termMonths != null ? `${data.termMonths} tháng` : null },
          { label: 'Giá thuê/m²/tháng', value: data.rentPerSqm != null ? money(data.rentPerSqm, data.currencyCode) : null, emphasis: true },
          { label: 'Người lập', value: data.preparedBy },
          { label: 'Ngày trình', value: data.submittedAt ? when(data.submittedAt) : null },
        ],
      },
      cta: { label: 'Mở tờ trình để phê duyệt', url: appUrl(`/approvals?proposalId=${encodeURIComponent(data.proposalId)}`) },
      note: history + attachment,
    });
  }

  /**
   * CR-PROPOSAL-DOCUMENT-FINALIZATION — an approved Tờ trình sent outside the
   * company. The sender's message is user text and is escaped; no internal
   * notes or approval comments appear here.
   */
  proposalExternalSendHtml(data: {
    proposalNumber: string;
    documentVersionNumber: number;
    mallName: string | null;
    unitCode: string | null;
    message: string | null;
    senderName: string | null;
    attachmentFilename: string;
  }): string {
    const message = data.message?.trim()
      ? `<p style="margin:0 0 12px 0;white-space:pre-line;">${esc(data.message.trim())}</p>`
      : '';
    return renderEmail({
      severity: 'INFO',
      preheader: `${data.proposalNumber} · ${data.mallName ?? ''}`,
      eyebrow: 'Tờ trình',
      title: 'Tờ trình đề xuất thuê mặt bằng',
      description: `Tờ trình <strong>${esc(data.proposalNumber)}</strong> được gửi kèm email này.`,
      info: {
        title: 'Thông tin',
        rows: [
          { label: 'Số đề xuất', value: data.proposalNumber },
          { label: 'Phiên bản', value: String(data.documentVersionNumber) },
          { label: 'Trung tâm thương mại', value: data.mallName },
          { label: 'Mặt bằng', value: data.unitCode },
          { label: 'Người gửi', value: data.senderName },
        ],
      },
      note: `${message}<p style="margin:0;">Đính kèm: <strong>${esc(data.attachmentFilename)}</strong></p>`,
    });
  }

  proposalApprovalHtml(data: {
    approverName: string;
    proposalNumber: string;
    proposalId: string;
    tenantName: string;
    unitCode: string;
    rentPerSqm: number;
    monthlyRent: number;
    discount: number;
    submittedBy: string;
    /**
     * Required, and may be explicitly null. Never defaulted — see `money()`.
     */
    currencyCode: CurrencyCode | null;
  }): string {
    return renderEmail({
      severity: 'INFO',
      preheader: `${data.proposalNumber} · ${data.tenantName} · ${data.unitCode}`,
      eyebrow: 'Phê duyệt',
      title: 'Đề xuất chờ phê duyệt',
      badgeLabel: 'CHỜ DUYỆT',
      description: `Kính gửi ${esc(data.approverName)}, đề xuất <strong>${esc(data.proposalNumber)}</strong> đang chờ phê duyệt của bạn.`,
      info: {
        title: 'Thông tin đề xuất',
        rows: [
          { label: 'Số đề xuất', value: data.proposalNumber },
          { label: 'Khách thuê', value: data.tenantName },
          { label: 'Mã lô', value: data.unitCode },
          { label: 'Giá thuê/m²', value: money(data.rentPerSqm, data.currencyCode) },
          { label: 'Tiền thuê/tháng', value: money(data.monthlyRent, data.currencyCode), emphasis: true },
          // Omitted entirely when there is no discount, rather than shown as 0%.
          { label: 'Chiết khấu', value: data.discount > 0 ? `${data.discount}%` : null },
          { label: 'Người lập', value: data.submittedBy },
        ],
      },
      cta: { label: 'Xem đề xuất', url: appUrl(`/proposals?id=${encodeURIComponent(data.proposalId)}`) },
      note: 'Vui lòng đăng nhập hệ thống để xem chi tiết và thực hiện phê duyệt.',
    });
  }

  /**
   * CR-BOOK-PRICE-APPROVAL-001 — a booking price waiting on this recipient.
   *
   * Until now nothing in the booking module sent anything at all: a price could
   * sit PENDING indefinitely and the only way to find out was to open the
   * approvals queue and look. The band the price is measured against is
   * included, because "12% below" means nothing without the floor it is below.
   */
  bookingPriceApprovalHtml(data: {
    approverName: string;
    stepName: string;
    bookingNumber: string;
    bookingId: string;
    partyName: string;
    unitCode: string;
    mallName: string;
    proposedRentPerSqm: number;
    deviationPercent: number;
    proposedBy: string;
    currencyCode: CurrencyCode | null;
    snapshot: Record<string, unknown> | null;
  }): string {
    const min = typeof data.snapshot?.minRentPerSqm === 'number' ? data.snapshot.minRentPerSqm : null;
    const max = typeof data.snapshot?.maxRentPerSqm === 'number' ? data.snapshot.maxRentPerSqm : null;

    return renderEmail({
      // A deviation past 10% is the band the policy escalates to CEO; flag it
      // visually rather than making every price approval look the same.
      severity: data.deviationPercent > 10 ? 'CRITICAL' : 'WARNING',
      preheader: `${data.bookingNumber} · ${data.partyName} · ${data.unitCode} · lệch ${data.deviationPercent.toFixed(1)}%`,
      eyebrow: 'Duyệt giá',
      title: 'Giá đề xuất chờ phê duyệt',
      badgeLabel: 'CHỜ DUYỆT GIÁ',
      description: `Kính gửi ${esc(data.approverName)}, booking <strong>${esc(data.bookingNumber)}</strong> có mức giá nằm ngoài khung giá ngành hàng và đang chờ bước <strong>${esc(data.stepName)}</strong> của bạn.`,
      hero: {
        value: money(data.proposedRentPerSqm, data.currencyCode),
        unit: `giá đề xuất/m²/tháng · lệch ${data.deviationPercent.toFixed(1)}% so với khung`,
      },
      info: {
        title: 'Thông tin booking',
        rows: [
          { label: 'Mã booking', value: data.bookingNumber },
          { label: 'Khách thuê', value: data.partyName },
          { label: 'Mặt bằng', value: data.unitCode },
          { label: 'Trung tâm', value: data.mallName },
          { label: 'Giá sàn (khung ngành hàng)', value: min !== null ? money(min, data.currencyCode) : null },
          { label: 'Giá trần (khung ngành hàng)', value: max !== null ? money(max, data.currencyCode) : null },
          { label: 'Giá đề xuất', value: money(data.proposedRentPerSqm, data.currencyCode), emphasis: true },
          { label: 'Người đề xuất', value: data.proposedBy },
          { label: 'Bước duyệt', value: data.stepName },
        ],
      },
      cta: { label: 'Xem & phê duyệt', url: appUrl(`/approvals?tab=price&booking=${encodeURIComponent(data.bookingId)}`) },
      note: 'Người đề xuất mức giá không thể tự phê duyệt. Nếu bạn là người đề xuất, vui lòng chuyển cho người duyệt khác.',
    });
  }

  /** FINANCE — an overdue invoice. */
  invoiceOverdueHtml(data: {
    tenantName: string;
    invoiceNumber: string;
    invoiceId: string;
    totalAmount: number;
    dueDate: string;
    daysOverdue: number;
    currencyCode: CurrencyCode | null;
  }): string {
    return renderEmail({
      severity: 'CRITICAL',
      preheader: `${data.invoiceNumber} · quá hạn ${data.daysOverdue} ngày · hạn ${data.dueDate}`,
      eyebrow: 'Hóa đơn',
      title: 'Hóa đơn quá hạn thanh toán',
      badgeLabel: 'QUÁ HẠN',
      description: `Kính gửi ${esc(data.tenantName)}, hóa đơn <strong>${esc(data.invoiceNumber)}</strong> đã quá hạn thanh toán ${data.daysOverdue} ngày.`,
      hero: { value: money(data.totalAmount, data.currencyCode), unit: 'số tiền còn phải trả' },
      info: {
        title: 'Thông tin hóa đơn',
        rows: [
          { label: 'Số hóa đơn', value: data.invoiceNumber },
          { label: 'Hạn thanh toán', value: data.dueDate, emphasis: true },
          { label: 'Số ngày quá hạn', value: `${data.daysOverdue} ngày`, emphasis: true },
        ],
      },
      cta: { label: 'Xem hóa đơn', url: appUrl(`/billing?invoiceId=${encodeURIComponent(data.invoiceId)}`) },
      note: 'Vui lòng thanh toán hoặc liên hệ bộ phận Tài chính nếu đã thanh toán.',
    });
  }

  /** FINANCE — a newly issued invoice. */
  invoiceIssuedHtml(data: {
    tenantName: string;
    invoiceNumber: string;
    invoiceId: string;
    totalAmount: number;
    dueDate: string;
    period: string;
    currencyCode: CurrencyCode | null;
  }): string {
    return renderEmail({
      severity: 'INFO',
      preheader: `${data.invoiceNumber} · kỳ ${data.period} · hạn ${data.dueDate}`,
      eyebrow: 'Hóa đơn',
      title: 'Hóa đơn mới đã phát hành',
      badgeLabel: 'ĐÃ PHÁT HÀNH',
      description: `Kính gửi ${esc(data.tenantName)}, hóa đơn kỳ <strong>${esc(data.period)}</strong> đã được phát hành.`,
      hero: { value: money(data.totalAmount, data.currencyCode), unit: 'tổng phải thanh toán' },
      info: {
        title: 'Thông tin hóa đơn',
        rows: [
          { label: 'Số hóa đơn', value: data.invoiceNumber },
          { label: 'Kỳ', value: data.period },
          { label: 'Hạn thanh toán', value: data.dueDate, emphasis: true },
        ],
      },
      cta: { label: 'Xem hóa đơn', url: appUrl(`/billing?invoiceId=${encodeURIComponent(data.invoiceId)}`) },
    });
  }

  /** DEADLINE — a fitout stage past its SLA target. */
  fitoutSlaHtml(data: {
    managerName: string;
    tenantName: string;
    unitCode: string;
    stageName: string;
    targetDate: string;
    isEscalation: boolean;
    projectId: string;
  }): string {
    return renderEmail({
      severity: data.isEscalation ? 'CRITICAL' : 'WARNING',
      preheader: `${data.tenantName} · ${data.unitCode} · ${data.stageName} · hạn ${data.targetDate}`,
      eyebrow: 'Fitout',
      title: data.isEscalation ? 'Fitout vượt SLA — đã leo thang' : 'Fitout trễ hạn SLA',
      badgeLabel: data.isEscalation ? 'LEO THANG' : 'TRỄ SLA',
      description: `Kính gửi ${esc(data.managerName)}, dự án fitout của <strong>${esc(data.tenantName)}</strong> tại lô ${esc(data.unitCode)} đã trễ hạn SLA.`,
      info: {
        title: 'Thông tin dự án',
        rows: [
          { label: 'Khách thuê', value: data.tenantName },
          { label: 'Mã lô', value: data.unitCode },
          { label: 'Giai đoạn', value: data.stageName },
          { label: 'Hạn mục tiêu', value: data.targetDate, emphasis: true },
        ],
      },
      cta: { label: 'Xem dự án fitout', url: appUrl(`/fitout?projectId=${encodeURIComponent(data.projectId)}`) },
      note: 'Vui lòng đăng nhập hệ thống để cập nhật tiến độ hoặc xử lý nguyên nhân chậm trễ.',
    });
  }

  /** OPERATIONS — a ticket that has breached its SLA and escalated. */
  ticketSlaHtml(data: {
    managerName: string;
    ticketNumber: string;
    ticketId: string;
    subject: string;
    tenantName: string;
    level: number;
  }): string {
    return renderEmail({
      severity: 'WARNING',
      preheader: `${data.ticketNumber} · ${data.tenantName} · escalation L${data.level}`,
      eyebrow: 'Ticket vận hành',
      title: 'Ticket vượt SLA',
      badgeLabel: `ESCALATION L${data.level}`,
      description: `Kính gửi ${esc(data.managerName)}, ticket <strong>${esc(data.ticketNumber)}</strong> đã vượt SLA và cần được xử lý.`,
      info: {
        title: 'Thông tin ticket',
        rows: [
          { label: 'Mã ticket', value: data.ticketNumber },
          { label: 'Tiêu đề', value: data.subject },
          { label: 'Khách thuê', value: data.tenantName },
          { label: 'Mức escalation', value: `L${data.level}`, emphasis: true },
        ],
      },
      cta: { label: 'Xem ticket', url: appUrl(`/tickets?id=${encodeURIComponent(data.ticketId)}`) },
    });
  }

  /**
   * OPERATIONS — an inspection recorded against a tenant's own unit.
   *
   * Tenant-facing, so the CTA lands on the Tenant Portal. There is no
   * per-record deep link there (TenantPortalPage reads no URL parameter), so the
   * link is the portal itself rather than a fabricated record URL.
   */
  ticketInspectionHtml(data: {
    tenantName: string;
    ticketNumber: string;
    subject: string;
    unitCode: string;
  }): string {
    return renderEmail({
      severity: 'INFO',
      preheader: `${data.ticketNumber} · ${data.unitCode} · ${data.subject}`,
      eyebrow: 'Kiểm tra hiện trường',
      title: 'Phiếu kiểm tra hiện trường mới',
      badgeLabel: 'MỚI',
      description: `Kính gửi ${esc(data.tenantName)}, nhân viên vận hành vừa ghi nhận một phiếu kiểm tra tại mặt bằng của Quý khách.`,
      info: {
        title: 'Thông tin phiếu',
        rows: [
          { label: 'Mã phiếu', value: data.ticketNumber },
          { label: 'Tiêu đề', value: data.subject },
          { label: 'Mặt bằng', value: data.unitCode },
        ],
      },
      cta: { label: 'Mở Tenant Portal', url: appUrl('/tenant-portal') },
      note: 'Vui lòng đăng nhập Tenant Portal để xem chi tiết, hình ảnh và gửi phản hồi.',
    });
  }

  /**
   * SYSTEM — Tenant Portal account activation / password reset.
   *
   * Replaces two near-identical single-line HTML strings that lived inline in
   * tenants.service.ts and proposals.service.ts.
   */
  portalInvitationHtml(data: {
    contactName: string;
    portalUrl: string;
    isReset: boolean;
  }): string {
    return renderEmail({
      severity: 'INFO',
      preheader: data.isReset
        ? 'Liên kết đặt lại mật khẩu có hiệu lực trong 72 giờ'
        : 'Liên kết kích hoạt có hiệu lực trong 72 giờ',
      eyebrow: 'Tenant Portal',
      title: data.isReset ? 'Đặt lại mật khẩu Tenant Portal' : 'Kích hoạt tài khoản Tenant Portal',
      description: data.isReset
        ? `Xin chào ${esc(data.contactName)}, quản trị viên đã yêu cầu đặt lại mật khẩu tài khoản của Quý khách.`
        : `Xin chào ${esc(data.contactName)}, tài khoản Tenant Portal của Quý khách đã được tạo.`,
      cta: {
        label: data.isReset ? 'Đặt mật khẩu mới' : 'Kích hoạt tài khoản',
        url: data.portalUrl,
      },
      note: 'Liên kết có hiệu lực trong <strong>72 giờ</strong>. Nếu Quý khách không thực hiện yêu cầu này, vui lòng bỏ qua email.',
    });
  }

  /**
   * APPROVAL — a fitout submittal waiting on this recipient.
   *
   * The CTA lands on the fitout approvals list: no per-submittal deep link
   * exists in the frontend, exactly as NotificationCenter's own route map
   * records for FITOUT_SUBMITTAL.
   */
  fitoutSubmittalApprovalHtml(data: {
    approverName: string;
    submittalTitle: string;
    formTypeName: string;
    tenantName: string;
    unitCode: string;
  }): string {
    return renderEmail({
      severity: 'INFO',
      preheader: `${data.formTypeName} · ${data.tenantName} · ${data.unitCode}`,
      eyebrow: 'Fitout',
      title: 'Hồ sơ fitout chờ phê duyệt',
      badgeLabel: 'CHỜ DUYỆT',
      description: `Kính gửi ${esc(data.approverName)}, hồ sơ <strong>${esc(data.submittalTitle)}</strong> đang chờ bạn phê duyệt.`,
      info: {
        title: 'Thông tin hồ sơ',
        rows: [
          { label: 'Loại hồ sơ', value: data.formTypeName },
          { label: 'Tiêu đề', value: data.submittalTitle },
          { label: 'Khách thuê', value: data.tenantName },
          { label: 'Mã lô', value: data.unitCode },
        ],
      },
      cta: { label: 'Xem hồ sơ chờ duyệt', url: appUrl('/fitout-approvals') },
    });
  }

  /** SYSTEM — the SMTP configuration test send. */
  smtpTestHtml(data: { sentAt: string }): string {
    return renderEmail({
      severity: 'SUCCESS',
      preheader: 'Cấu hình SMTP hoạt động bình thường',
      eyebrow: 'Hệ thống',
      title: 'Email thử nghiệm cấu hình SMTP',
      badgeLabel: 'THÀNH CÔNG',
      description: 'Nếu Quý vị nhận được email này, cấu hình SMTP của THISO Leasing Platform đang hoạt động bình thường.',
      info: { rows: [{ label: 'Thời điểm gửi', value: data.sentAt }] },
    });
  }
}
