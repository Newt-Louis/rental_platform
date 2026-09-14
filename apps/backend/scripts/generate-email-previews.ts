import * as fs from 'fs';
import * as path from 'path';
import { EmailService } from '../src/modules/notifications/email.service';
import { toPlainText } from '../src/modules/notifications/email-design-system';

const repoRoot = path.resolve(__dirname, '../../..');
const outputDir = path.join(repoRoot, 'artifacts', 'email-previews');

process.env.NODE_ENV = 'development';
process.env.APP_ENV = 'preview';
process.env.FRONTEND_URL = process.env.EMAIL_PREVIEW_ORIGIN || 'http://127.0.0.1:4173';

const email = new EmailService(
  { emailSettings: { findFirst: async () => null } } as any,
  { isConfigured: false } as any,
);

const injection = '<script>alert(1)</script>\"><img src=x onerror=alert(1)>';
const longTenant = 'CÔNG TY CỔ PHẦN THƯƠNG MẠI VÀ DỊCH VỤ PHÁT TRIỂN KHÔNG GIAN BÁN LẺ ĐÔNG NAM Á';

const previews = [
  {
    id: '01-contract-expiry',
    title: 'Contract expiry — long content and missing optional owner',
    html: email.contractExpiryHtml({
      tenantName: longTenant,
      unitCode: 'L1-023',
      contractNumber: 'HD-2026-0088-VERY-LONG-CONTRACT-NUMBER',
      endDate: '30/09/2026',
      daysLeft: 25,
      contactName: 'Nguyễn Minh Anh',
      contractId: 'contract-preview-1',
      mallName: 'THISO Mall Sala',
      managerName: null,
    }),
  },
  {
    id: '02-proposal-approval-usd',
    title: 'Proposal approval — USD',
    html: email.proposalApprovalHtml({
      approverName: 'Trần Hoàng Nam', proposalNumber: 'PROP-2026-0102', proposalId: 'proposal-preview-1',
      tenantName: 'Công ty TNHH ABC International', unitCode: 'L3-C01', rentPerSqm: 25,
      monthlyRent: 2500, discount: 8, submittedBy: 'Lê Thu Hà', currencyCode: 'USD',
    }),
  },
  {
    id: '03-invoice-issued-mmk',
    title: 'Invoice issued — MMK and long number',
    html: email.invoiceIssuedHtml({
      tenantName: 'Golden Myanmar Retail Co., Ltd.', invoiceNumber: 'INV-2026-09-00000000000042',
      invoiceId: 'invoice-preview-1', totalAmount: 17550000, dueDate: '15/10/2026',
      period: '09/2026', currencyCode: 'MMK',
    }),
  },
  {
    id: '04-invoice-overdue-vnd',
    title: 'Invoice overdue — VND, no invented Finance contact',
    html: email.invoiceOverdueHtml({
      tenantName: 'Công ty TNHH Bán lẻ Việt', invoiceNumber: 'INV-2026-08-0099',
      invoiceId: 'invoice-preview-2', totalAmount: 128500000, dueDate: '05/09/2026',
      daysOverdue: 12, currencyCode: 'VND',
    }),
  },
  {
    id: '05-fitout-sla',
    title: 'Fitout SLA escalation',
    html: email.fitoutSlaHtml({
      managerName: 'Phạm Thị Lan', tenantName: 'Coffee House Flagship', unitCode: 'G-001',
      stageName: 'Nghiệm thu hệ thống phòng cháy chữa cháy', targetDate: '06/09/2026',
      isEscalation: true, projectId: 'fitout-preview-1',
    }),
  },
  {
    id: '06-ticket-sla-injection',
    title: 'Ticket SLA — escaped injection fixture',
    html: email.ticketSlaHtml({
      managerName: 'Đỗ Quốc Huy', ticketNumber: 'TIC-2026-00991', ticketId: 'ticket-preview-1',
      subject: `Điều hòa không hoạt động ${injection}`, tenantName: 'Nhà hàng An Nhiên', level: 2,
    }),
  },
  {
    id: '07-tenant-portal-activation',
    title: 'Tenant Portal activation',
    html: email.portalInvitationHtml({
      contactName: 'Võ Thanh Tâm',
      portalUrl: `${process.env.FRONTEND_URL}/activate?token=non-sensitive-preview-token`,
      isReset: false,
    }),
  },
];

fs.mkdirSync(outputDir, { recursive: true });
for (const preview of previews) {
  fs.writeFileSync(path.join(outputDir, `${preview.id}.html`), preview.html, 'utf8');
  fs.writeFileSync(path.join(outputDir, `${preview.id}.txt`), toPlainText(preview.html), 'utf8');
}

const links = previews.map((preview) =>
  `<li><a href="/${preview.id}.html">${preview.title}</a></li>`,
).join('\n');
const index = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CR-119 email previews</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#171717}li{margin:12px 0}a{color:#1249BF}</style>
</head><body><h1>CR-119 email previews</h1><p>Development-only HTML. No SMTP is invoked.</p><ol>${links}</ol></body></html>`;
fs.writeFileSync(path.join(outputDir, 'index.html'), index, 'utf8');
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  smtpSent: false,
  frontendOrigin: process.env.FRONTEND_URL,
  previews: previews.map(({ id, title }) => ({ id, title })),
}, null, 2), 'utf8');

console.log(`Generated ${previews.length} HTML and plaintext previews in ${outputDir}`);
