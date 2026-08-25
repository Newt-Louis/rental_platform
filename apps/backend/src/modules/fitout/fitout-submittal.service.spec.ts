import { BadRequestException } from '@nestjs/common';
import { FitoutSubmittalService } from './fitout-submittal.service';

describe('FitoutSubmittalService attachment revision policy', () => {
  const prisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    unifiedDocument: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const storage = { saveFile: jest.fn(), deleteFile: jest.fn() };
  let service: FitoutSubmittalService;
  const file = {
    originalname: 'drawing.pdf', size: 1024, mimetype: 'application/pdf',
  } as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FitoutSubmittalService(
      prisma as any, storage as any, {} as any, {} as any, {} as any,
    );
    storage.saveFile.mockResolvedValue({ fileName: 'drawing.pdf', filePath: 'fitout/sub-1/drawing.pdf' });
    storage.deleteFile.mockResolvedValue(true);
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.$queryRaw.mockResolvedValue([{
      id: 'sub-1', status: 'IN_PROGRESS', workflowId: 'workflow-1', workflowStatus: 'IN_PROGRESS',
    }]);
    prisma.unifiedDocument.findFirst.mockResolvedValue(null);
    prisma.unifiedDocument.create.mockImplementation(({ data }) => Promise.resolve(data));
  });

  it.each(['SUBMITTED', 'IN_PROGRESS'])(
    'allows attachments on the current mutable %s revision',
    async (status) => {
      jest.spyOn(service, 'getOne').mockResolvedValue({
        id: 'sub-1', status, workflowId: 'workflow-1', workflow: { status: 'IN_PROGRESS' },
        formType: { code: 'DESIGN_DRAWING' },
      } as any);
      prisma.$queryRaw.mockResolvedValueOnce([{
        id: 'sub-1', status, workflowId: 'workflow-1', workflowStatus: 'IN_PROGRESS',
      }]);

      await expect(service.uploadAttachment('sub-1', file, 'user-1')).resolves.toEqual(
        expect.objectContaining({
          entityId: 'sub-1', documentType: 'DESIGN_DRAWING', uploadedById: 'user-1',
        }),
      );
      expect(storage.saveFile).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['REJECTED', 'APPROVED', 'PUBLISHED', 'OBSOLETED'])(
    'rejects attachments on an immutable %s revision before saving a file',
    async (status) => {
      jest.spyOn(service, 'getOne').mockResolvedValue({
        id: 'sub-1', status, workflowId: 'workflow-1', workflow: { status: 'IN_PROGRESS' },
        formType: { code: 'DESIGN_DRAWING' },
      } as any);

      await expect(service.uploadAttachment('sub-1', file, 'user-1'))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(storage.saveFile).not.toHaveBeenCalled();
      expect(prisma.unifiedDocument.create).not.toHaveBeenCalled();
    },
  );

  it.each(['APPROVED', 'REJECTED'])(
    'rejects a terminal %s workflow before saving even when the submittal projection is stale',
    async (workflowStatus) => {
      jest.spyOn(service, 'getOne').mockResolvedValue({
        id: 'sub-1', status: 'IN_PROGRESS', workflowId: 'workflow-1', workflow: { status: workflowStatus },
        formType: { code: 'DESIGN_DRAWING' },
      } as any);

      await expect(service.uploadAttachment('sub-1', file, 'user-1'))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(storage.saveFile).not.toHaveBeenCalled();
    },
  );

  it('cleans up the saved file when approval wins the race before the locked recheck', async () => {
    jest.spyOn(service, 'getOne').mockResolvedValue({
      id: 'sub-1', status: 'IN_PROGRESS', workflowId: 'workflow-1', workflow: { status: 'IN_PROGRESS' },
      formType: { code: 'DESIGN_DRAWING' },
    } as any);
    prisma.$queryRaw.mockResolvedValueOnce([{
      id: 'sub-1', status: 'IN_PROGRESS', workflowId: 'workflow-1', workflowStatus: 'APPROVED',
    }]);

    await expect(service.uploadAttachment('sub-1', file, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(storage.deleteFile).toHaveBeenCalledWith('fitout/sub-1/drawing.pdf');
    expect(prisma.unifiedDocument.create).not.toHaveBeenCalled();
  });
});
