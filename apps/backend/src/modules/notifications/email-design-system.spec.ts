import { EmailService } from './email.service';
import {
  UNKNOWN_CURRENCY_LABEL,
  appUrl,
  emailSubject,
  esc,
  formatDateVN,
  money,
  renderEmail,
  toPlainText,
} from './email-design-system';

describe('CR-119 email design system', () => {
  const originalEnv = {
    APP_ENV: process.env.APP_ENV,
    FRONTEND_URL: process.env.FRONTEND_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
  const service = new EmailService(
    { emailSettings: { findFirst: jest.fn() } } as any,
    { isConfigured: false } as any,
  );

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://leasing.example.test';
    process.env.NODE_ENV = 'test';
    delete process.env.APP_ENV;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const contract = (daysLeft = 25, overrides: Record<string, unknown> = {}) =>
    service.contractExpiryHtml({
      tenantName: 'CÔNG TY CỔ PHẦN THƯƠNG MẠI VÀ DỊCH VỤ MỘT TÊN RẤT DÀI',
      unitCode: 'L1-023',
      contractNumber: 'HD-2026-0088-LONG-CONTRACT-NUMBER',
      endDate: '30/09/2026',
      daysLeft,
      contactName: 'Nguyễn Văn An',
      contractId: 'contract-1',
      mallName: 'THISO Mall Sala',
      managerName: 'Trần Thị Bình',
      ...overrides,
    });

  it('uses the shared 640px table layout and approved absolute logo', () => {
    const html = contract();
    expect(html).toContain('role="presentation"');
    expect(html).toContain('cellpadding="0"');
    expect(html).toContain('cellspacing="0"');
    expect(html).toContain('border="0"');
    expect(html).toContain('max-width:640px');
    expect(html).toContain('src="https://leasing.example.test/logo.png"');
    expect(html).toContain('alt="THISO"');
    expect(html).not.toMatch(/display\s*:\s*(flex|grid)/i);
  });

  it('fails closed for a non-HTTPS production frontend origin', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'http://leasing.example.test';
    expect(() => appUrl('/contracts')).toThrow('must use HTTPS');
  });

  it('escapes HTML and attribute injection across business fields and CTA URLs', () => {
    const attack = '<script>alert(1)</script>\"><img src=x onerror=alert(1)>';
    const html = contract(25, { tenantName: attack, contractId: attack });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');

    const direct = renderEmail({
      severity: 'INFO', eyebrow: 'Test', title: 'Test',
      cta: { label: 'Open', url: 'https://example.test/\" onmouseover=\"alert(1)' },
    });
    expect(direct).toContain('&quot; onmouseover=&quot;alert(1)');
    expect(direct).not.toContain('href="https://example.test/" onmouseover=');
    expect(esc(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('preserves Vietnamese UTF-8 and omits missing optional rows', () => {
    const html = contract(25, { mallName: null, managerName: undefined });
    expect(html).toContain('Hợp đồng sắp hết hạn');
    expect(html).toContain('Nguyễn Văn An');
    expect(html).not.toContain('Trung tâm');
    expect(html).not.toContain('Phụ trách');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it.each([
    [180, 'THÔNG TIN'],
    [60, 'CẦN XỬ LÝ'],
    [30, 'KHẨN CẤP'],
  ])('maps %i contract days to the existing semantic severity', (days, label) => {
    expect(contract(days)).toContain(label);
  });

  it('does not describe an expired contract as having positive days remaining', () => {
    const html = contract(-2);
    expect(html).toContain('Hợp đồng đã hết hạn');
    expect(html).toContain('Đã hết hạn');
    expect(html).not.toContain('ngày còn lại');
  });

  it.each([
    ['VND', '1.234.567 VND'],
    ['USD', '1.234.567,00 USD'],
    ['MMK', '1.234.567,00 MMK'],
  ] as const)('formats explicit %s without currency inference', (currency, expected) => {
    expect(money(1234567, currency)).toBe(expected);
  });

  it('shows an explicit unknown state instead of silently defaulting to VND', () => {
    expect(money(450000, null)).toBe(`450.000 (${UNKNOWN_CURRENCY_LABEL})`);
    expect(money(450000, null)).not.toContain('VND');
  });

  it('centralizes production/UAT subjects and removes header newlines', () => {
    expect(emailSubject('Hóa đơn INV-1 đã phát hành')).toBe('[THISO Leasing] Hóa đơn INV-1 đã phát hành');
    process.env.APP_ENV = 'uat';
    expect(emailSubject('Hóa đơn\r\nBcc: injected')).toBe('[UAT][THISO Leasing] Hóa đơn Bcc: injected');
    process.env.APP_ENV = 'production';
    expect(emailSubject('Test')).toBe('[THISO Leasing] Test');
  });

  it('formats Vietnam-facing dates in Asia/Ho_Chi_Minh', () => {
    expect(formatDateVN('2026-09-30T18:00:00.000Z')).toBe('01/10/2026');
    expect(formatDateVN('not-a-date')).toBeNull();
  });

  it('generates meaningful plaintext without markup or hidden preheader', () => {
    const text = toPlainText(contract());
    expect(text).toContain('Hợp đồng sắp hết hạn');
    expect(text).toContain('HD-2026-0088-LONG-CONTRACT-NUMBER');
    expect(text).toContain('https://leasing.example.test/contracts?id=contract-1');
    expect(text).not.toContain('<table');
    expect(text).not.toContain('mso-hide');
  });

  it('uses only verified navigation routes and keeps unsupported links at list/root', () => {
    expect(contract()).toContain('https://leasing.example.test/contracts?id=contract-1');
    expect(service.proposalApprovalHtml({
      approverName: 'A', proposalNumber: 'PROP-1', proposalId: 'proposal-1',
      tenantName: 'T', unitCode: 'U', rentPerSqm: 10, monthlyRent: 100,
      discount: 0, submittedBy: 'S', currencyCode: 'USD',
    })).toContain('/proposals?id=proposal-1');
    expect(service.invoiceIssuedHtml({
      tenantName: 'T', invoiceNumber: 'INV-1', invoiceId: 'invoice-1',
      totalAmount: 100, dueDate: '30/09/2026', period: '09/2026', currencyCode: 'MMK',
    })).toContain('/billing?invoiceId=invoice-1');
    expect(service.fitoutSlaHtml({
      managerName: 'M', tenantName: 'T', unitCode: 'U', stageName: 'S',
      targetDate: '30/09/2026', isEscalation: false, projectId: 'fitout-1',
    })).toContain('/fitout?projectId=fitout-1');
    expect(service.ticketSlaHtml({
      managerName: 'M', ticketNumber: 'TIC-1', ticketId: 'ticket-1',
      subject: 'S', tenantName: 'T', level: 1,
    })).toContain('/tickets?id=ticket-1');
    expect(service.fitoutSubmittalApprovalHtml({
      approverName: 'A', submittalTitle: 'S', formTypeName: 'F', tenantName: 'T', unitCode: 'U',
    })).toContain('https://leasing.example.test/fitout-approvals');
    expect(service.ticketInspectionHtml({
      tenantName: 'T', ticketNumber: 'TIC-1', subject: 'S', unitCode: 'U',
    })).toContain('https://leasing.example.test/tenant-portal');
  });

  it('keeps activation as navigation and includes no state-changing email action', () => {
    const html = service.portalInvitationHtml({
      contactName: 'Nguyễn Văn An',
      portalUrl: 'https://leasing.example.test/activate?token=safe-token',
      isReset: false,
    });
    expect(html).toContain('/activate?token=safe-token');
    expect(html).not.toMatch(/method=["']post|\/approve|\/reject|\/pay/i);
  });

  it('omits guessed Finance contact details from overdue invoice email', () => {
    const html = service.invoiceOverdueHtml({
      tenantName: 'T', invoiceNumber: 'INV-1', invoiceId: 'invoice-1', totalAmount: 100,
      dueDate: '30/09/2026', daysOverdue: 5, currencyCode: 'VND',
    });
    expect(html).not.toContain('SMTP_USER');
    expect(html).not.toContain('finance@thiso.com.vn');
    expect(html).not.toContain('Liên hệ');
  });
});
