import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private enabled = false;
  private readonly maxAttempts = this.envNumber('EMAIL_MAX_ATTEMPTS', 3, 1);
  private readonly retryBaseMs = this.envNumber('EMAIL_RETRY_BASE_MS', 250, 0);
  private readonly timeoutMs = this.envNumber('EMAIL_TIMEOUT_MS', 15_000, 100);

  constructor() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass },
        connectionTimeout: this.timeoutMs,
        greetingTimeout: this.timeoutMs,
        socketTimeout: this.timeoutMs,
        tls: {
          rejectUnauthorized:
            process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
        },
      });
      this.enabled = true;
      this.logger.log(`Email service enabled (${host}:${process.env.SMTP_PORT ?? 587})`);
    } else {
      this.logger.warn('Email service disabled: SMTP_HOST/SMTP_USER/SMTP_PASS not configured');
    }
  }

  async sendMail(opts: { to: string | string[]; subject: string; html: string; cc?: string | string[] }) {
    if (!this.enabled || !this.transporter) {
      this.logger.warn(`[EMAIL DISABLED] Would send to ${Array.isArray(opts.to) ? opts.to.join(',') : opts.to}: ${opts.subject}`);
      return { skipped: true };
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const info = await this.transporter.sendMail({
          from: process.env.EMAIL_FROM ?? 'THISO Leasing <noreply@thiso.com.vn>',
          to: Array.isArray(opts.to) ? opts.to.join(',') : opts.to,
          cc: opts.cc ? (Array.isArray(opts.cc) ? opts.cc.join(',') : opts.cc) : undefined,
          subject: opts.subject,
          html: opts.html,
        });
        this.logger.log(`Email sent to ${opts.to}: ${info.messageId}`);
        return { messageId: info.messageId };
      } catch (error) {
        lastError = error;
        if (!this.isTransient(error) || attempt === this.maxAttempts) break;
        await this.delay(this.retryBaseMs * 2 ** (attempt - 1));
      }
    }

    const error = lastError instanceof Error ? lastError : new Error('Email delivery failed');
    this.logger.error(`Failed to send email to ${opts.to}: ${error.message}`);
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

  contractExpiryHtml(data: {
    tenantName: string;
    unitCode: string;
    contractNumber: string;
    endDate: string;
    daysLeft: number;
    contactName: string;
  }): string {
    const urgencyColor = data.daysLeft <= 30 ? '#dc2626' : data.daysLeft <= 60 ? '#d97706' : '#2563eb';
    const urgencyLabel = data.daysLeft <= 30 ? 'KHẨN CẤP' : data.daysLeft <= 60 ? 'CẦN XỬ LÝ' : 'THÔNG BÁO';

    return `
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: #1e293b; color: white; padding: 24px 32px; }
  .header h1 { margin: 0; font-size: 20px; }
  .header p { margin: 4px 0 0; opacity: 0.7; font-size: 13px; }
  .badge { display: inline-block; background: ${urgencyColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-top: 12px; }
  .content { padding: 32px; }
  .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  .info-row:last-child { border-bottom: none; }
  .label { color: #6b7280; }
  .value { font-weight: 600; color: #111827; }
  .days-left { font-size: 36px; font-weight: bold; color: ${urgencyColor}; text-align: center; margin: 20px 0 8px; }
  .days-label { text-align: center; color: #6b7280; font-size: 14px; margin-bottom: 20px; }
  .cta { display: block; text-align: center; background: ${urgencyColor}; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 24px 0; }
  .footer { background: #f9fafb; padding: 16px 32px; font-size: 12px; color: #9ca3af; text-align: center; }
</style>
</head><body>
<div class="container">
  <div class="header">
    <h1>THISO Leasing Platform</h1>
    <p>Hệ thống quản lý cho thuê mặt bằng</p>
    <span class="badge">${urgencyLabel}</span>
  </div>
  <div class="content">
    <p>Kính gửi <strong>${data.contactName}</strong>,</p>
    <p>Hệ thống THISO Leasing thông báo hợp đồng sau sắp hết hạn:</p>

    <div class="days-left">${data.daysLeft}</div>
    <div class="days-label">ngày còn lại</div>

    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">
      <div class="info-row"><span class="label">Khách thuê</span><span class="value">${data.tenantName}</span></div>
      <div class="info-row"><span class="label">Mã lô</span><span class="value">${data.unitCode}</span></div>
      <div class="info-row"><span class="label">Số hợp đồng</span><span class="value">${data.contractNumber}</span></div>
      <div class="info-row"><span class="label">Ngày hết hạn</span><span class="value" style="color:${urgencyColor}">${data.endDate}</span></div>
    </div>

    <p style="color:#374151;font-size:14px;">Vui lòng liên hệ bộ phận Leasing để thực hiện gia hạn hoặc xác nhận không gia hạn hợp đồng.</p>
  </div>
  <div class="footer">Email tự động từ THISO Leasing Platform | Ngày gửi: ${new Date().toLocaleDateString('vi-VN')}</div>
</div>
</body></html>`;
  }

  proposalApprovalHtml(data: {
    approverName: string;
    proposalNumber: string;
    tenantName: string;
    unitCode: string;
    rentPerSqm: number;
    monthlyRent: number;
    discount: number;
    submittedBy: string;
  }): string {
    return `
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: #1e40af; color: white; padding: 24px 32px; }
  .header h1 { margin: 0; font-size: 20px; }
  .content { padding: 32px; }
  .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  .info-row:last-child { border-bottom: none; }
  .label { color: #6b7280; }
  .value { font-weight: 600; color: #111827; }
  .cta { display: block; text-align: center; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 24px 0; }
  .footer { background: #f9fafb; padding: 16px 32px; font-size: 12px; color: #9ca3af; text-align: center; }
</style>
</head><body>
<div class="container">
  <div class="header">
    <h1>Yêu cầu phê duyệt Proposal</h1>
    <p>THISO Leasing Platform</p>
  </div>
  <div class="content">
    <p>Kính gửi <strong>${data.approverName}</strong>,</p>
    <p>Một Proposal mới đang chờ phê duyệt của bạn:</p>

    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">
      <div class="info-row"><span class="label">Số Proposal</span><span class="value">${data.proposalNumber}</span></div>
      <div class="info-row"><span class="label">Khách thuê</span><span class="value">${data.tenantName}</span></div>
      <div class="info-row"><span class="label">Mã lô</span><span class="value">${data.unitCode}</span></div>
      <div class="info-row"><span class="label">Giá thuê/m²</span><span class="value">${data.rentPerSqm.toLocaleString('vi-VN')} VNĐ</span></div>
      <div class="info-row"><span class="label">Tiền thuê/tháng</span><span class="value">${data.monthlyRent.toLocaleString('vi-VN')} VNĐ</span></div>
      ${data.discount > 0 ? `<div class="info-row"><span class="label">Chiết khấu</span><span class="value" style="color:#dc2626">${data.discount}%</span></div>` : ''}
      <div class="info-row"><span class="label">Người lập</span><span class="value">${data.submittedBy}</span></div>
    </div>

    <p style="color:#374151;font-size:14px;">Vui lòng đăng nhập hệ thống để xem chi tiết và thực hiện phê duyệt.</p>
  </div>
  <div class="footer">Email tự động từ THISO Leasing Platform | ${new Date().toLocaleDateString('vi-VN')}</div>
</div>
</body></html>`;
  }

  invoiceOverdueHtml(data: {
    tenantName: string;
    invoiceNumber: string;
    totalAmount: number;
    dueDate: string;
    daysOverdue: number;
    contactEmail: string;
  }): string {
    return `
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
  .header { background: #dc2626; color: white; padding: 24px 32px; }
  .content { padding: 32px; font-size: 14px; color: #374151; }
  .amount { font-size: 32px; font-weight: bold; color: #dc2626; text-align: center; margin: 20px 0; }
  .footer { background: #f9fafb; padding: 16px; font-size: 12px; color: #9ca3af; text-align: center; }
</style></head><body>
<div class="container">
  <div class="header"><h1 style="margin:0">Hóa đơn quá hạn</h1></div>
  <div class="content">
    <p>Kính gửi <strong>${data.tenantName}</strong>,</p>
    <p>Hóa đơn đã quá hạn <strong>${data.daysOverdue} ngày</strong>:</p>
    <div class="amount">${data.totalAmount.toLocaleString('vi-VN')} VNĐ</div>
    <p>Số HĐ: ${data.invoiceNumber} · Hạn TT: ${data.dueDate}</p>
    <p>Liên hệ Finance: <a href="mailto:${data.contactEmail}">${data.contactEmail}</a></p>
  </div>
  <div class="footer">THISO Leasing Platform</div>
</div></body></html>`;
  }

  fitoutSlaHtml(data: {
    managerName: string;
    tenantName: string;
    unitCode: string;
    stageName: string;
    targetDate: string;
    isEscalation: boolean;
  }): string {
    const color = data.isEscalation ? '#dc2626' : '#ea580c';
    return `
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
  .header { background: ${color}; color: white; padding: 24px 32px; }
  .content { padding: 32px; font-size: 14px; color: #374151; }
  .footer { background: #f9fafb; padding: 16px; font-size: 12px; color: #9ca3af; text-align: center; }
</style></head><body>
<div class="container">
  <div class="header"><h1 style="margin:0">${data.isEscalation ? '🚨 Fitout Escalation' : '⚠️ Fitout SLA Breach'}</h1></div>
  <div class="content">
    <p>Kính gửi <strong>${data.managerName}</strong>,</p>
    <p>Dự án fitout của <strong>${data.tenantName}</strong> (lô <strong>${data.unitCode}</strong>) đã trễ SLA:</p>
    <ul>
      <li><strong>Giai đoạn:</strong> ${data.stageName}</li>
      <li><strong>Hạn mục tiêu:</strong> ${data.targetDate}</li>
    </ul>
    <p>Vui lòng đăng nhập hệ thống để xử lý.</p>
  </div>
  <div class="footer">THISO Leasing Platform</div>
</div></body></html>`;
  }

  ticketSlaHtml(data: {
    managerName: string;
    ticketNumber: string;
    subject: string;
    tenantName: string;
    level: number;
  }): string {
    return `
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
  .header { background: #ea580c; color: white; padding: 24px 32px; }
  .content { padding: 32px; font-size: 14px; color: #374151; }
  .footer { background: #f9fafb; padding: 16px; font-size: 12px; color: #9ca3af; text-align: center; }
</style></head><body>
<div class="container">
  <div class="header"><h1 style="margin:0">Ticket SLA — Level ${data.level}</h1></div>
  <div class="content">
    <p>Kính gửi <strong>${data.managerName}</strong>,</p>
    <p>Ticket <strong>${data.ticketNumber}</strong> đã vượt SLA và cần xử lý:</p>
    <ul>
      <li><strong>Tiêu đề:</strong> ${data.subject}</li>
      <li><strong>Khách thuê:</strong> ${data.tenantName}</li>
      <li><strong>Mức escalation:</strong> L${data.level}</li>
    </ul>
    <p>Vui lòng đăng nhập hệ thống để xử lý ticket.</p>
  </div>
  <div class="footer">THISO Leasing Platform</div>
</div></body></html>`;
  }

  ticketInspectionHtml(data: {
    tenantName: string;
    ticketNumber: string;
    subject: string;
    unitCode: string;
  }): string {
    return `
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
  .header { background: #2563eb; color: white; padding: 24px 32px; }
  .content { padding: 32px; font-size: 14px; color: #374151; }
  .footer { background: #f9fafb; padding: 16px; font-size: 12px; color: #9ca3af; text-align: center; }
</style></head><body>
<div class="container">
  <div class="header"><h1 style="margin:0">📋 Phiếu kiểm tra hiện trường mới</h1></div>
  <div class="content">
    <p>Kính gửi <strong>${data.tenantName}</strong>,</p>
    <p>Nhân viên vận hành vừa ghi nhận một phiếu kiểm tra hiện trường tại mặt bằng của quý khách:</p>
    <ul>
      <li><strong>Mã phiếu:</strong> ${data.ticketNumber}</li>
      <li><strong>Tiêu đề:</strong> ${data.subject}</li>
      <li><strong>Mặt bằng:</strong> ${data.unitCode}</li>
    </ul>
    <p>Vui lòng đăng nhập Tenant Portal để xem chi tiết, hình ảnh và phản hồi.</p>
  </div>
  <div class="footer">THISO Leasing Platform</div>
</div></body></html>`;
  }
}
