import { ForbiddenException, StreamableFile } from '@nestjs/common';
import { Readable } from 'stream';
import { FilesController } from './files.controller';

function fakeRes() {
  return { set: jest.fn() } as any;
}

describe('FilesController — authenticated, authorized document downloads', () => {
  const prisma: any = {
    contractFile: { findUnique: jest.fn() },
    unifiedDocument: { findUnique: jest.fn(), update: jest.fn() },
    invoice: { findUnique: jest.fn() },
    ticket: { findUnique: jest.fn() },
    fitoutDocument: { findUnique: jest.fn() },
    parkingContractDocument: { findUnique: jest.fn() },
    serviceContractDocument: { findUnique: jest.fn() },
    workOrderEvidence: { findUnique: jest.fn() },
    patrolCheck: { findUnique: jest.fn() },
    maintenanceExecution: { findUnique: jest.fn() },
  };
  const storage: any = { getFileStream: jest.fn() };
  // CR-101 Phase 3C (C2): FilesController now also calls MallAccessService for
  // the Contract/Invoice/Ticket/Fitout* families. Every pre-existing test below
  // exercises the tenant/role logic and is not about Mall access, so the mock
  // defaults to ALLOW (resolves) in beforeEach -- this preserves every existing
  // test's asserted outcome unchanged (Section 14: only unauthorized-Mall-access
  // behavior should change). The new "Mall access (CR-101 Phase 3C C2)" describe
  // blocks below override this per-test to prove the DENY path.
  const mallAccess: any = { extractAndValidateMallAccess: jest.fn() };
  let controller: FilesController;

  beforeEach(() => {
    jest.clearAllMocks();
    storage.getFileStream.mockReturnValue(Readable.from(['file-bytes']));
    mallAccess.extractAndValidateMallAccess.mockResolvedValue(undefined);
    controller = new FilesController(prisma, storage, mallAccess);
  });

  describe('contracts/:fileId', () => {
    const file = { id: 'f1', contractId: 'c1', fileName: 'lease.pdf', fileType: 'application/pdf', filePath: 'contracts/c1/lease.pdf', contract: { tenantId: 'tenant-A' } };

    it('streams for a staff role regardless of tenant', async () => {
      prisma.contractFile.findUnique.mockResolvedValue(file);
      const result = await controller.downloadContractFile('f1', { id: 'u1', role: 'LEASING_MANAGER' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
      expect(storage.getFileStream).toHaveBeenCalledWith('contracts/c1/lease.pdf');
    });

    it('allows the owning tenant', async () => {
      prisma.contractFile.findUnique.mockResolvedValue(file);
      const result = await controller.downloadContractFile('f1', { id: 'u1', role: 'TENANT', tenantId: 'tenant-A' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('rejects a different tenant', async () => {
      prisma.contractFile.findUnique.mockResolvedValue(file);
      await expect(
        controller.downloadContractFile('f1', { id: 'u1', role: 'TENANT', tenantId: 'tenant-B' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('404s when the file record does not exist', async () => {
      prisma.contractFile.findUnique.mockResolvedValue(null);
      await expect(
        controller.downloadContractFile('missing', { id: 'u1', role: 'ADMIN' }, fakeRes()),
      ).rejects.toThrow('Tài liệu không tồn tại');
    });
  });

  describe('documents/:fileId (UnifiedDocument)', () => {
    it('checks invoice tenant ownership and increments downloadCount', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd1', entityType: 'INVOICE', entityId: 'inv-1', isActive: true, fileName: 'invoice.pdf', mimeType: 'application/pdf', filePath: 'billing/invoices/inv-1/invoice.pdf' });
      prisma.invoice.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      const result = await controller.downloadUnifiedDocument('d1', { id: 'u1', role: 'TENANT', tenantId: 'tenant-A' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
      expect(prisma.unifiedDocument.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { downloadCount: { increment: 1 } } });
    });

    it('rejects a staff role with no billing access from downloading an invoice document (Phase 4 fix — used to allow any authenticated non-tenant role)', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd1', entityType: 'INVOICE', entityId: 'inv-1', isActive: true, fileName: 'invoice.pdf', filePath: 'x' });
      prisma.invoice.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      await expect(
        controller.downloadUnifiedDocument('d1', { id: 'u1', role: 'OPERATION' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('allows FINANCE to download an invoice document', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd1', entityType: 'INVOICE', entityId: 'inv-1', isActive: true, fileName: 'invoice.pdf', mimeType: 'application/pdf', filePath: 'x' });
      prisma.invoice.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      const result = await controller.downloadUnifiedDocument('d1', { id: 'u1', role: 'FINANCE' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('rejects a tenant that does not own the invoice', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd1', entityType: 'INVOICE', entityId: 'inv-1', isActive: true, fileName: 'invoice.pdf', filePath: 'x' });
      prisma.invoice.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      await expect(
        controller.downloadUnifiedDocument('d1', { id: 'u1', role: 'TENANT', tenantId: 'tenant-B' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('checks ticket tenant ownership', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd2', entityType: 'TICKET', entityId: 't-1', isActive: true, fileName: 'photo.jpg', filePath: 'tickets/t-1/photo.jpg' });
      prisma.ticket.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      await expect(
        controller.downloadUnifiedDocument('d2', { id: 'u1', role: 'TENANT', tenantId: 'tenant-B' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('rejects TENANT on fitout submittal/issue/daily-report documents (staff-only surfaces)', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd3', entityType: 'FITOUT_SUBMITTAL', entityId: 's-1', isActive: true, fileName: 'drawing.pdf', filePath: 'fitout-submittal/s-1/drawing.pdf' });
      await expect(
        controller.downloadUnifiedDocument('d3', { id: 'u1', role: 'TENANT', tenantId: 'tenant-A' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('allows OPERATION on fitout issue documents', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd4', entityType: 'FITOUT_ISSUE', entityId: 'i-1', isActive: true, fileName: 'defect.jpg', filePath: 'fitout-issue/i-1/defect.jpg' });
      const result = await controller.downloadUnifiedDocument('d4', { id: 'u1', role: 'OPERATION' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('404s on an inactive or unknown document', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd5', entityType: 'INVOICE', isActive: false });
      await expect(
        controller.downloadUnifiedDocument('d5', { id: 'u1', role: 'ADMIN' }, fakeRes()),
      ).rejects.toThrow('Tài liệu không tồn tại');
    });

    it('404s on an unrecognized entityType rather than streaming blindly', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd6', entityType: 'SOMETHING_NEW', isActive: true });
      await expect(
        controller.downloadUnifiedDocument('d6', { id: 'u1', role: 'ADMIN' }, fakeRes()),
      ).rejects.toThrow('Loại tài liệu không được hỗ trợ');
    });
  });

  describe('fitout-documents/:fileId', () => {
    it('allows the owning tenant', async () => {
      prisma.fitoutDocument.findUnique.mockResolvedValue({ id: 'fd1', projectId: 'p1', fileName: 'permit.pdf', filePath: 'fitout/p1/permit.pdf', project: { tenantId: 'tenant-A' } });
      const result = await controller.downloadFitoutDocument('fd1', { id: 'u1', role: 'TENANT', tenantId: 'tenant-A' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('rejects a different tenant', async () => {
      prisma.fitoutDocument.findUnique.mockResolvedValue({ id: 'fd1', projectId: 'p1', fileName: 'permit.pdf', filePath: 'x', project: { tenantId: 'tenant-A' } });
      await expect(
        controller.downloadFitoutDocument('fd1', { id: 'u1', role: 'TENANT', tenantId: 'tenant-B' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('rejects a staff role outside fitout-relevant roles (e.g. FINANCE)', async () => {
      prisma.fitoutDocument.findUnique.mockResolvedValue({ id: 'fd1', projectId: 'p1', fileName: 'permit.pdf', filePath: 'x', project: { tenantId: 'tenant-A' } });
      await expect(
        controller.downloadFitoutDocument('fd1', { id: 'u1', role: 'FINANCE' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });
  });

  // CR-101 Phase 3C (C2): Mall-access coverage for the 4 routes/7 branches
  // remediated this batch. Proves the "file-first" invariant (Section 3 of the
  // authorization): Mall is resolved from the file's OWN owner reference, and a
  // DENY from MallAccessService blocks the stream entirely -- the underlying
  // resolver logic itself (DENY on cross-Mall, ALLOW on same-Mall, bypass roles
  // skip the check) is separately covered by mall-access.service.spec.ts's
  // existing parameterized tests for `contract`/`invoice`/`ticket`/
  // `fitoutSubmittal`/`fitoutIssue`/`fitoutDailyReportEntry`/`fitoutProject` --
  // this file only proves the ROUTE calls the right resolver with the right id
  // and correctly propagates a denial.
  describe('Mall access (CR-101 Phase 3C C2)', () => {
    it('contracts/:fileId calls extractAndValidateMallAccess with the file\'s OWN contractId, and blocks the stream on denial', async () => {
      prisma.contractFile.findUnique.mockResolvedValue({ id: 'f1', contractId: 'c1', fileName: 'lease.pdf', fileType: 'application/pdf', filePath: 'x', contract: { tenantId: 'tenant-A' } });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadContractFile('f1', { id: 'u1', role: 'LEASING_MANAGER' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'LEASING_MANAGER', { contractId: 'c1' });
      expect(storage.getFileStream).not.toHaveBeenCalled();
    });

    it('documents/:fileId (INVOICE) calls extractAndValidateMallAccess with the invoice entityId, and blocks the stream on denial', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd1', entityType: 'INVOICE', entityId: 'inv-1', isActive: true, fileName: 'invoice.pdf', filePath: 'x' });
      prisma.invoice.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadUnifiedDocument('d1', { id: 'u1', role: 'FINANCE' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'FINANCE', { invoiceId: 'inv-1' });
    });

    it('documents/:fileId (TICKET) calls extractAndValidateMallAccess with the ticket entityId, and blocks the stream on denial', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd2', entityType: 'TICKET', entityId: 't-1', isActive: true, fileName: 'photo.jpg', filePath: 'x' });
      prisma.ticket.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadUnifiedDocument('d2', { id: 'u1', role: 'TENANT', tenantId: 'tenant-A' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'TENANT', { ticketId: 't-1' });
    });

    it('documents/:fileId (FITOUT_SUBMITTAL) calls extractAndValidateMallAccess with the submittal entityId, and blocks the stream on denial', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd3', entityType: 'FITOUT_SUBMITTAL', entityId: 's-1', isActive: true, fileName: 'drawing.pdf', filePath: 'x' });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadUnifiedDocument('d3', { id: 'u1', role: 'OPERATION' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'OPERATION', { fitoutSubmittalId: 's-1' });
    });

    it('documents/:fileId (FITOUT_ISSUE) calls extractAndValidateMallAccess with the issue entityId, and blocks the stream on denial', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd4', entityType: 'FITOUT_ISSUE', entityId: 'i-1', isActive: true, fileName: 'defect.jpg', filePath: 'x' });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadUnifiedDocument('d4', { id: 'u1', role: 'OPERATION' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'OPERATION', { fitoutIssueId: 'i-1' });
    });

    it('documents/:fileId (FITOUT_DAILY_REPORT) calls extractAndValidateMallAccess with the entry entityId, and blocks the stream on denial', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd7', entityType: 'FITOUT_DAILY_REPORT', entityId: 'e-1', isActive: true, fileName: 'progress.jpg', filePath: 'x' });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadUnifiedDocument('d7', { id: 'u1', role: 'OPERATION' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'OPERATION', { fitoutDailyReportEntryId: 'e-1' });
    });

    it('fitout-documents/:fileId calls extractAndValidateMallAccess with the file\'s OWN projectId, and blocks the stream on denial', async () => {
      prisma.fitoutDocument.findUnique.mockResolvedValue({ id: 'fd1', projectId: 'p1', fileName: 'permit.pdf', filePath: 'x', project: { tenantId: 'tenant-A' } });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadFitoutDocument('fd1', { id: 'u1', role: 'OPERATION' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'OPERATION', { fitoutProjectId: 'p1' });
    });

    it('same-Mall ALLOW still streams normally once Mall access resolves (regression: the new check does not break the happy path)', async () => {
      prisma.contractFile.findUnique.mockResolvedValue({ id: 'f1', contractId: 'c1', fileName: 'lease.pdf', fileType: 'application/pdf', filePath: 'contracts/c1/lease.pdf', contract: { tenantId: 'tenant-A' } });
      mallAccess.extractAndValidateMallAccess.mockResolvedValue(undefined);
      const result = await controller.downloadContractFile('f1', { id: 'u1', role: 'LEASING_MANAGER' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('ADMIN/CEO/TENANT bypass roles still reach the stream (MallAccessService itself handles the bypass -- this proves the route does not add a redundant/conflicting check)', async () => {
      prisma.contractFile.findUnique.mockResolvedValue({ id: 'f1', contractId: 'c1', fileName: 'lease.pdf', fileType: 'application/pdf', filePath: 'contracts/c1/lease.pdf', contract: { tenantId: 'tenant-A' } });
      mallAccess.extractAndValidateMallAccess.mockResolvedValue(undefined); // simulates BYPASS_ROLES short-circuit inside the real service
      const result = await controller.downloadContractFile('f1', { id: 'u1', role: 'ADMIN' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

  });

  // CR-101 Phase 3C (C3): Mall-access coverage for the 5 remaining families --
  // Parking, Service Contract, Work Order, Patrol, Maintenance. Same shape as
  // the C2 block above: proves each route calls the correct resolver with the
  // file's OWN owner reference and that a DENY blocks the stream. Patrol is the
  // precisely-confirmed gap from the readiness review (the pre-existing
  // `checkMallId()` helper was never called from this route) -- folded into
  // MallAccessService as the new `patrolCheck` resolver rather than importing
  // PatrolService into FilesController, keeping one canonical mechanism.
  describe('Mall access (CR-101 Phase 3C C3)', () => {
    it('parking-contract-documents/:fileId calls extractAndValidateMallAccess with the file\'s OWN contractId, and blocks the stream on denial', async () => {
      prisma.parkingContractDocument.findUnique.mockResolvedValue({ id: 'p1', contractId: 'pc1', fileName: 'x.pdf', mimeType: 'application/pdf', filePath: 'x' });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadParkingContractDocument('p1', { id: 'u1', role: 'FINANCE' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'FINANCE', { parkingCustomerContractId: 'pc1' });
      expect(storage.getFileStream).not.toHaveBeenCalled();
    });

    it('service-contract-documents/:fileId calls extractAndValidateMallAccess with the file\'s OWN contractId, and blocks the stream on denial', async () => {
      prisma.serviceContractDocument.findUnique.mockResolvedValue({ id: 's1', contractId: 'sc1', fileName: 'x.pdf', mimeType: 'application/pdf', filePath: 'x' });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadServiceContractDocument('s1', { id: 'u1', role: 'LEGAL' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'LEGAL', { serviceContractId: 'sc1' });
    });

    it('work-order-evidence/:fileId calls extractAndValidateMallAccess with the file\'s OWN workOrderId, and blocks the stream on denial', async () => {
      prisma.workOrderEvidence.findUnique.mockResolvedValue({ id: 'w1', workOrderId: 'wo1', fileName: 'x.pdf', mimeType: 'application/pdf', filePath: 'x' });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadWorkOrderEvidence('w1', { id: 'u1', role: 'OPERATION' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'OPERATION', { workOrderId: 'wo1' });
    });

    it('patrol-checks/:fileId calls extractAndValidateMallAccess with the check\'s own id (patrolCheck resolver), and blocks the stream on denial -- this is the precisely-confirmed gap from the readiness review', async () => {
      prisma.patrolCheck.findUnique.mockResolvedValue({ id: 'pc1', fileName: 'evidence.jpg', mimeType: 'image/jpeg', filePath: 'x' });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadPatrolCheckFile('pc1', { id: 'u1', role: 'OPERATION' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'OPERATION', { patrolCheckId: 'pc1' });
    });

    it('maintenance-evidence/:executionId/:fileName calls extractAndValidateMallAccess with the execution\'s OWN scheduleId, and blocks the stream on denial', async () => {
      prisma.maintenanceExecution.findUnique.mockResolvedValue({ id: 'e1', scheduleId: 'ms1', evidenceUrls: ['/uploads/maintenance/e1/photo1.jpg'] });
      mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.downloadMaintenanceEvidence('e1', 'photo1.jpg', { id: 'u1', role: 'OPERATION' }, fakeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'OPERATION', { maintenanceScheduleId: 'ms1' });
    });

    it('same-Mall ALLOW still streams normally for a C3 family once Mall access resolves', async () => {
      prisma.workOrderEvidence.findUnique.mockResolvedValue({ id: 'w1', workOrderId: 'wo1', fileName: 'x.pdf', mimeType: 'application/pdf', filePath: 'work-orders/wo1/x.pdf' });
      mallAccess.extractAndValidateMallAccess.mockResolvedValue(undefined);
      const result = await controller.downloadWorkOrderEvidence('w1', { id: 'u1', role: 'OPERATION' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('ADMIN bypasses a C3 family\'s Mall check and still streams', async () => {
      prisma.patrolCheck.findUnique.mockResolvedValue({ id: 'pc1', fileName: 'evidence.jpg', mimeType: 'image/jpeg', filePath: 'patrol/pc1/evidence.jpg' });
      mallAccess.extractAndValidateMallAccess.mockResolvedValue(undefined);
      const result = await controller.downloadPatrolCheckFile('pc1', { id: 'u1', role: 'ADMIN' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });
  });

  describe('role-only gated routes (no tenant access to these modules at all)', () => {
    it('parking-contract-documents rejects LEASING_EXECUTIVE (not a parking role)', async () => {
      await expect(
        controller.downloadParkingContractDocument('x', { id: 'u1', role: 'LEASING_EXECUTIVE' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
      expect(prisma.parkingContractDocument.findUnique).not.toHaveBeenCalled();
    });

    it('parking-contract-documents allows FINANCE', async () => {
      prisma.parkingContractDocument.findUnique.mockResolvedValue({ id: 'p1', fileName: 'x.pdf', mimeType: 'application/pdf', filePath: 'parking-contracts/c1/x.pdf' });
      const result = await controller.downloadParkingContractDocument('p1', { id: 'u1', role: 'FINANCE' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('service-contract-documents rejects OPERATION-excluded... allows OPERATION per role set, rejects TENANT', async () => {
      await expect(
        controller.downloadServiceContractDocument('x', { id: 'u1', role: 'TENANT' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('work-order-evidence rejects FINANCE (not a work-order role)', async () => {
      await expect(
        controller.downloadWorkOrderEvidence('x', { id: 'u1', role: 'FINANCE' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('patrol-checks rejects LEGAL', async () => {
      await expect(
        controller.downloadPatrolCheckFile('x', { id: 'u1', role: 'LEGAL' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('ADMIN always bypasses the role list', async () => {
      prisma.patrolCheck.findUnique.mockResolvedValue({ id: 'pc1', fileName: 'evidence.jpg', mimeType: 'image/jpeg', filePath: 'patrol/pc1/evidence.jpg' });
      const result = await controller.downloadPatrolCheckFile('pc1', { id: 'u1', role: 'ADMIN' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });
  });

  describe('maintenance-evidence/:executionId/:fileName', () => {
    it('streams a filename that is actually part of the execution\'s evidence', async () => {
      prisma.maintenanceExecution.findUnique.mockResolvedValue({ id: 'e1', evidenceUrls: ['/uploads/maintenance/e1/photo1.jpg'] });
      const result = await controller.downloadMaintenanceEvidence('e1', 'photo1.jpg', { id: 'u1', role: 'OPERATION' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('rejects a filename not present in evidenceUrls, even for an otherwise-authorized role', async () => {
      prisma.maintenanceExecution.findUnique.mockResolvedValue({ id: 'e1', evidenceUrls: ['/uploads/maintenance/e1/photo1.jpg'] });
      await expect(
        controller.downloadMaintenanceEvidence('e1', 'not-a-real-file.jpg', { id: 'u1', role: 'OPERATION' }, fakeRes()),
      ).rejects.toThrow('Tài liệu không thuộc bản ghi bảo trì này');
    });

    it('rejects TENANT outright (maintenance is staff-only)', async () => {
      await expect(
        controller.downloadMaintenanceEvidence('e1', 'photo1.jpg', { id: 'u1', role: 'TENANT' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });
  });

  it('404s when the underlying file is missing from disk even though the DB record is authorized', async () => {
    storage.getFileStream.mockReturnValue(null);
    prisma.contractFile.findUnique.mockResolvedValue({ id: 'f1', contractId: 'c1', fileName: 'x.pdf', fileType: 'application/pdf', filePath: 'contracts/c1/x.pdf', contract: { tenantId: 'tenant-A' } });
    await expect(
      controller.downloadContractFile('f1', { id: 'u1', role: 'ADMIN' }, fakeRes()),
    ).rejects.toThrow('Tài liệu không tồn tại trên máy chủ');
  });
});
