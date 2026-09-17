/**
 * Proposal governance — explicit document review (PROP-REVIEW) and historical
 * decision identity (PROP-HIST). Real-Postgres proofs are in the runtime journey.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ConflictException } from '@nestjs/common';
import { StepStatus, WorkflowStatus } from '@prisma/client';
import {
  buildFacts,
  buildProposalDocument,
  buildVersionDocument,
  computeSourceFingerprint,
  snapshotForVersion,
} from './proposal-document.mapper';
import { proposalDocumentSource } from './proposal-document.fixture';
import { ProposalDocumentService } from './proposal-document.service';
import { buildProposalDocDefinition, ProposalPdfService } from '../proposal-pdf.service';
import { ApprovalsService } from '../../approvals/approvals.service';

const NOW = new Date('2026-09-15T02:00:00.000Z');
const REVIEWER = { id: 'user-author', fullName: 'Nguyễn Thị Lập', isActive: true, deletedAt: null };

function reviewedAgainst(src: ReturnType<typeof proposalDocumentSource>, over: any = {}) {
  return {
    ...src,
    reviewer: REVIEWER,
    editorContent: {
      schemaVersion: 2, content: {}, sourceFingerprint: computeSourceFingerprint(buildFacts(src)),
      contentVersion: 1, savedAt: '2026-09-14T02:00:00.000Z', savedById: 'user-author',
    },
    ...over,
  };
}

describe('PROP-REVIEW document review gate', () => {
  it('PROP-REVIEW-001 a document never saved is NOT_REVIEWED, even though it can be generated', () => {
    const doc = buildProposalDocument(proposalDocumentSource(), NOW);
    expect(doc.items.length).toBeGreaterThan(0);
    expect(doc.sync).toMatchObject({ reviewState: 'NOT_REVIEWED', reviewedFingerprint: null, reviewedAt: null, reviewedById: null });
  });

  it('PROP-REVIEW-004 a save against today’s fingerprint by an active user is REVIEWED, with who and when', () => {
    const doc = buildProposalDocument(reviewedAgainst(proposalDocumentSource()) as any, NOW);
    expect(doc.sync).toMatchObject({
      reviewState: 'REVIEWED', reviewedById: 'user-author', reviewedByName: 'Nguyễn Thị Lập', reviewedAt: '2026-09-14T02:00:00.000Z',
    });
  });

  it('PROP-REVIEW-005 changing the Proposal after review makes the review STALE', () => {
    const src = proposalDocumentSource();
    const doc = buildProposalDocument({ ...reviewedAgainst(src), rentPerSqm: 999_000 } as any, NOW);
    expect(doc.sync.reviewState).toBe('STALE');
  });

  it('PROP-REVIEW-007 reviewing the changed data again makes it REVIEWED', () => {
    const changed = proposalDocumentSource({ rentPerSqm: 999_000 });
    expect(buildProposalDocument(reviewedAgainst(changed) as any, NOW).sync.reviewState).toBe('REVIEWED');
  });

  it('a default-looking document with no save is still not reviewed', () => {
    const src = proposalDocumentSource();
    const doc = buildProposalDocument({ ...src, reviewer: REVIEWER } as any, NOW);
    expect(doc.sync.reviewState).toBe('NOT_REVIEWED');
  });

  it('a review used by an earlier submission does not authorise the next one', () => {
    const src = proposalDocumentSource();
    const doc = buildProposalDocument(reviewedAgainst(src, { lastSubmittedAt: '2026-09-14T05:00:00.000Z' }) as any, NOW);
    expect(doc.sync.reviewState).toBe('NOT_REVIEWED');
  });

  it('a review by a user who is now locked or deleted is not valid review evidence', () => {
    const src = proposalDocumentSource();
    expect(buildProposalDocument(reviewedAgainst(src, { reviewer: { ...REVIEWER, isActive: false } }) as any, NOW).sync.reviewState).toBe('NOT_REVIEWED');
    expect(buildProposalDocument(reviewedAgainst(src, { reviewer: { ...REVIEWER, deletedAt: new Date() } }) as any, NOW).sync.reviewState).toBe('NOT_REVIEWED');
    expect(buildProposalDocument(reviewedAgainst(src, { reviewer: null }) as any, NOW).sync.reviewState).toBe('NOT_REVIEWED');
  });

  describe('through ProposalDocumentService', () => {
    function service(row: any) {
      const writes = { proposalUpdate: jest.fn() };
      const client: any = {
        $queryRaw: jest.fn(async () => [{ id: row.id, status: row.status, editorContent: row.editorContent }]),
        proposal: {
          findUnique: jest.fn(async () => { const { creator, reviewer, ...rest } = row; return rest; }),
          update: jest.fn(async (a: any) => writes.proposalUpdate(a)),
        },
        user: { findUnique: jest.fn(async ({ where }: any) => (where.id === row.creator.id ? { ...row.creator, isActive: true, deletedAt: null } : null)) },
        proposalDocumentVersion: { findFirst: jest.fn(async () => null) },
        auditLog: { create: jest.fn() },
        proposalVersion: { findFirst: jest.fn(), create: jest.fn() },
      };
      const prisma: any = { ...client, $transaction: jest.fn(async (fn: any) => fn(client)) };
      return { svc: new ProposalDocumentService(prisma), writes };
    }

    it('PROP-REVIEW-008/009 opening the editor (GET document) never writes and never marks reviewed', async () => {
      const { svc, writes } = service(proposalDocumentSource());
      for (let i = 0; i < 3; i++) expect((await svc.getDocument('prop-1')).sync.reviewState).toBe('NOT_REVIEWED');
      expect(writes.proposalUpdate).not.toHaveBeenCalled();
    });

    it('PROP-REVIEW-010 a failed save leaves the document unreviewed', async () => {
      const { svc, writes } = service(proposalDocumentSource());
      const err = await svc.saveContent('prop-1', { expectedContentVersion: 7, reviewedFingerprint: 'a'.repeat(64), content: {} }, 'user-author').catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(writes.proposalUpdate).not.toHaveBeenCalled();
      expect((await svc.getDocument('prop-1')).sync.reviewState).toBe('NOT_REVIEWED');
    });
  });
});

describe('PROP-HIST historical decision identity', () => {
  const baseSteps = () => [
    { id: 's1', stepOrder: 1, stepName: 'Leasing Manager Approval', approverRole: 'LEASING_MANAGER', approverId: 'u-m', approver: { id: 'u-m', fullName: 'Trần Thị B' },
      status: 'APPROVED', decidedAt: new Date('2026-09-11T02:00:00.000Z'), comment: 'Đồng ý', decidedByUserId: 'u-m', decidedByDisplayName: 'Trần Thị B' },
    { id: 's2', stepOrder: 2, stepName: 'Finance Review', approverRole: 'FINANCE', approverId: 'u-f', approver: { id: 'u-f', fullName: 'Phạm Thị D' },
      status: 'PENDING', decidedAt: null, comment: null, decidedByUserId: null, decidedByDisplayName: null },
  ];
  const version = (steps: any[]) => {
    const src = proposalDocumentSource();
    return {
      id: 'dv-1', proposalId: 'prop-1', versionNumber: 1, status: 'SUBMITTED',
      ...snapshotForVersion(buildProposalDocument(src, NOW), 'Nguyễn Thị Lập'), submittedById: 'user-author', submittedAt: new Date('2026-09-10T02:00:00.000Z'),
      approvalWorkflow: { id: 'wf-1', status: 'IN_PROGRESS', createdAt: new Date('2026-09-10T02:00:00.000Z'), steps },
    } as any;
  };
  const renamed = (steps: any[]) => steps.map((s) => ({ ...s, approver: s.approver && { ...s.approver, fullName: `${s.approver.fullName} (ĐÃ ĐỔI TÊN)` } }));

  function claimHarness() {
    const workflow = {
      id: 'wf-1', status: WorkflowStatus.IN_PROGRESS, entityType: 'PROPOSAL', entityId: 'prop-1', documentVersionId: 'dv-1',
      proposal: { id: 'prop-1', createdById: 'user-author' },
      documentVersion: { id: 'dv-1', status: 'SUBMITTED', proposal: { id: 'prop-1', createdById: 'user-author' } },
      steps: [
        { id: 'step-1', stepOrder: 1, status: StepStatus.PENDING, approverRole: 'LEASING_MANAGER', approverId: 'u-m' },
        { id: 'step-2', stepOrder: 2, status: StepStatus.PENDING, approverRole: 'FINANCE', approverId: 'u-f' },
      ],
    };
    const tx: any = {
      approvalStep: {
        findUnique: jest.fn(async ({ where }: any) => ({ ...workflow.steps.find((s) => s.id === where.id), workflowId: 'wf-1', workflow })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      approvalWorkflow: { update: jest.fn() },
      user: { findUnique: jest.fn(async () => ({ fullName: 'Trần Thị B' })) },
    };
    const prisma: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    return { svc: new ApprovalsService(prisma, { emit: jest.fn() } as any, { enqueue: jest.fn() } as any), tx };
  }

  it('PROP-HIST-001 approving stores who decided, as named at that moment', async () => {
    const h = claimHarness();
    await h.svc.approve('step-1', 'u-m', 'LEASING_MANAGER', 'Đồng ý');
    expect(h.tx.approvalStep.updateMany).toHaveBeenCalledWith({
      where: { id: 'step-1', status: StepStatus.PENDING },
      data: expect.objectContaining({ status: StepStatus.APPROVED, decidedByUserId: 'u-m', decidedByDisplayName: 'Trần Thị B', decidedAt: expect.any(Date) }),
    });
  });

  it('PROP-HIST-002 rejecting stores the same evidence', async () => {
    const h = claimHarness();
    await h.svc.reject('step-1', 'u-m', 'LEASING_MANAGER', 'Giá thấp');
    expect(h.tx.approvalStep.updateMany.mock.calls[0][0].data).toMatchObject({ status: StepStatus.REJECTED, decidedByUserId: 'u-m', decidedByDisplayName: 'Trần Thị B' });
  });

  it('PROP-HIST-003 decision evidence is written only by claiming a still-PENDING step', async () => {
    const h = claimHarness();
    h.tx.approvalStep.updateMany.mockResolvedValue({ count: 0 });
    await expect(h.svc.approve('step-1', 'u-m', 'LEASING_MANAGER')).rejects.toBeInstanceOf(ConflictException);
    expect(h.tx.approvalStep.updateMany.mock.calls[0][0].where).toEqual({ id: 'step-1', status: StepStatus.PENDING });
  });

  it('PROP-HIST-004/007 a decided step keeps its snapshot after a rename; a pending step shows the current assignee', () => {
    const doc = buildVersionDocument(version(renamed(baseSteps())), { proposalStatus: 'UNDER_REVIEW' });
    expect(doc.approval.steps[0]).toMatchObject({ approverName: 'Trần Thị B', identitySource: 'DECISION_SNAPSHOT' });
    expect(doc.approval.steps[1]).toMatchObject({ approverName: 'Phạm Thị D (ĐÃ ĐỔI TÊN)', identitySource: 'ASSIGNED_APPROVER' });
  });

  it('PROP-HIST-005/006 the historical PDF text and bytes survive renaming the decider', async () => {
    const asOf = new Date('2026-09-12T00:00:00.000Z');
    const stepsBefore = baseSteps().map((s) => (s.status === 'PENDING' ? { ...s, approver: { ...s.approver! } } : s));
    const before = buildVersionDocument(version(stepsBefore), { proposalStatus: 'UNDER_REVIEW', asOf });
    const afterSteps = baseSteps().map((s) => (s.id === 's1' ? { ...s, approver: { id: 'u-m', fullName: 'Trần Thị B (ĐÃ ĐỔI TÊN)' } } : s));
    const after = buildVersionDocument(version(afterSteps), { proposalStatus: 'UNDER_REVIEW', asOf });

    const text = (m: any) => JSON.stringify(buildProposalDocDefinition(m));
    expect(text(after)).toContain('Trần Thị B');
    expect(text(after)).not.toContain('ĐÃ ĐỔI TÊN');
    const pdf = new ProposalPdfService();
    const [a, b] = [await pdf.render(before), await pdf.render(after)];
    expect(a.equals(b)).toBe(true);
  }, 60_000);

  it('PROP-HIST-008 version 2 carries only its own workflow evidence', () => {
    const v2 = version([{ ...baseSteps()[1], id: 's9', stepOrder: 1 }]);
    const doc = buildVersionDocument(v2, { proposalStatus: 'SUBMITTED' });
    expect(doc.approval.steps.map((s) => s.approverName)).toEqual(['Phạm Thị D']);
    expect(JSON.stringify(doc.approval)).not.toContain('Đồng ý');
  });

  it('PROP-HIST-009 a legacy decided row without a snapshot is flagged, not presented as exact history', () => {
    const legacy = baseSteps().map((s) => (s.id === 's1' ? { ...s, decidedByDisplayName: null, decidedByUserId: null } : s));
    const doc = buildVersionDocument(version(legacy), { proposalStatus: 'UNDER_REVIEW' });
    expect(doc.approval.steps[0]).toMatchObject({ approverName: 'Trần Thị B', identitySource: 'LEGACY_UNSNAPSHOTTED' });
  });

  it('PROP-HIST-010 no runtime path rewrites a decided approval step', () => {
    const root = path.join(__dirname, '..', '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          const src = fs.readFileSync(full, 'utf8');
          const writes = src.match(/approvalStep\.(update|updateMany|upsert)\(/g) ?? [];
          if (writes.length) offenders.push(`${path.relative(root, full)}:${writes.length}`);
        }
      }
    };
    walk(root);
    // Besides the decision claim, only two writers touch steps, and both are
    // limited to steps still PENDING: moving a pending step to a replacement
    // approver, and skipping pending steps when a submission is withdrawn.
    expect(offenders.sort()).toEqual([
      `approvals${path.sep}approver-replacement.service.ts:1`,
      `approvals${path.sep}approvals.service.ts:1`,
      `proposals${path.sep}document${path.sep}proposal-document.service.ts:1`,
    ].sort());
    const position = fs.readFileSync(path.join(root, 'approvals', 'approver-replacement.service.ts'), 'utf8');
    expect(position).toMatch(/approvalStep\.updateMany\(\{\s*where: \{ id: step\.id, status: StepStatus\.PENDING \}/);
    const revision = fs.readFileSync(path.join(root, 'proposals', 'document', 'proposal-document.service.ts'), 'utf8');
    expect(revision).toMatch(/approvalStep\.updateMany\(\{\s*where: \{ workflowId: workflow\.id, status: StepStatus\.PENDING \}/);
    const approvals = fs.readFileSync(path.join(root, 'approvals', 'approvals.service.ts'), 'utf8');
    expect(approvals).toMatch(/where: \{ id: stepId, status: StepStatus\.PENDING \}/);
  });
});
