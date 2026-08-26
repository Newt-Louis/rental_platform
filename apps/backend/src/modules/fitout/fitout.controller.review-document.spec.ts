import { ForbiddenException } from '@nestjs/common';
import { FitoutController } from './fitout.controller';

// CR-101 Phase 3C (C4-01) -- controller-level evidence (not resolver-unit-level
// alone, per the authorization's explicit requirement) that reviewDocument's
// full chain is correct: Mall-authorizing the project does not, by itself,
// authorize an unrelated document -- the service is now called with BOTH the
// docId and the already-authorized projectId, and a Mall DENY still blocks the
// whole operation before the service is ever reached. The parent-child
// integrity check itself (does docId actually belong to projectId) is unit-
// tested directly in fitout-documents.service.spec.ts, where the fix lives.
describe('FitoutController.reviewDocument — CR-101 Phase 3C C4-01', () => {
  const documentsService: any = { reviewDocument: jest.fn() };
  const mallAccess: any = { extractAndValidateMallAccess: jest.fn() };
  const controller = new FitoutController(
    {} as any, // fitoutService
    documentsService,
    {} as any, // slaService
    {} as any, // contractorService
    {} as any, // stageConfigService
    {} as any, // formTypeService
    {} as any, // issueService
    {} as any, // dashboardService
    {} as any, // storageService
    mallAccess,
    {} as any, // accessPolicy
  );

  beforeEach(() => jest.clearAllMocks());

  it('authorizes the project, then calls the service with BOTH docId and the authorized projectId (not docId alone)', async () => {
    mallAccess.extractAndValidateMallAccess.mockResolvedValue(undefined);
    documentsService.reviewDocument.mockResolvedValue({ id: 'doc-A', status: 'APPROVED' });

    await controller.reviewDocument('project-A', 'doc-A', { decision: 'APPROVED', note: 'ok' }, { id: 'u1', role: 'OPERATION' });

    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'OPERATION', { fitoutProjectId: 'project-A' });
    expect(documentsService.reviewDocument).toHaveBeenCalledWith('doc-A', 'project-A', 'APPROVED', 'ok', 'u1');
  });

  it('a Mall DENY blocks the entire operation before the service is ever called (authorized parent alone is not enough)', async () => {
    mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());

    await expect(
      controller.reviewDocument('project-A', 'doc-B', { decision: 'APPROVED' }, { id: 'u1', role: 'OPERATION' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(documentsService.reviewDocument).not.toHaveBeenCalled();
  });

  it('ADMIN bypasses the Mall check (existing platform policy, unchanged) but the service call still carries the real projectId -- ADMIN cannot make an unrelated document eligible merely by bypassing Mall policy, since parent-child integrity is enforced independently in the service', async () => {
    mallAccess.extractAndValidateMallAccess.mockResolvedValue(undefined); // simulates BYPASS_ROLES short-circuit
    documentsService.reviewDocument.mockResolvedValue({ id: 'doc-A', status: 'APPROVED' });

    await controller.reviewDocument('project-A', 'doc-A', { decision: 'APPROVED' }, { id: 'admin-1', role: 'ADMIN' });

    // Even for ADMIN, the controller still passes the real, requested projectId
    // through unchanged -- it never substitutes a wildcard/bypass value that
    // would let the service's own findFirst({id, projectId}) match anything.
    expect(documentsService.reviewDocument).toHaveBeenCalledWith('doc-A', 'project-A', 'APPROVED', undefined, 'admin-1');
  });
});
