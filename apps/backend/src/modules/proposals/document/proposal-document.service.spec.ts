/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 — saving editorial content and gating submit.
 *
 * The real-Postgres concurrency proof (two saves racing on FOR UPDATE) is in the
 * runtime verification; these tests pin the decisions each save makes.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProposalDocumentService } from './proposal-document.service';
import { proposalDocumentSource } from './proposal-document.fixture';
import { buildFacts, computeSourceFingerprint } from './proposal-document.mapper';
import { PROPOSAL_DOCUMENT_SCHEMA_VERSION } from './proposal-document.types';

const NOW = new Date('2026-09-14T02:00:00.000Z');

class FixedClockDocumentService extends ProposalDocumentService {
  protected now() { return NOW; }
}

function harness(initial: Partial<ReturnType<typeof proposalDocumentSource>> = {}) {
  let row: any = { ...proposalDocumentSource(), ...initial };
  const writes = { proposalUpdate: jest.fn(), auditLog: jest.fn(), version: jest.fn() };

  const client: any = {
    $queryRaw: jest.fn(async () => [{ id: row.id, status: row.status, editorContent: row.editorContent }]),
    proposal: {
      findUnique: jest.fn(async () => {
        const { creator, ...rest } = row;
        return rest;
      }),
      update: jest.fn(async ({ data }: any) => {
        writes.proposalUpdate(data);
        row = { ...row, ...data };
        return row;
      }),
    },
    user: { findUnique: jest.fn(async ({ where }: any) => (where.id === row.creator?.id ? { ...row.creator, isActive: true, deletedAt: null } : { id: where.id, fullName: `Người dùng ${where.id}`, role: 'LEASING_MANAGER', department: null, isActive: true, deletedAt: null })) },
    proposalDocumentVersion: { findFirst: jest.fn(async () => null) },
    auditLog: { create: jest.fn(async (args: any) => writes.auditLog(args.data)) },
    proposalVersion: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: any) => writes.version(args.data)),
    },
  };
  const prisma: any = { ...client, $transaction: jest.fn(async (fn: any) => fn(client)) };
  const service = new FixedClockDocumentService(prisma);

  return {
    service,
    writes,
    get row() { return row; },
    set(patch: any) { row = { ...row, ...patch }; },
    fingerprint: () => computeSourceFingerprint(buildFacts(row)),
    expectNoWrites() {
      expect(writes.proposalUpdate).not.toHaveBeenCalled();
      expect(writes.auditLog).not.toHaveBeenCalled();
      expect(writes.version).not.toHaveBeenCalled();
    },
  };
}

const emptyContent = {};

describe('ProposalDocumentService.saveContent', () => {
  it('PROP-SYNC-014 saved editorial content comes back on the next load', async () => {
    const h = harness();
    await h.service.saveContent('prop-1', {
      expectedContentVersion: 0,
      reviewedFingerprint: h.fingerprint(),
      content: {
        bodyIntro: 'Kính trình phương án thuê đã đàm phán.',
        items: [{ key: 'PAYMENT', narrativeText: 'Thanh toán trước ngày 10 hằng tháng.', note: 'Khách đề nghị' }],
      },
    }, 'user-author');

    const reloaded = await h.service.getDocument('prop-1');

    expect(reloaded.bodyIntro).toBe('Kính trình phương án thuê đã đàm phán.');
    expect(reloaded.items.find((i) => i.key === 'PAYMENT')).toMatchObject({
      narrativeText: 'Thanh toán trước ngày 10 hằng tháng.', note: 'Khách đề nghị', narrativeOverridden: true,
    });
    expect(reloaded.sync).toMatchObject({ contentVersion: 1, documentStale: false, savedById: 'user-author' });
    expect(h.row.editorContent.schemaVersion).toBe(PROPOSAL_DOCUMENT_SCHEMA_VERSION);
  });

  it('PROP-SYNC-019 saving after review records the current fingerprint and clears staleness', async () => {
    const h = harness();
    await h.service.saveContent('prop-1', { expectedContentVersion: 0, reviewedFingerprint: h.fingerprint(), content: emptyContent }, 'user-author');
    const firstFingerprint = h.row.editorContent.sourceFingerprint;

    h.set({ rentPerSqm: 820_000 });
    const stale = await h.service.getDocument('prop-1');
    expect(stale.sync.documentStale).toBe(true);

    const saved = await h.service.saveContent('prop-1', {
      expectedContentVersion: 1, reviewedFingerprint: stale.sync.sourceFingerprint, content: emptyContent,
    }, 'user-author');

    expect(h.row.editorContent.sourceFingerprint).not.toBe(firstFingerprint);
    expect(h.row.editorContent.sourceFingerprint).toBe(h.fingerprint());
    expect(saved.sync).toMatchObject({ documentStale: false, contentVersion: 2 });
  });

  it('opening a stale document does not mark it fresh', async () => {
    const h = harness();
    await h.service.saveContent('prop-1', { expectedContentVersion: 0, reviewedFingerprint: h.fingerprint(), content: emptyContent }, 'u');
    h.set({ area: 150 });
    h.writes.proposalUpdate.mockClear();

    await h.service.getDocument('prop-1');
    await h.service.getDocument('prop-1');

    expect(h.writes.proposalUpdate).not.toHaveBeenCalled();
    expect((await h.service.getDocument('prop-1')).sync.documentStale).toBe(true);
  });

  it('PROP-SYNC-020 refuses a save based on an older content version, with zero writes', async () => {
    const h = harness();
    const fingerprint = h.fingerprint();
    await h.service.saveContent('prop-1', { expectedContentVersion: 0, reviewedFingerprint: fingerprint, content: { bodyIntro: 'Bản của A' } }, 'user-a');
    h.writes.proposalUpdate.mockClear(); h.writes.auditLog.mockClear(); h.writes.version.mockClear();

    const err = await h.service
      .saveContent('prop-1', { expectedContentVersion: 0, reviewedFingerprint: fingerprint, content: { bodyIntro: 'Bản của B' } }, 'user-b')
      .catch((e) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'PROPOSAL_DOCUMENT_VERSION_CONFLICT', currentContentVersion: 1 });
    h.expectNoWrites();
    expect((await h.service.getDocument('prop-1')).bodyIntro).toBe('Bản của A');
  });

  it('refuses a save whose author reviewed facts that have since changed', async () => {
    const h = harness();
    const reviewed = h.fingerprint();
    h.set({ rentPerSqm: 900_000 });

    const err = await h.service
      .saveContent('prop-1', { expectedContentVersion: 0, reviewedFingerprint: reviewed, content: emptyContent }, 'u')
      .catch((e) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'PROPOSAL_DOCUMENT_SOURCE_CHANGED' });
    h.expectNoWrites();
  });

  it('only DRAFT content is editable', async () => {
    const h = harness({ status: 'SUBMITTED' });
    await expect(h.service.saveContent('prop-1', {
      expectedContentVersion: 0, reviewedFingerprint: h.fingerprint(), content: emptyContent,
    }, 'u')).rejects.toBeInstanceOf(BadRequestException);
    h.expectNoWrites();
  });

  it('rejects rewriting a business fact through the document', async () => {
    const h = harness();
    const err = await h.service.saveContent('prop-1', {
      expectedContentVersion: 0,
      reviewedFingerprint: h.fingerprint(),
      content: { items: [{ key: 'RENT', narrativeText: 'Giá thuê: 1 VND/m²/tháng' }] },
    }, 'u').catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'PROPOSAL_DOCUMENT_FACT_NOT_EDITABLE' });
    h.expectNoWrites();
  });

  it('does not store generated wording as if it were an edit, so it keeps following the facts', async () => {
    const h = harness();
    const doc = await h.service.getDocument('prop-1');

    // An editor that posts back every row exactly as it received them.
    await h.service.saveContent('prop-1', {
      expectedContentVersion: 0,
      reviewedFingerprint: doc.sync.sourceFingerprint,
      content: {
        subject: doc.header.subject,
        preamble: doc.preamble,
        bodyIntro: doc.bodyIntro,
        closingLine: doc.closingLine,
        docNumber: doc.header.docNumber,
        documentDate: doc.header.documentDate,
        items: doc.items.map((i) => ({ key: i.key, narrativeText: i.narrativeEditable ? i.narrativeText : undefined, note: i.note })),
        itemOrder: doc.items.map((i) => i.key),
      },
    }, 'u');

    expect(h.row.editorContent.content).toMatchObject({
      subject: null, preamble: null, bodyIntro: null, closingLine: null, docNumber: null, documentDate: null, itemOrder: null,
    });
    expect(h.row.editorContent.content.items).toEqual({});

    // …and the mall name in the generated wording still follows a later change.
    h.set({ unit: { ...h.row.unit, mall: { ...h.row.unit.mall, name: 'THISO Mall Sala' } } });
    expect((await h.service.getDocument('prop-1')).header.subject).toContain('THISO Mall Sala');
  });

  it('audits versions and fingerprints without copying the document body', async () => {
    const h = harness();
    await h.service.saveContent('prop-1', {
      expectedContentVersion: 0,
      reviewedFingerprint: h.fingerprint(),
      content: { bodyIntro: 'Nội dung thương mại nhạy cảm 123' },
    }, 'user-author');

    expect(h.writes.auditLog).toHaveBeenCalledTimes(1);
    const audit = h.writes.auditLog.mock.calls[0][0];
    expect(audit).toMatchObject({ userId: 'user-author', action: 'PROPOSAL_DOCUMENT_CONTENT_SAVED', entityType: 'PROPOSAL', entityId: 'prop-1' });
    expect(JSON.parse(audit.payload)).toEqual({
      fromContentVersion: 0, toContentVersion: 1, previousFingerprint: null,
      newFingerprint: h.fingerprint(), migratedFromLegacy: false,
    });
    expect(audit.payload).not.toContain('Nội dung thương mại');
    expect(h.writes.version).toHaveBeenCalledWith(expect.objectContaining({ changeReason: 'EDITOR_UPDATED', createdById: 'user-author' }));
  });

  it('replaces legacy content on an explicit save and records the migration', async () => {
    const h = harness({ editorContent: { bodyIntro: 'cũ', items: [], signatories: [{ title: 'X', name: 'PHẠM THỊ KHÁNH TRANG' }] } });
    await h.service.saveContent('prop-1', { expectedContentVersion: 0, reviewedFingerprint: h.fingerprint(), content: { bodyIntro: 'cũ' } }, 'u');

    expect(JSON.stringify(h.row.editorContent)).not.toContain('PHẠM THỊ KHÁNH TRANG');
    expect(JSON.parse(h.writes.auditLog.mock.calls[0][0].payload).migratedFromLegacy).toBe(true);
  });
});

describe('ProposalDocumentService.assertSubmittable', () => {
  it('PROP-REVIEW-001 a never-reviewed document cannot be submitted', async () => {
    const err = await harness().service.assertSubmittable('prop-1').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'PROPOSAL_DOCUMENT_NOT_REVIEWED' });
    expect(err.getResponse().message).toContain('Tờ trình chưa được người lập kiểm tra và xác nhận nội dung.');
  });

  it('lets a document through when its reviewed facts still hold', async () => {
    const h = harness();
    await h.service.saveContent('prop-1', { expectedContentVersion: 0, reviewedFingerprint: h.fingerprint(), content: emptyContent }, 'u');
    await expect(h.service.assertSubmittable('prop-1')).resolves.toMatchObject({ proposalId: 'prop-1' });
  });

  it('blocks submit when facts changed after the last reviewed save', async () => {
    const h = harness();
    await h.service.saveContent('prop-1', { expectedContentVersion: 0, reviewedFingerprint: h.fingerprint(), content: emptyContent }, 'u');
    h.set({ rentPerSqm: 500_000 });

    const err = await h.service.assertSubmittable('prop-1').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'PROPOSAL_DOCUMENT_STALE' });
  });

  it('blocks submit of unverified legacy content until it is reviewed and saved', async () => {
    const h = harness({ editorContent: { bodyIntro: 'cũ', items: [] } });
    const err = await h.service.assertSubmittable('prop-1').catch((e) => e);
    // Legacy content carries no reviewed fingerprint, so it is not reviewed at all.
    expect(err.getResponse()).toMatchObject({ code: 'PROPOSAL_DOCUMENT_NOT_REVIEWED' });
  });
});
