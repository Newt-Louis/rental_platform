import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

jest.mock('nodemailer');

describe('EmailService resilience', () => {
  const originalEnv = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    EMAIL_MAX_ATTEMPTS: process.env.EMAIL_MAX_ATTEMPTS,
    EMAIL_RETRY_BASE_MS: process.env.EMAIL_RETRY_BASE_MS,
  };

  // DB-backed EmailSettings vắng mặt -> EmailService fallback về env var (xem resolveConfig()).
  const prismaStub = { emailSettings: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
  const encryptionStub = { isConfigured: false, decrypt: jest.fn(), encrypt: jest.fn() } as any;

  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.EMAIL_MAX_ATTEMPTS = '3';
    process.env.EMAIL_RETRY_BASE_MS = '0';
    (nodemailer.createTransport as jest.Mock).mockReset();
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('retries transient SMTP failures and returns the delivered message id', async () => {
    const service = new EmailService(prismaStub, encryptionStub);
    const sendMail = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { code: 'ETIMEDOUT' }))
      .mockResolvedValueOnce({ messageId: 'message-1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    await expect(service.sendMail({
      to: 'tenant@example.test',
      subject: 'Invoice',
      html: '<p>Invoice</p>',
    })).resolves.toEqual({ messageId: 'message-1' });

    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent SMTP errors', async () => {
    const service = new EmailService(prismaStub, encryptionStub);
    const error = Object.assign(new Error('mailbox unavailable'), { responseCode: 550 });
    const sendMail = jest.fn().mockRejectedValue(error);
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    await expect(service.sendMail({
      to: 'missing@example.test',
      subject: 'Invoice',
      html: '<p>Invoice</p>',
    })).rejects.toThrow('mailbox unavailable');

    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('skips sending when neither DB nor env SMTP config is present', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const service = new EmailService(prismaStub, encryptionStub);

    await expect(service.sendMail({
      to: 'tenant@example.test',
      subject: 'Invoice',
      html: '<p>Invoice</p>',
    })).resolves.toEqual({ skipped: true });

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  // Regression: every money figure in these templates used to be rendered as
  // `${amount.toLocaleString('vi-VN')} VNĐ`, so a USD proposal's approval email
  // and a USD invoice's issued/overdue email all told the approver/customer the
  // amount was in VND.
  describe('template currency labelling', () => {
    const service = () => new EmailService(prismaStub, encryptionStub);

    it('labels proposal approval amounts with the proposal currency', () => {
      const html = service().proposalApprovalHtml({
        approverName: 'A', proposalNumber: 'PRO-1', tenantName: 'T', unitCode: 'L3-C01',
        rentPerSqm: 25, monthlyRent: 2500, discount: 0, submittedBy: 'S', currencyCode: 'USD',
      });
      expect(html).toContain('25,00 USD');
      expect(html).toContain('2.500,00 USD');
      expect(html).not.toContain('VNĐ');
    });

    it('defaults to VND when no currency is supplied', () => {
      const html = service().proposalApprovalHtml({
        approverName: 'A', proposalNumber: 'PRO-1', tenantName: 'T', unitCode: 'L3-C01',
        rentPerSqm: 450000, monthlyRent: 45000000, discount: 0, submittedBy: 'S',
      });
      expect(html).toContain('450.000 VND');
    });

    it('labels invoice issued/overdue amounts with the invoice currency', () => {
      const issued = service().invoiceIssuedHtml({
        tenantName: 'T', invoiceNumber: 'INV-1', totalAmount: 1200, dueDate: '01/01/2026',
        period: '2026-01', currencyCode: 'USD',
      });
      const overdue = service().invoiceOverdueHtml({
        tenantName: 'T', invoiceNumber: 'INV-1', totalAmount: 1200, dueDate: '01/01/2026',
        daysOverdue: 5, contactEmail: 'f@t.vn', currencyCode: 'USD',
      });
      expect(issued).toContain('1.200,00 USD');
      expect(overdue).toContain('1.200,00 USD');
      expect(issued).not.toContain('VNĐ');
      expect(overdue).not.toContain('VNĐ');
    });
  });
});
