/**
 * CR-PROPOSAL-DOCUMENT-FINALIZATION — the submitted Tờ trình is immutable.
 *
 * A DRAFT follows the live Proposal. Once submitted, what approvers review is
 * the version frozen in that transaction: renaming a Tenant, Mall or User, or
 * changing the Proposal afterwards, must not alter it. Real-Postgres proofs
 * (trigger, concurrent submit) are in the runtime verification.
 */
import { BadRequestException } from '@nestjs/common';
import {
  buildProposalDocument,
  buildVersionDocument,
  snapshotForVersion,
  computeSourceFingerprint,
  buildFacts,
} from './proposal-document.mapper';
import { proposalDocumentSource } from './proposal-document.fixture';
import { buildProposalDocDefinition, ProposalPdfService } from '../proposal-pdf.service';
import { ProposalDocumentService } from './proposal-document.service';
import { ProposalsController } from '../proposals.controller';

const SUBMIT = new Date('2026-09-10T02:00:00.000Z');
const LATER = new Date('2026-09-20T02:00:00.000Z');

function texts(node: unknown, out: string[] = [], key?: string): string[] {
  if (typeof node === 'string') { if (key === 'text' || key === 'ul') out.push(node); }
  else if (Array.isArray(node)) node.forEach((n) => texts(n, out, key === 'ul' ? 'ul' : undefined));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) if (!['image', 'layout', 'footer', 'info'].includes(k)) texts(v, out, k);
  }
  return out;
}

function submittedVersion(src = proposalDocumentSource(), extra: Partial<any> = {}) {
  const live = buildProposalDocument(src, SUBMIT);
  const snap = snapshotForVersion(live, 'Nguyễn Thị Lập');
  return {
    id: 'dv-1', proposalId: src.id, versionNumber: 1, status: 'SUBMITTED',
    ...snap, submittedById: 'user-author', submittedAt: SUBMIT,
    approvalWorkflow: {
      id: 'wf-1', status: 'IN_PROGRESS', createdAt: SUBMIT,
      steps: [
        { id: 's1', stepOrder: 1, stepName: 'Leasing Manager Approval', approverRole: 'LEASING_MANAGER', approverId: 'm', approver: { id: 'm', fullName: 'Trần Thị B' }, status: 'APPROVED', decidedAt: new Date('2026-09-11T02:00:00.000Z'), comment: 'OK' },
        { id: 's2', stepOrder: 2, stepName: 'Finance Review', approverRole: 'FINANCE', approverId: 'f', approver: { id: 'f', fullName: 'Phạm Thị D' }, status: 'PENDING', decidedAt: null, comment: null },
      ],
    },
    ...extra,
  };
}

const pdfText = (model: any) => texts(buildProposalDocDefinition(model)).join('\n');

describe('Submitted document version', () => {
  it('PROP-FINAL-006 a submitted version carries the exact facts, content and rendering reviewed', () => {
    const src = proposalDocumentSource();
    const row = submittedVersion(src);
    const doc = buildVersionDocument(row, { proposalStatus: 'SUBMITTED' });

    expect(row.sourceFingerprint).toBe(computeSourceFingerprint(buildFacts(src)));
    expect(doc.version).toMatchObject({ id: 'dv-1', versionNumber: 1, submittedByName: 'Nguyễn Thị Lập', submittedAt: SUBMIT.toISOString() });
    expect(doc.items).toEqual(buildProposalDocument(src, SUBMIT).items);
    expect(doc.sync.documentStale).toBe(false);
  });

  it('PROP-FINAL-007 renaming the Tenant after submit does not change the submitted PDF', () => {
    const src = proposalDocumentSource();
    const row = submittedVersion(src);
    const before = pdfText(buildVersionDocument(row, { proposalStatus: 'SUBMITTED', asOf: LATER }));

    const renamed = { ...src, lead: { ...src.lead!, company: 'Công ty ĐÃ ĐỔI TÊN', brandName: 'Brand Mới' } };
    const after = pdfText(buildVersionDocument(row, {
      proposalStatus: 'SUBMITTED', asOf: LATER, liveFingerprint: computeSourceFingerprint(buildFacts(renamed)),
    }));

    expect(after).toBe(before);
    expect(after).toContain('CellphoneS JSC');
    expect(after).not.toContain('ĐÃ ĐỔI TÊN');
  });

  it('PROP-FINAL-008 renaming the Mall after submit does not change the submitted PDF', () => {
    const src = proposalDocumentSource();
    const row = submittedVersion(src);
    const doc = buildVersionDocument(row, { proposalStatus: 'SUBMITTED' });
    expect(pdfText(doc)).toContain('THISO Mall Hà Nội');
    // The version never reads the Mall again, so a rename has nothing to reach.
    expect(JSON.stringify(doc)).not.toContain('Sala');
  });

  it('PROP-FINAL-009 renaming the preparer after submit does not change the submitted PDF', () => {
    const src = proposalDocumentSource();
    const row = submittedVersion(src);
    const doc = buildVersionDocument(row, { proposalStatus: 'SUBMITTED' });
    expect(doc.facts.preparedBy.fullName).toBe('Nguyễn Thị Lập');
    expect(pdfText(doc)).toContain('Nguyễn Thị Lập');
  });

  it('PROP-FINAL-010 a commercial change after submit shows as a live difference; the version is untouched', () => {
    const src = proposalDocumentSource();
    const row = submittedVersion(src);
    const changed = { ...src, rentPerSqm: 999_000 };
    const doc = buildVersionDocument(row, { proposalStatus: 'SUBMITTED', liveFingerprint: computeSourceFingerprint(buildFacts(changed)) });

    expect(doc.version!.liveDiffers).toBe(true);
    expect(doc.items.find((i) => i.key === 'RENT')!.factText).toContain('750.000');
    expect(JSON.stringify(doc.items)).not.toContain('999.000');
  });

  it('PROP-FINAL-011 approval evidence comes only from the workflow bound to that version', () => {
    const v1 = submittedVersion();
    const v2 = submittedVersion(proposalDocumentSource({ rentPerSqm: 800_000 }), {
      id: 'dv-2', versionNumber: 2,
      approvalWorkflow: { id: 'wf-2', status: 'IN_PROGRESS', createdAt: LATER, steps: [
        { id: 's9', stepOrder: 1, stepName: 'Leasing Manager Approval', approverRole: 'LEASING_MANAGER', approverId: 'm', approver: { id: 'm', fullName: 'Trần Thị B' }, status: 'PENDING', decidedAt: null, comment: null },
      ] },
    });

    const d1 = buildVersionDocument(v1, { proposalStatus: 'SUBMITTED' });
    const d2 = buildVersionDocument(v2, { proposalStatus: 'SUBMITTED' });
    expect(d1.approval.steps.map((s) => s.presentation)).toEqual(['APPROVED_BY', 'EXPECTED_APPROVER']);
    expect(d2.approval.steps.map((s) => s.presentation)).toEqual(['EXPECTED_APPROVER']);
    expect(d2.approval.steps.some((s) => s.comment === 'OK')).toBe(false);
  });

  it('renders approvals as of a cut-off so the same version produces identical PDF bytes later', async () => {
    const row = submittedVersion();
    const asOf = new Date('2026-09-10T12:00:00.000Z'); // before step 1 was decided
    const doc = buildVersionDocument(row, { proposalStatus: 'SUBMITTED', asOf });
    expect(doc.approval.steps.map((s) => s.presentation)).toEqual(['EXPECTED_APPROVER', 'EXPECTED_APPROVER']);
    expect(doc.approval.steps[0].comment).toBeNull();

    const pdf = new ProposalPdfService();
    const a = await pdf.render(buildVersionDocument(row, { proposalStatus: 'SUBMITTED', asOf: LATER }));
    await new Promise((r) => setTimeout(r, 1100));
    const b = await pdf.render(buildVersionDocument(row, { proposalStatus: 'UNDER_REVIEW', asOf: LATER, liveFingerprint: 'x'.repeat(64) }));
    expect(a.equals(b)).toBe(true);
  }, 60_000);

  it('PROP-FINAL-013 a revision is submitted as the next version number with its own fingerprint', async () => {
    const created: any[] = [];
    const tx: any = {
      proposalDocumentVersion: {
        aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: 1 } }),
        create: jest.fn(async ({ data }: any) => { created.push(data); return { id: 'dv-2', ...data }; }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Nguyễn Thị Lập' }) },
    };
    const service = new ProposalDocumentService({} as any);
    const revised = buildProposalDocument(proposalDocumentSource({ rentPerSqm: 800_000 }), LATER);

    await service.createSubmittedVersion(tx, revised, 'user-author');

    expect(created[0]).toMatchObject({ versionNumber: 2, status: 'SUBMITTED', sourceFingerprint: revised.sync.sourceFingerprint, submittedById: 'user-author' });
    expect(created[0].sourceFingerprint).not.toBe(submittedVersion().sourceFingerprint);
  });

  it('PROP-FINAL-014 a stale draft cannot be submitted', async () => {
    const src = proposalDocumentSource({ editorContent: {
      schemaVersion: 2, content: {}, sourceFingerprint: 'e'.repeat(64), contentVersion: 1, savedAt: SUBMIT.toISOString(), savedById: 'u',
    }, reviewer: { id: 'u', fullName: 'Người lập', isActive: true, deletedAt: null } } as any);
    const service = new ProposalDocumentService({} as any);
    jest.spyOn(service, 'loadSource').mockResolvedValue(src);
    const err = await service.assertSubmittable('prop-1').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'PROPOSAL_DOCUMENT_STALE' });
    expect(err.getResponse().message).toContain('Thông tin Proposal đã thay đổi sau lần xác nhận nội dung tờ trình gần nhất.');
  });

  it('a submit that names a reviewed fingerprint other than the current one is stale', async () => {
    const service = new ProposalDocumentService({} as any);
    const base = proposalDocumentSource();
    const { computeSourceFingerprint: fp, buildFacts: facts } = require('./proposal-document.mapper');
    const reviewed = { ...base, reviewer: { id: 'u', fullName: 'Người lập', isActive: true, deletedAt: null },
      editorContent: { schemaVersion: 2, content: {}, sourceFingerprint: fp(facts(base)), contentVersion: 1, savedAt: SUBMIT.toISOString(), savedById: 'u' } };
    jest.spyOn(service, 'loadSource').mockResolvedValue(reviewed as any);
    const err = await service.assertSubmittable('prop-1', undefined, 'a'.repeat(64)).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'PROPOSAL_DOCUMENT_STALE' });
  });

  it('a version id belonging to another Proposal is not found', async () => {
    const prisma: any = { proposalDocumentVersion: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(new ProposalDocumentService(prisma).loadVersion('prop-1', 'dv-of-prop-2')).rejects.toThrow('not found');
    expect(prisma.proposalDocumentVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'dv-of-prop-2', proposalId: 'prop-1' } }));
  });

  it('only a REJECTED Proposal can start a revision, and the old workflow stays bound to its version', async () => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'REJECTED' }]),
      approvalWorkflow: { findUnique: jest.fn().mockResolvedValue({ id: 'wf-1', documentVersionId: 'dv-1' }), update: jest.fn() },
      proposal: { update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const result = await new ProposalDocumentService(prisma).startRevision('prop-1', 'user-author');

    expect(result).toEqual({ proposalId: 'prop-1', previousDocumentVersionId: 'dv-1' });
    expect(tx.approvalWorkflow.update).toHaveBeenCalledWith({ where: { id: 'wf-1' }, data: { proposalId: null } });
    expect(tx.approvalWorkflow.update.mock.calls[0][0].data).not.toHaveProperty('documentVersionId');
    expect(tx.proposal.update).toHaveBeenCalledWith({ where: { id: 'prop-1' }, data: { status: 'DRAFT' } });

    tx.$queryRaw.mockResolvedValue([{ status: 'SUBMITTED' }]);
    tx.approvalWorkflow.update.mockClear();
    await expect(new ProposalDocumentService(prisma).startRevision('prop-1', 'u')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.approvalWorkflow.update).not.toHaveBeenCalled();
  });
});

describe('PROP-FINAL-012 approval PDF uses the workflow-bound version', () => {
  it('the exact-version PDF endpoint renders that version, not the live Proposal', async () => {
    const versionModel: any = { proposalNumber: 'PRO-1', version: { id: 'dv-1', versionNumber: 1, liveDiffers: true }, sync: { sourceFingerprint: 'f'.repeat(64), documentStale: false } };
    const documents: any = { getVersionDocument: jest.fn().mockResolvedValue(versionModel), getLiveDocument: jest.fn(), getDocument: jest.fn() };
    const pdf: any = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF-')) };
    const mallAccess: any = { extractAndValidateMallAccess: jest.fn() };
    const res: any = { set: jest.fn(), end: jest.fn() };
    const controller = new ProposalsController({} as any, pdf, {} as any, mallAccess, documents, {} as any);

    await controller.exportVersionPdf('prop-1', 'dv-1', res, { id: 'approver', role: 'FINANCE' });

    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('approver', 'FINANCE', { proposalId: 'prop-1' });
    expect(documents.getVersionDocument).toHaveBeenCalledWith('prop-1', 'dv-1');
    expect(documents.getLiveDocument).not.toHaveBeenCalled();
    expect(pdf.render).toHaveBeenCalledWith(versionModel);
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
      'X-Proposal-Document-Version-Id': 'dv-1', 'X-Proposal-Live-Differs': 'true',
      'Content-Disposition': 'attachment; filename="proposal-PRO-1-v1.pdf"',
    }));
  });

  it('the current-document endpoint returns the bound version once submitted', async () => {
    const prisma: any = { proposal: { findUnique: jest.fn().mockResolvedValue({ status: 'UNDER_REVIEW', approvalWorkflow: { documentVersionId: 'dv-1' } }) } };
    const service = new ProposalDocumentService(prisma);
    const version = jest.spyOn(service, 'getVersionDocument').mockResolvedValue({ version: { id: 'dv-1' } } as any);
    const live = jest.spyOn(service, 'getLiveDocument');

    await service.getDocument('prop-1');

    expect(version).toHaveBeenCalledWith('prop-1', 'dv-1', prisma, {});
    expect(live).not.toHaveBeenCalled();
  });
});
