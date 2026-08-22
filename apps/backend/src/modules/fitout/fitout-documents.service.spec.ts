import { NotFoundException } from '@nestjs/common';
import { FitoutDocumentsService } from './fitout-documents.service';

// CR-101 Phase 3C (C4-01) -- confirmed ID-substitution bug: reviewDocument()
// previously looked up a document by its own id alone (`findUnique({id})`),
// with no check that it actually belonged to the project the caller was
// authorized for at the controller layer. Fixed to require `findFirst({id,
// projectId})`. This file proves the parent-child invariant directly at the
// service layer, where the fix lives -- the Mall-authorization layer above it
// (fitout.controller.ts's validateProject) is unchanged, already covered by
// mall-access.service.spec.ts's existing `fitoutProject` resolver tests, and
// not re-tested here.
describe('FitoutDocumentsService.reviewDocument — parent-child integrity (CR-101 Phase 3C C4-01)', () => {
  const prisma: any = {
    fitoutDocument: { findFirst: jest.fn(), update: jest.fn() },
  };
  const service = new FitoutDocumentsService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('ALLOW: Document A belongs to Project A -- review proceeds', async () => {
    prisma.fitoutDocument.findFirst.mockResolvedValue({ id: 'doc-A', projectId: 'project-A' });
    prisma.fitoutDocument.update.mockResolvedValue({ id: 'doc-A', status: 'APPROVED' });

    await service.reviewDocument('doc-A', 'project-A', 'APPROVED', 'looks good', 'user-1');

    expect(prisma.fitoutDocument.findFirst).toHaveBeenCalledWith({ where: { id: 'doc-A', projectId: 'project-A' } });
    expect(prisma.fitoutDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc-A' },
      data: { status: 'APPROVED', reviewNote: 'looks good', reviewedById: 'user-1', reviewedAt: expect.any(Date) },
    });
  });

  it('DENY (same-Mall cross-project): Document B belongs to Project B, not the authorized Project A -- safe failure, no update performed', async () => {
    // The mock simulates the real compound-where query: findFirst with
    // {id: 'doc-B', projectId: 'project-A'} finds nothing, because doc-B's
    // actual projectId is 'project-B', not 'project-A'.
    prisma.fitoutDocument.findFirst.mockResolvedValue(null);

    await expect(
      service.reviewDocument('doc-B', 'project-A', 'APPROVED', undefined, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.fitoutDocument.findFirst).toHaveBeenCalledWith({ where: { id: 'doc-B', projectId: 'project-A' } });
    expect(prisma.fitoutDocument.update).not.toHaveBeenCalled();
  });

  it('DENY (cross-Mall via a different project): Document C belongs to Project C in a different Mall -- same safe failure, no Mall-specific branching needed at this layer', async () => {
    // Cross-Mall is structurally the same case as cross-project at this layer:
    // the compound findFirst simply finds no row, regardless of which Mall the
    // mismatched project happens to be in. The Mall dimension itself is
    // enforced one layer up (validateProject), unchanged by this fix.
    prisma.fitoutDocument.findFirst.mockResolvedValue(null);

    await expect(
      service.reviewDocument('doc-C', 'project-A', 'REJECTED', undefined, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.fitoutDocument.update).not.toHaveBeenCalled();
  });

  it('SAFE FAILURE: unknown docId under a valid project', async () => {
    prisma.fitoutDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.reviewDocument('doc-ghost', 'project-A', 'APPROVED', undefined, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('SAFE FAILURE: unknown projectId with an otherwise-valid docId', async () => {
    prisma.fitoutDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.reviewDocument('doc-A', 'project-ghost', 'APPROVED', undefined, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
