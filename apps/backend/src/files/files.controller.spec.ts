import { StreamableFile } from '@nestjs/common';
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
  let controller: FilesController;

  beforeEach(() => {
    jest.clearAllMocks();
    storage.getFileStream.mockReturnValue(Readable.from(['file-bytes']));
    controller = new FilesController(prisma, storage);
  });

  describe('contracts/:fileId', () => {
    const file = { id: 'f1', fileName: 'lease.pdf', fileType: 'application/pdf', filePath: 'contracts/c1/lease.pdf', contract: { tenantId: 'tenant-A' } };

    it('streams for a staff role regardless of tenant', async () => {
      prisma.contractFile.findUnique.mockResolvedValue(file);
      const result = await controller.downloadContractFile('f1', { role: 'LEASING_MANAGER' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
      expect(storage.getFileStream).toHaveBeenCalledWith('contracts/c1/lease.pdf');
    });

    it('allows the owning tenant', async () => {
      prisma.contractFile.findUnique.mockResolvedValue(file);
      const result = await controller.downloadContractFile('f1', { role: 'TENANT', tenantId: 'tenant-A' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('rejects a different tenant', async () => {
      prisma.contractFile.findUnique.mockResolvedValue(file);
      await expect(
        controller.downloadContractFile('f1', { role: 'TENANT', tenantId: 'tenant-B' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('404s when the file record does not exist', async () => {
      prisma.contractFile.findUnique.mockResolvedValue(null);
      await expect(
        controller.downloadContractFile('missing', { role: 'ADMIN' }, fakeRes()),
      ).rejects.toThrow('Tài liệu không tồn tại');
    });
  });

  describe('documents/:fileId (UnifiedDocument)', () => {
    it('checks invoice tenant ownership and increments downloadCount', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd1', entityType: 'INVOICE', entityId: 'inv-1', isActive: true, fileName: 'invoice.pdf', mimeType: 'application/pdf', filePath: 'billing/invoices/inv-1/invoice.pdf' });
      prisma.invoice.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      const result = await controller.downloadUnifiedDocument('d1', { role: 'TENANT', tenantId: 'tenant-A' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
      expect(prisma.unifiedDocument.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { downloadCount: { increment: 1 } } });
    });

    it('rejects a staff role with no billing access from downloading an invoice document (Phase 4 fix — used to allow any authenticated non-tenant role)', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd1', entityType: 'INVOICE', entityId: 'inv-1', isActive: true, fileName: 'invoice.pdf', filePath: 'x' });
      prisma.invoice.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      await expect(
        controller.downloadUnifiedDocument('d1', { role: 'OPERATION' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('allows FINANCE to download an invoice document', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd1', entityType: 'INVOICE', entityId: 'inv-1', isActive: true, fileName: 'invoice.pdf', mimeType: 'application/pdf', filePath: 'x' });
      prisma.invoice.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      const result = await controller.downloadUnifiedDocument('d1', { role: 'FINANCE' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('rejects a tenant that does not own the invoice', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd1', entityType: 'INVOICE', entityId: 'inv-1', isActive: true, fileName: 'invoice.pdf', filePath: 'x' });
      prisma.invoice.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      await expect(
        controller.downloadUnifiedDocument('d1', { role: 'TENANT', tenantId: 'tenant-B' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('checks ticket tenant ownership', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd2', entityType: 'TICKET', entityId: 't-1', isActive: true, fileName: 'photo.jpg', filePath: 'tickets/t-1/photo.jpg' });
      prisma.ticket.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      await expect(
        controller.downloadUnifiedDocument('d2', { role: 'TENANT', tenantId: 'tenant-B' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('rejects TENANT on fitout submittal/issue/daily-report documents (staff-only surfaces)', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd3', entityType: 'FITOUT_SUBMITTAL', entityId: 's-1', isActive: true, fileName: 'drawing.pdf', filePath: 'fitout-submittal/s-1/drawing.pdf' });
      await expect(
        controller.downloadUnifiedDocument('d3', { role: 'TENANT', tenantId: 'tenant-A' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('allows OPERATION on fitout issue documents', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd4', entityType: 'FITOUT_ISSUE', entityId: 'i-1', isActive: true, fileName: 'defect.jpg', filePath: 'fitout-issue/i-1/defect.jpg' });
      const result = await controller.downloadUnifiedDocument('d4', { role: 'OPERATION' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('404s on an inactive or unknown document', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd5', entityType: 'INVOICE', isActive: false });
      await expect(
        controller.downloadUnifiedDocument('d5', { role: 'ADMIN' }, fakeRes()),
      ).rejects.toThrow('Tài liệu không tồn tại');
    });

    it('404s on an unrecognized entityType rather than streaming blindly', async () => {
      prisma.unifiedDocument.findUnique.mockResolvedValue({ id: 'd6', entityType: 'SOMETHING_NEW', isActive: true });
      await expect(
        controller.downloadUnifiedDocument('d6', { role: 'ADMIN' }, fakeRes()),
      ).rejects.toThrow('Loại tài liệu không được hỗ trợ');
    });
  });

  describe('fitout-documents/:fileId', () => {
    it('allows the owning tenant', async () => {
      prisma.fitoutDocument.findUnique.mockResolvedValue({ id: 'fd1', fileName: 'permit.pdf', filePath: 'fitout/p1/permit.pdf', project: { tenantId: 'tenant-A' } });
      const result = await controller.downloadFitoutDocument('fd1', { role: 'TENANT', tenantId: 'tenant-A' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('rejects a different tenant', async () => {
      prisma.fitoutDocument.findUnique.mockResolvedValue({ id: 'fd1', fileName: 'permit.pdf', filePath: 'x', project: { tenantId: 'tenant-A' } });
      await expect(
        controller.downloadFitoutDocument('fd1', { role: 'TENANT', tenantId: 'tenant-B' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('rejects a staff role outside fitout-relevant roles (e.g. FINANCE)', async () => {
      prisma.fitoutDocument.findUnique.mockResolvedValue({ id: 'fd1', fileName: 'permit.pdf', filePath: 'x', project: { tenantId: 'tenant-A' } });
      await expect(
        controller.downloadFitoutDocument('fd1', { role: 'FINANCE' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });
  });

  describe('role-only gated routes (no tenant access to these modules at all)', () => {
    it('parking-contract-documents rejects LEASING_EXECUTIVE (not a parking role)', async () => {
      await expect(
        controller.downloadParkingContractDocument('x', { role: 'LEASING_EXECUTIVE' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
      expect(prisma.parkingContractDocument.findUnique).not.toHaveBeenCalled();
    });

    it('parking-contract-documents allows FINANCE', async () => {
      prisma.parkingContractDocument.findUnique.mockResolvedValue({ id: 'p1', fileName: 'x.pdf', mimeType: 'application/pdf', filePath: 'parking-contracts/c1/x.pdf' });
      const result = await controller.downloadParkingContractDocument('p1', { role: 'FINANCE' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('service-contract-documents rejects OPERATION-excluded... allows OPERATION per role set, rejects TENANT', async () => {
      await expect(
        controller.downloadServiceContractDocument('x', { role: 'TENANT' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('work-order-evidence rejects FINANCE (not a work-order role)', async () => {
      await expect(
        controller.downloadWorkOrderEvidence('x', { role: 'FINANCE' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('patrol-checks rejects LEGAL', async () => {
      await expect(
        controller.downloadPatrolCheckFile('x', { role: 'LEGAL' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });

    it('ADMIN always bypasses the role list', async () => {
      prisma.patrolCheck.findUnique.mockResolvedValue({ id: 'pc1', fileName: 'evidence.jpg', mimeType: 'image/jpeg', filePath: 'patrol/pc1/evidence.jpg' });
      const result = await controller.downloadPatrolCheckFile('pc1', { role: 'ADMIN' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });
  });

  describe('maintenance-evidence/:executionId/:fileName', () => {
    it('streams a filename that is actually part of the execution\'s evidence', async () => {
      prisma.maintenanceExecution.findUnique.mockResolvedValue({ id: 'e1', evidenceUrls: ['/uploads/maintenance/e1/photo1.jpg'] });
      const result = await controller.downloadMaintenanceEvidence('e1', 'photo1.jpg', { role: 'OPERATION' }, fakeRes());
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('rejects a filename not present in evidenceUrls, even for an otherwise-authorized role', async () => {
      prisma.maintenanceExecution.findUnique.mockResolvedValue({ id: 'e1', evidenceUrls: ['/uploads/maintenance/e1/photo1.jpg'] });
      await expect(
        controller.downloadMaintenanceEvidence('e1', 'not-a-real-file.jpg', { role: 'OPERATION' }, fakeRes()),
      ).rejects.toThrow('Tài liệu không thuộc bản ghi bảo trì này');
    });

    it('rejects TENANT outright (maintenance is staff-only)', async () => {
      await expect(
        controller.downloadMaintenanceEvidence('e1', 'photo1.jpg', { role: 'TENANT' }, fakeRes()),
      ).rejects.toThrow('Bạn không có quyền truy cập tài liệu này');
    });
  });

  it('404s when the underlying file is missing from disk even though the DB record is authorized', async () => {
    storage.getFileStream.mockReturnValue(null);
    prisma.contractFile.findUnique.mockResolvedValue({ id: 'f1', fileName: 'x.pdf', fileType: 'application/pdf', filePath: 'contracts/c1/x.pdf', contract: { tenantId: 'tenant-A' } });
    await expect(
      controller.downloadContractFile('f1', { role: 'ADMIN' }, fakeRes()),
    ).rejects.toThrow('Tài liệu không tồn tại trên máy chủ');
  });
});
