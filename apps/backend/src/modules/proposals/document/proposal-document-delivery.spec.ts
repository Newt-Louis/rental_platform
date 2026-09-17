/**
 * CR-PROPOSAL-DOCUMENT-FINALIZATION — approver notifications and external sends
 * carry the official PDF of the submitted version.
 */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ProposalDocumentDeliveryService, PROPOSAL_DOCUMENT_PDF_ATTACHMENT } from './proposal-document-delivery.service';
import { buildProposalDocument, buildVersionDocument, snapshotForVersion } from './proposal-document.mapper';
import { proposalDocumentSource } from './proposal-document.fixture';
import { ProposalPdfService } from '../proposal-pdf.service';
import { EmailAttachmentRegistry, sha256 } from '../../notifications/email-attachments';
import { EmailService } from '../../notifications/email.service';
import { OutboxService } from '../../../common/services/outbox.service';

const SUBMIT = new Date('2026-09-10T02:00:00.000Z');
const NOW = new Date('2026-09-12T03:00:00.000Z');

function versionRow(status = 'SUBMITTED', stepOverrides: any[] | null = null) {
  const src = proposalDocumentSource({ notes: undefined } as any);
  const live = buildProposalDocument(src, SUBMIT);
  return {
    id: 'dv-1', proposalId: 'prop-1', versionNumber: 3, status,
    ...snapshotForVersion(live, 'Nguyễn Thị Lập'), submittedById: 'user-author', submittedAt: SUBMIT,
    approvalWorkflow: {
      id: 'wf-1', status: 'IN_PROGRESS', createdAt: SUBMIT,
      steps: stepOverrides ?? [
        { id: 's1', stepOrder: 1, stepName: 'Leasing Manager Approval', approverRole: 'LEASING_MANAGER', approverId: 'u-manager', approver: { id: 'u-manager', fullName: 'Trần Thị B' }, status: 'APPROVED', decidedAt: new Date('2026-09-11T04:30:00.000Z'), comment: 'Đồng ý, giá hợp lý' },
        { id: 's2', stepOrder: 2, stepName: 'Finance Review', approverRole: 'FINANCE', approverId: 'u-finance', approver: { id: 'u-finance', fullName: 'Phạm Thị D' }, status: 'PENDING', decidedAt: null, comment: null },
      ],
    },
  };
}

class FixedClock extends ProposalDocumentDeliveryService {
  clock = NOW;
  protected now() { return this.clock; }
}

function harness(opts: { versionStatus?: string; role?: string; permissionRoles?: string[] | null; mallDenied?: boolean } = {}) {
  const row = versionRow(opts.versionStatus ?? 'SUBMITTED');
  const documents: any = {
    getVersionDocument: jest.fn(async (_p: string, _v: string, _c: any, o: any) => buildVersionDocument(row as any, { proposalStatus: 'UNDER_REVIEW', asOf: o?.asOf ?? null })),
    getLiveDocument: jest.fn(),
    loadVersion: jest.fn(async () => row),
    listVersions: jest.fn(async () => [{ id: 'dv-1', versionNumber: 3, status: row.status, submittedAt: SUBMIT }]),
  };
  const ledger = new Map<string, any>();
  const sends = new Map<string, any>();
  const tx: any = {
    emailDelivery: { create: jest.fn(async ({ data }: any) => { const r = { id: `d-${ledger.size + 1}`, status: 'PENDING', attempts: 0, ...data }; ledger.set(data.eventKey, r); return r; }) },
    proposalDocumentSend: { create: jest.fn(async ({ data }: any) => {
      const key = `${data.proposalId}:${data.idempotencyKey}`;
      if (sends.has(key)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const r = { id: `send-${sends.size + 1}`, createdAt: NOW, ...data }; sends.set(key, r); return r;
    }) },
    auditLog: { create: jest.fn() },
  };
  const withRelations = (r: any) => r && ({ ...r, documentVersion: { versionNumber: 3 }, emailDelivery: [...ledger.values()].find((d) => d.id === r.emailDeliveryId) });
  const prisma: any = {
    ...tx,
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    approvalStep: { findFirst: jest.fn(async () => ({
      id: 's2', stepOrder: 2, stepName: 'Finance Review', approverRole: 'FINANCE', approverId: 'u-finance', status: 'PENDING',
      approver: { id: 'u-finance', email: 'finance@thiso.test', fullName: 'Phạm Thị D', isActive: true, deletedAt: null },
      workflow: { id: 'wf-1', entityType: 'PROPOSAL', entityId: 'prop-1', status: 'IN_PROGRESS', documentVersionId: 'dv-1' },
    })) },
    proposal: { findUnique: jest.fn(async () => ({
      proposalNumber: 'PRO-2026-00042', unit: { code: 'L3-E01', mallId: 'mall-hn' },
      tenant: { contactEmail: 'contact@cellphones.test', contactName: 'Anh Quân', brandName: 'CellphoneS' }, lead: { email: 'lead@cellphones.test', contactName: 'Quân', brandName: 'CellphoneS' },
    })) },
    user: { findMany: jest.fn(), findUnique: jest.fn(async () => ({ fullName: 'Trần Thị B' })) },
    notification: { findFirst: jest.fn(async () => null) },
    proposalDocumentSend: {
      ...tx.proposalDocumentSend,
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return withRelations([...sends.values()].find((s) => s.id === where.id));
        const k = where.proposalId_idempotencyKey;
        return withRelations(sends.get(`${k.proposalId}:${k.idempotencyKey}`));
      }),
      findMany: jest.fn(async () => [...sends.values()].map(withRelations)),
    },
  };
  const notifications: any = { create: jest.fn() };
  const emailDelivery: any = { enqueue: jest.fn(async (_db: any, req: any) => { if (!ledger.has(req.eventKey)) ledger.set(req.eventKey, { id: `d-${ledger.size + 1}`, ...req }); return ledger.get(req.eventKey); }) };
  const email = new EmailService({} as any, {} as any);
  const registry = new EmailAttachmentRegistry();
  const permissions: any = { getAllowedRoles: jest.fn(async () => (opts.permissionRoles === undefined ? null : new Set(opts.permissionRoles))) };
  const mallAccess: any = { assertMallAccess: jest.fn(async () => { if (opts.mallDenied) throw new ForbiddenException('No access to this mall'); }) };
  const pdf = new ProposalPdfService();
  const service = new FixedClock(prisma, documents, pdf, emailDelivery, email, notifications, registry, permissions, mallAccess);
  service.onModuleInit();
  const user = { id: 'u-manager', role: (opts.role ?? 'LEASING_MANAGER') as any };
  return { service, prisma, tx, documents, notifications, emailDelivery, ledger, sends, registry, pdf, user, row };
}

const SEND = { documentVersionId: 'dv-1', to: ['Contact@CellphoneS.test'], cc: ['legal@cellphones.test'], subject: 'Tờ trình thuê L3-E01', message: 'Kính gửi Quý khách,\nXin gửi tờ trình.' };

describe('Approver notification', () => {
  it('PROP-NOTIFY-002/003/004 and EMAIL-ATT-005/006 the next approver gets history, version and the official PDF', async () => {
    const h = harness();
    await h.service.notifyApprovalStep('wf-1', 2);

    expect(h.emailDelivery.enqueue).toHaveBeenCalledTimes(1);
    const req = h.emailDelivery.enqueue.mock.calls[0][1];
    expect(req).toMatchObject({
      eventKey: 'proposal-approval:prop-1:s2:u-finance', eventType: 'PROPOSAL_APPROVAL', entityId: 'prop-1', mallId: 'mall-hn', to: 'finance@thiso.test',
    });
    expect(req.subject).toContain('PRO-2026-00042 · phiên bản 3');
    expect(req.html).toContain('Phiên bản tờ trình');
    expect(req.html).toContain('Trần Thị B');
    expect(req.html).toContain('Đã duyệt');
    expect(req.html).toContain('Đồng ý, giá hợp lý');
    expect(req.html).toContain('THISO Mall Hà Nội');
    expect(req.html).not.toMatch(/Phạm Thị D<\/td><td[^>]*>Đã duyệt/);

    expect(req.attachments).toHaveLength(1);
    expect(req.attachments[0]).toMatchObject({
      filename: 'to-trinh-PRO-2026-00042-v3.pdf', contentType: 'application/pdf',
      source: { kind: PROPOSAL_DOCUMENT_PDF_ATTACHMENT, ref: { proposalId: 'prop-1', documentVersionId: 'dv-1', asOf: NOW.toISOString(), audience: 'INTERNAL' } },
    });
    expect(h.documents.getVersionDocument).toHaveBeenCalledWith('prop-1', 'dv-1', h.prisma, { asOf: NOW });
    expect(h.documents.getLiveDocument).not.toHaveBeenCalled();
  }, 60_000);

  it('EMAIL-ATT-007 the attachment hash equals the submitted version rendered as of the recorded instant', async () => {
    const h = harness();
    await h.service.notifyApprovalStep('wf-1', 2);
    const meta = h.emailDelivery.enqueue.mock.calls[0][1].attachments[0];

    const expected = await h.pdf.render(buildVersionDocument(h.row as any, { proposalStatus: 'UNDER_REVIEW', asOf: NOW }), { audience: 'INTERNAL' });
    expect(meta.sha256).toBe(sha256(expected));

    // The delivery worker regenerates through the registry and gets the same bytes.
    const [regenerated] = await h.registry.resolve([meta]);
    expect(regenerated.content.equals(expected)).toBe(true);
  }, 60_000);

  it('PROP-NOTIFY-005 replaying the same step notification creates no duplicate email or in-app notice', async () => {
    const h = harness();
    await h.service.notifyApprovalStep('wf-1', 2);
    h.prisma.notification.findFirst.mockResolvedValue({ id: 'n-1' });
    await h.service.notifyApprovalStep('wf-1', 2);

    expect(h.notifications.create).toHaveBeenCalledTimes(1);
    const keys = h.emailDelivery.enqueue.mock.calls.map((c: any) => c[1].eventKey);
    expect(new Set(keys).size).toBe(1);
    expect(h.ledger.size).toBe(1);
  }, 60_000);

  it('PROP-NOTIFY-007 notifies only the assigned approver, never the role at large', async () => {
    const h = harness();
    await h.service.notifyApprovalStep('wf-1', 2);
    expect(h.prisma.user.findMany).not.toHaveBeenCalled();
    expect(h.notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-finance' }));
  }, 60_000);

  it('does nothing for a step that is no longer pending', async () => {
    const h = harness();
    h.prisma.approvalStep.findFirst.mockResolvedValue(null);
    expect(await h.service.notifyApprovalStep('wf-1', 2)).toEqual({ notified: 0 });
    expect(h.emailDelivery.enqueue).not.toHaveBeenCalled();
  });
});

describe('PROP-NOTIFY-001/006 durable delivery through the outbox', () => {
  it('a step-advanced intent that failed is replayed by the worker until delivered', async () => {
    const event = { id: 'o-1', eventKey: 'approval:wf-1:step-advanced:2', eventName: 'approval.workflow.step-advanced', payload: { workflowId: 'wf-1', entityType: 'PROPOSAL', entityId: 'prop-1', nextStepOrder: 2 }, attempts: 0 };
    const prisma: any = { outboxEvent: { findMany: jest.fn().mockResolvedValue([event]), update: jest.fn() } };
    const handler = jest.fn().mockRejectedValueOnce(new Error('process died mid-delivery')).mockResolvedValueOnce(undefined);
    const emitter: any = { emitAsync: jest.fn((_name: string, payload: any) => handler(payload)) };
    const outbox = new OutboxService(prisma, emitter, { runExclusive: jest.fn() } as any);

    await outbox.processBatch();
    expect(prisma.outboxEvent.update.mock.calls[0][0].data).toMatchObject({ status: 'FAILED', attempts: 1 });

    await outbox.processBatch();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(event.payload);
    expect(prisma.outboxEvent.update.mock.calls[1][0].data).toMatchObject({ status: 'PROCESSED' });
  });
});

describe('External send', () => {
  it('PROP-SEND-001/004/005/008 sends an approved version, records it, and attaches that exact PDF', async () => {
    const h = harness({ versionStatus: 'APPROVED' });
    const result = await h.service.sendExternal('prop-1', SEND, h.user, 'send-key-0001');

    expect(result).toMatchObject({ duplicate: false, documentVersionId: 'dv-1', versionNumber: 3, attachmentFilename: 'to-trinh-PRO-2026-00042-v3.pdf' });
    expect(result.recipients).toEqual({ to: ['contact@cellphones.test'], cc: ['legal@cellphones.test'] });

    const delivery = h.tx.emailDelivery.create.mock.calls[0][0].data;
    expect(delivery).toMatchObject({ eventKey: 'proposal-send:prop-1:send-key-0001', eventType: 'PROPOSAL_EXTERNAL_SEND', mallId: 'mall-hn' });
    expect(delivery.payload.attachments[0].source.ref).toMatchObject({ documentVersionId: 'dv-1', audience: 'EXTERNAL' });
    const expected = await h.pdf.render(buildVersionDocument(h.row as any, { proposalStatus: 'APPROVED', asOf: NOW }), { audience: 'EXTERNAL' });
    expect(result.attachmentSha256).toBe(sha256(expected));
    expect(delivery.payload.attachments[0].sha256).toBe(result.attachmentSha256);

    expect(h.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'PROPOSAL_DOCUMENT_SENT_EXTERNAL', entityId: 'prop-1' }) });
    expect(await h.service.listSends('prop-1')).toHaveLength(1);
  }, 60_000);

  it('PROP-SEND-009 the external email and PDF carry no internal notes or approver comments', async () => {
    const h = harness({ versionStatus: 'APPROVED' });
    await h.service.sendExternal('prop-1', SEND, h.user, 'send-key-0002');
    const delivery = h.tx.emailDelivery.create.mock.calls[0][0].data;
    expect(delivery.payload.html).not.toContain('Đồng ý, giá hợp lý');

    const model = buildVersionDocument(h.row as any, { proposalStatus: 'APPROVED', asOf: NOW });
    const { buildProposalDocDefinition } = await import('../proposal-pdf.service');
    const external = JSON.stringify(buildProposalDocDefinition(model, { audience: 'EXTERNAL' }));
    const internal = JSON.stringify(buildProposalDocDefinition(model, { audience: 'INTERNAL' }));
    expect(internal).toContain('Đồng ý, giá hợp lý');
    expect(external).not.toContain('Đồng ý, giá hợp lý');
    expect(external).toContain('Trần Thị B');
  }, 60_000);

  it('PROP-SEND-007 a retry with the same key returns the first send and queues nothing new', async () => {
    const h = harness({ versionStatus: 'APPROVED' });
    const first = await h.service.sendExternal('prop-1', SEND, h.user, 'send-key-0003');
    const again = await h.service.sendExternal('prop-1', SEND, h.user, 'send-key-0003');

    expect(again).toMatchObject({ id: first.id, duplicate: true });
    expect(h.tx.emailDelivery.create).toHaveBeenCalledTimes(1);
    await expect(h.service.sendExternal('prop-1', { ...SEND, to: ['someone.else@test.vn'] }, h.user, 'send-key-0003'))
      .rejects.toBeInstanceOf(ConflictException);
  }, 60_000);

  it('only an approved version can be sent outside', async () => {
    const h = harness({ versionStatus: 'SUBMITTED' });
    const err = await h.service.sendExternal('prop-1', SEND, h.user, 'send-key-0004').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'PROPOSAL_SEND_VERSION_NOT_APPROVED' });
    expect(h.tx.emailDelivery.create).not.toHaveBeenCalled();
  });

  it('PROP-SEND-002 a role without the send permission is denied with zero side effects', async () => {
    const h = harness({ versionStatus: 'APPROVED', role: 'LEASING_EXECUTIVE' });
    const err = await h.service.sendExternal('prop-1', SEND, h.user, 'send-key-0005').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(h.tx.emailDelivery.create).not.toHaveBeenCalled();
    expect(h.tx.proposalDocumentSend.create).not.toHaveBeenCalled();
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();

    const revoked = harness({ versionStatus: 'APPROVED', permissionRoles: ['MALL_DIRECTOR'] });
    await expect(revoked.service.sendExternal('prop-1', SEND, revoked.user, 'send-key-0006')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('PROP-SEND-003 a Mall A user cannot send a Mall B Proposal', async () => {
    const h = harness({ versionStatus: 'APPROVED', mallDenied: true });
    await expect(h.service.sendExternal('prop-1', SEND, h.user, 'send-key-0007')).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.tx.emailDelivery.create).not.toHaveBeenCalled();
  });

  it('PROP-SEND-006 the send context shows versions, the attachment name and suggested recipients for review', async () => {
    const h = harness({ versionStatus: 'APPROVED' });
    const ctx = await h.service.sendContext('prop-1', h.user);
    expect(ctx).toMatchObject({
      canSend: true,
      approvedVersions: [expect.objectContaining({ id: 'dv-1', attachmentFilename: 'to-trinh-PRO-2026-00042-v3.pdf' })],
      suggestedRecipients: [
        { email: 'contact@cellphones.test', name: 'Anh Quân', source: 'TENANT_CONTACT' },
        { email: 'lead@cellphones.test', name: 'Quân', source: 'LEAD_CONTACT' },
      ],
    });
    // Suggesting is not sending.
    expect(h.tx.emailDelivery.create).not.toHaveBeenCalled();
  });

  it('requires an idempotency key', async () => {
    const h = harness({ versionStatus: 'APPROVED' });
    await expect(h.service.sendExternal('prop-1', SEND, h.user, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PROP-NOTIFY-006 a failed notification is retried, not recorded as delivered', () => {
  it('the Proposal step-advanced and rejected listeners let errors reach the outbox', () => {
    const { ProposalsService } = require('../proposals.service');
    const { EVENT_LISTENER_METADATA } = require('@nestjs/event-emitter/dist/constants');
    for (const method of ['onApprovalWorkflowStepAdvanced', 'onApprovalWorkflowRejected']) {
      const meta = Reflect.getMetadata(EVENT_LISTENER_METADATA, ProposalsService.prototype[method]);
      const entries = Array.isArray(meta) ? meta : [meta];
      expect(entries.some((m: any) => m?.options?.suppressErrors === false)).toBe(true);
    }
  });
});
