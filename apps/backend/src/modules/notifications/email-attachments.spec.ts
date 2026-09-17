/**
 * CR-PROPOSAL-DOCUMENT-FINALIZATION — generic email attachment support.
 */
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';
import { EmailDeliveryService } from './email-delivery.service';
import { describeAttachment, EmailAttachmentRegistry, sha256 } from './email-attachments';

jest.mock('nodemailer');

const PDF = Buffer.from('%PDF-1.3 official');

describe('EmailService attachments', () => {
  const prisma: any = {
    emailSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    emailDelivery: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  };
  const encryption: any = { isConfigured: false, decrypt: jest.fn() };
  const env = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(process.env, { SMTP_HOST: 'smtp.test', SMTP_USER: 'u', SMTP_PASS: 'p', EMAIL_MAX_ATTEMPTS: '1', EMAIL_RETRY_BASE_MS: '0' });
    prisma.emailDelivery.create.mockResolvedValue({ id: 'delivery-1' });
  });
  afterAll(() => { process.env = env; });

  it('EMAIL-ATT-001/002 accepts attachments and passes them to transporter.sendMail', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'm-1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    await new EmailService(prisma, encryption).sendMail({
      to: 'approver@thiso.test',
      subject: 'Tờ trình',
      html: '<p>x</p>',
      attachments: [{ filename: 'to-trinh-PRO-1-v1.pdf', content: PDF, contentType: 'application/pdf' }],
    });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [{ filename: 'to-trinh-PRO-1-v1.pdf', content: PDF, contentType: 'application/pdf' }],
    }));
  });

  it('EMAIL-ATT-003 a message without attachments is sent exactly as before', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'm-2' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    await new EmailService(prisma, encryption).sendMail({ to: 'a@thiso.test', subject: 's', html: '<p>h</p>' });

    expect(sendMail.mock.calls[0][0]).not.toHaveProperty('attachments');
  });

  it('EMAIL-ATT-004 the tracked ledger keeps attachment metadata and source, never the bytes', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'm-3' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const source = { kind: 'PROPOSAL_DOCUMENT_VERSION_PDF', ref: { proposalId: 'p1', documentVersionId: 'v1', asOf: '2026-09-14T00:00:00.000Z', audience: 'INTERNAL' } };

    await new EmailService(prisma, encryption).sendMail({
      to: 'a@thiso.test', subject: 's', html: '<p>h</p>',
      delivery: { eventKey: 'k-1', eventType: 'PROPOSAL_APPROVAL' },
      attachments: [{ filename: 'f.pdf', content: PDF, contentType: 'application/pdf', source }],
    });

    const data = prisma.emailDelivery.create.mock.calls[0][0].data;
    expect(data.status).toBe('SENDING');
    expect(data.payload.attachments).toEqual([{
      filename: 'f.pdf', contentType: 'application/pdf', cid: null, size: PDF.length, sha256: sha256(PDF), source,
    }]);
    expect(JSON.stringify(data.payload)).not.toContain(PDF.toString('base64'));
    expect(prisma.emailDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }));
  });

  it('EMAIL-ATT-008 with email disabled the ledger records SKIPPED and nothing is sent', async () => {
    for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) delete process.env[k];
    const sendMail = jest.fn();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const result = await new EmailService(prisma, encryption).sendMail({
      to: 'a@thiso.test', subject: 's', html: '<p>h</p>', delivery: { eventKey: 'k-2' },
      attachments: [{ filename: 'f.pdf', content: PDF }],
    });

    expect(result).toMatchObject({ skipped: true });
    expect(sendMail).not.toHaveBeenCalled();
    expect(prisma.emailDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED' }) }));
  });
});

describe('Queued deliveries regenerate and verify their attachments', () => {
  const source = { kind: 'TEST_DOC', ref: { id: 'doc-1' } };
  const stored = describeAttachment({ filename: 'doc.pdf', content: PDF, contentType: 'application/pdf', source });

  function worker(resolverContent: Buffer | null, sendResult: any = { messageId: 'm' }) {
    const registry = new EmailAttachmentRegistry();
    if (resolverContent) registry.register('TEST_DOC', async () => ({ filename: 'ignored.pdf', content: resolverContent, contentType: 'application/pdf' }));
    const prisma: any = {
      emailDelivery: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'd-1', eventKey: 'k', attempts: 0, recipient: { to: 'a@thiso.test', cc: null },
          payload: { subject: 's', html: '<p>h</p>', text: 'h', attachments: [stored] },
        }]),
        update: jest.fn(),
      },
    };
    const email = { sendMail: jest.fn().mockResolvedValue(sendResult) };
    const lock = { runExclusive: jest.fn() };
    return { service: new EmailDeliveryService(prisma, email as any, lock as any, undefined, registry), prisma, email };
  }

  it('resolves the source and sends the same bytes under the stored filename', async () => {
    const w = worker(PDF);
    await w.service.processBatch();
    expect(w.email.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [expect.objectContaining({ filename: 'doc.pdf', content: PDF })],
    }));
    expect(w.prisma.emailDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }));
  });

  it('refuses to send when the regenerated content differs from what was queued', async () => {
    const w = worker(Buffer.from('%PDF-1.3 changed'));
    await w.service.processBatch();
    expect(w.email.sendMail).not.toHaveBeenCalled();
    const data = w.prisma.emailDelivery.update.mock.calls[0][0].data;
    expect(data.status).toBe('FAILED');
    expect(data.lastError).toMatch(/no longer matches/);
  });

  it('refuses to send without an attachment whose source cannot be resolved', async () => {
    const w = worker(null);
    await w.service.processBatch();
    expect(w.email.sendMail).not.toHaveBeenCalled();
    expect(w.prisma.emailDelivery.update.mock.calls[0][0].data.status).toBe('FAILED');
  });

  it('EMAIL-ATT-008 a queued delivery with email disabled is SKIPPED, not SENT', async () => {
    const w = worker(PDF, { skipped: true });
    await w.service.processBatch();
    expect(w.prisma.emailDelivery.update.mock.calls[0][0].data).toMatchObject({ status: 'SKIPPED', sentAt: null });
  });
});
