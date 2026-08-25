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

  // Required-attachment closure: a submittal starts as a draft (SUBMITTED, no ApprovalWorkflow
  // yet) so it must accept attachment uploads in that state — this is the step that has to
  // happen before submitForReview() can succeed.
  it('allows attachments on a draft submittal that has no workflow yet (workflowId null)', async () => {
    jest.spyOn(service, 'getOne').mockResolvedValue({
      id: 'sub-1', status: 'SUBMITTED', workflowId: null, workflow: null,
      formType: { code: 'DESIGN_DRAWING' },
    } as any);
    prisma.$queryRaw.mockResolvedValueOnce([{
      id: 'sub-1', status: 'SUBMITTED', workflowId: null, workflowStatus: null,
    }]);

    await expect(service.uploadAttachment('sub-1', file, 'user-1')).resolves.toEqual(
      expect.objectContaining({ entityId: 'sub-1', documentType: 'DESIGN_DRAWING' }),
    );
    expect(storage.saveFile).toHaveBeenCalledTimes(1);
  });
});

describe('FitoutSubmittalService.list() — attachments merged in (no direct Prisma relation)', () => {
  const prisma: any = {
    fitoutSubmittal: { findMany: jest.fn() },
    unifiedDocument: { findMany: jest.fn() },
  };
  let service: FitoutSubmittalService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FitoutSubmittalService(prisma, {} as any, {} as any, {} as any, {} as any);
  });

  it('attaches each submittal its own UnifiedDocument rows, grouped by entityId', async () => {
    prisma.fitoutSubmittal.findMany.mockResolvedValue([{ id: 'sub-1' }, { id: 'sub-2' }]);
    prisma.unifiedDocument.findMany.mockResolvedValue([
      { id: 'doc-1', entityId: 'sub-1', fileName: 'a.pdf' },
      { id: 'doc-2', entityId: 'sub-1', fileName: 'b.pdf' },
    ]);

    const result = await service.list('project-1');

    expect(result.find((s: any) => s.id === 'sub-1').attachments).toHaveLength(2);
    expect(result.find((s: any) => s.id === 'sub-2').attachments).toEqual([]);
  });

  it('skips the attachment query entirely when there are no submittals', async () => {
    prisma.fitoutSubmittal.findMany.mockResolvedValue([]);
    const result = await service.list('project-1');
    expect(result).toEqual([]);
    expect(prisma.unifiedDocument.findMany).not.toHaveBeenCalled();
  });
});

describe('FitoutSubmittalService — required attachment before entering the approval workflow', () => {
  const prisma: any = {
    fitoutProject: { findUnique: jest.fn() },
    fitoutFormType: { findUnique: jest.fn() },
    fitoutSubmittal: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    unifiedDocument: { count: jest.fn() },
    approvalWorkflow: { create: jest.fn() },
    // notifyPendingApprovers() short-circuits gracefully (returns early) when no matching
    // PENDING step is found -- keeps this describe block focused on the required-attachment
    // gate itself rather than the notification fan-out, which fitout-submittal.notify specs own.
    approvalStep: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((cb: any) => cb(prisma)),
  };
  let service: FitoutSubmittalService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: any) => cb(prisma));
    service = new FitoutSubmittalService(prisma, {} as any, { create: jest.fn() } as any, {} as any, {} as any);
  });

  it('create() produces a draft with no ApprovalWorkflow and never notifies approvers', async () => {
    prisma.fitoutProject.findUnique.mockResolvedValue({ id: 'project-1', status: 'IN_PROGRESS' });
    prisma.fitoutFormType.findUnique.mockResolvedValue({ id: 'form-1', isActive: true, approvalLevels: 1, approverRoles: [] });
    prisma.fitoutSubmittal.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'sub-1', workflowId: null, ...data }));

    const result = await service.create('project-1', { formTypeId: 'form-1', title: 'Bản vẽ thiết kế' }, 'user-1');

    expect(result.status).toBe('SUBMITTED');
    expect(result.workflowId).toBeNull();
    expect(prisma.approvalWorkflow.create).not.toHaveBeenCalled();
  });

  describe('submitForReview()', () => {
    const draft = {
      id: 'sub-1', status: 'SUBMITTED', workflowId: null, formTypeId: 'form-1',
      formType: { code: 'DESIGN_DRAWING' },
    };

    it('rejects when the submittal has zero attachments', async () => {
      jest.spyOn(service, 'getOne').mockResolvedValue(draft as any);
      prisma.unifiedDocument.count.mockResolvedValue(0);

      await expect(service.submitForReview('sub-1')).rejects.toThrow(BadRequestException);
      expect(prisma.approvalWorkflow.create).not.toHaveBeenCalled();
    });

    it('rejects when the submittal already has a workflow (already submitted)', async () => {
      jest.spyOn(service, 'getOne').mockResolvedValue({ ...draft, workflowId: 'workflow-1' } as any);

      await expect(service.submitForReview('sub-1')).rejects.toThrow(BadRequestException);
      expect(prisma.approvalWorkflow.create).not.toHaveBeenCalled();
    });

    it('creates the ApprovalWorkflow and transitions to IN_PROGRESS when at least one attachment exists', async () => {
      jest.spyOn(service, 'getOne').mockResolvedValue(draft as any);
      prisma.unifiedDocument.count.mockResolvedValue(1);
      prisma.fitoutFormType.findUnique.mockResolvedValue({ id: 'form-1', approvalLevels: 1, approverRoles: [] });
      prisma.approvalWorkflow.create.mockResolvedValue({ id: 'workflow-1' });
      prisma.fitoutSubmittal.update.mockResolvedValue({ id: 'sub-1', status: 'IN_PROGRESS', workflowId: 'workflow-1' });

      const result = await service.submitForReview('sub-1');

      expect(prisma.approvalWorkflow.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ status: 'IN_PROGRESS', workflowId: 'workflow-1' });
    });
  });
});
