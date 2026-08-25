import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FitoutController } from './fitout.controller';
import { FitoutContractorService } from './fitout-contractor.service';
import { FitoutDailyReportService } from './fitout-daily-report.service';
import { FitoutGanttService } from './fitout-gantt.service';
import { FitoutIssueService } from './fitout-issue.service';
import { FitoutSlaService } from './fitout-sla.service';
import { CreateFitoutChangeOrderDto, DecideFitoutChangeOrderDto } from './dto/fitout-controls.dto';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { FitoutSubmittalController } from './fitout-submittal.controller';

describe('Golden Fitout security and parent-reference integrity', () => {
  describe('approved role matrix metadata', () => {
    it('keeps configuration reads Tenant-visible while every config mutation is ADMIN-only', () => {
      expect(Reflect.getMetadata(ROLES_KEY, FitoutController.prototype.listStageConfigs)).toContain(Role.TENANT);
      expect(Reflect.getMetadata(ROLES_KEY, FitoutController.prototype.listFormTypes)).toContain(Role.TENANT);
      expect(Reflect.getMetadata(ROLES_KEY, FitoutController.prototype.upsertStageConfig)).toEqual([Role.ADMIN]);
      expect(Reflect.getMetadata(ROLES_KEY, FitoutController.prototype.upsertFormType)).toEqual([Role.ADMIN]);
    });

    it('allows Tenant-owned submittal create/upload/resubmit but not publish', () => {
      expect(Reflect.getMetadata(ROLES_KEY, FitoutSubmittalController.prototype.create)).toContain(Role.TENANT);
      expect(Reflect.getMetadata(ROLES_KEY, FitoutSubmittalController.prototype.resubmit)).toContain(Role.TENANT);
      expect(Reflect.getMetadata(ROLES_KEY, FitoutSubmittalController.prototype.uploadAttachment)).toContain(Role.TENANT);
      expect(Reflect.getMetadata(ROLES_KEY, FitoutSubmittalController.prototype.publish)).toBeUndefined();
    });
  });

  describe('lossless money DTO transport', () => {
    it('preserves an exact Decimal string and accepts legacy numeric payloads without Number coercion', async () => {
      const exact = plainToInstance(CreateFitoutChangeOrderDto, {
        title: 'Exact change', proposedAmount: '9007199254740991.25', currency: 'USD',
      });
      const legacy = plainToInstance(DecideFitoutChangeOrderDto, {
        decision: 'APPROVED', approvedAmount: 12.25,
      });

      await expect(validate(exact)).resolves.toHaveLength(0);
      await expect(validate(legacy)).resolves.toHaveLength(0);
      expect(exact.proposedAmount).toBe('9007199254740991.25');
      expect(legacy.approvedAmount).toBe('12.25');
    });

    it('rejects amounts outside Decimal(18,2) precision', async () => {
      const invalid = plainToInstance(CreateFitoutChangeOrderDto, {
        title: 'Invalid change', proposedAmount: '10000000000000000.001',
      });

      await expect(validate(invalid)).resolves.not.toHaveLength(0);
    });
  });

  describe('aggregate Mall scope', () => {
    it('passes the actor accessible Mall set to progress and overview readers', async () => {
      const mallAccess = { getAccessibleMallIds: jest.fn().mockResolvedValue(['mall-a']) };
      const sla = { getFitoutProgress: jest.fn().mockResolvedValue([]) };
      const dashboard = { getOverview: jest.fn().mockResolvedValue({ totalActive: 0 }) };
      const controller = new FitoutController(
        {} as any, {} as any, sla as any, {} as any, {} as any, {} as any,
        {} as any, dashboard as any, {} as any, mallAccess as any,
        {} as any,
      );
      const user = { id: 'director-a', role: 'MALL_DIRECTOR' };

      await controller.getProgress(user);
      await controller.getDashboardOverview(user);

      expect(sla.getFitoutProgress).toHaveBeenCalledWith(['mall-a']);
      expect(dashboard.getOverview).toHaveBeenCalledWith(['mall-a']);
    });

    it('applies the authoritative Unit Mall/floor chain, including an empty accessible set', async () => {
      const prisma = {
        fitoutStageConfig: { findMany: jest.fn().mockResolvedValue([{ code: 'OPENED' }]) },
        fitoutProject: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new FitoutSlaService(
        prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      );

      await service.getFitoutProgress([]);

      expect(prisma.fitoutProject.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          status: { not: 'OPENED' },
          unit: { OR: [{ mallId: { in: [] } }, { floor: { mallId: { in: [] } } }] },
        },
      }));
    });
  });

  describe('contractor and worker ownership', () => {
    const prisma = {
      fitoutContractor: { findFirst: jest.fn(), update: jest.fn() },
      workerAccessLog: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const service = new FitoutContractorService(prisma as any);

    beforeEach(() => jest.clearAllMocks());

    it('rejects a contractor child outside the authorized project', async () => {
      prisma.fitoutContractor.findFirst.mockResolvedValue(null);
      await expect(service.updateContractor('project-a', 'contractor-b', {})).rejects.toThrow(NotFoundException);
      expect(prisma.fitoutContractor.update).not.toHaveBeenCalled();
    });

    it('updates a contractor that belongs to the authorized project', async () => {
      prisma.fitoutContractor.findFirst.mockResolvedValue({ id: 'contractor-a', projectId: 'project-a' });
      prisma.fitoutContractor.update.mockResolvedValue({ id: 'contractor-a', companyName: 'Updated' });

      await expect(service.updateContractor('project-a', 'contractor-a', { companyName: 'Updated' }))
        .resolves.toEqual({ id: 'contractor-a', companyName: 'Updated' });
      expect(prisma.fitoutContractor.findFirst).toHaveBeenCalledWith({
        where: { id: 'contractor-a', projectId: 'project-a' },
      });
    });

    it('rejects worker entry with a contractor outside the authorized project', async () => {
      prisma.fitoutContractor.findFirst.mockResolvedValue(null);
      await expect(service.logWorkerEntry('project-a', {
        contractorId: 'contractor-b', workerName: 'Worker', idNumber: 'ID-1', entryDate: '2026-08-24',
      })).rejects.toThrow(BadRequestException);
      expect(prisma.workerAccessLog.create).not.toHaveBeenCalled();
    });

    it('rejects worker exit for a log outside the authorized project', async () => {
      prisma.workerAccessLog.findFirst.mockResolvedValue(null);
      await expect(service.logWorkerExit('project-a', 'log-b')).rejects.toThrow(NotFoundException);
      expect(prisma.workerAccessLog.update).not.toHaveBeenCalled();
    });

    it('forwards the authorized project parent to contractor delete and worker exit endpoints', async () => {
      const mallAccess = { extractAndValidateMallAccess: jest.fn().mockResolvedValue('mall-a') };
      const contractor = {
        deleteContractor: jest.fn().mockResolvedValue({ id: 'contractor-a' }),
        logWorkerExit: jest.fn().mockResolvedValue({ id: 'log-a' }),
      };
      const controller = new FitoutController(
        {} as any, {} as any, {} as any, contractor as any, {} as any, {} as any,
        {} as any, {} as any, {} as any, mallAccess as any, {} as any,
      );
      const user = { id: 'operation-a', role: 'OPERATION' };

      await controller.deleteContractor('project-a', 'contractor-a', user);
      await controller.logWorkerExit('project-a', 'log-a', user);

      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenNthCalledWith(1, 'operation-a', 'OPERATION', { fitoutProjectId: 'project-a' });
      expect(mallAccess.extractAndValidateMallAccess).toHaveBeenNthCalledWith(2, 'operation-a', 'OPERATION', { fitoutProjectId: 'project-a' });
      expect(contractor.deleteContractor).toHaveBeenCalledWith('project-a', 'contractor-a');
      expect(contractor.logWorkerExit).toHaveBeenCalledWith('project-a', 'log-a');
    });
  });

  it('rejects an Issue Unit that is not the Fitout Project Unit before writing', async () => {
    const prisma = {
      fitoutProject: { findUnique: jest.fn().mockResolvedValue({ id: 'project-a', unitId: 'unit-a' }) },
      unit: { findUnique: jest.fn() },
      fitoutIssue: { create: jest.fn() },
    };
    const service = new FitoutIssueService(
      prisma as any, {} as any, { create: jest.fn() } as any, {} as any, {} as any, {} as any,
    );

    await expect(service.create('project-a', {
      unitId: 'unit-b', title: 'Foreign unit issue',
    }, 'user-a')).rejects.toThrow(BadRequestException);
    expect(prisma.unit.findUnique).not.toHaveBeenCalled();
    expect(prisma.fitoutIssue.create).not.toHaveBeenCalled();
  });

  it('rejects a Daily Report contractor outside the Fitout Project', async () => {
    const prisma = {
      fitoutProject: { findUnique: jest.fn().mockResolvedValue({ id: 'project-a' }) },
      fitoutContractor: { findFirst: jest.fn().mockResolvedValue(null) },
      fitoutDailyReportEntry: { create: jest.fn() },
    };
    const service = new FitoutDailyReportService(prisma as any, {} as any);

    await expect(service.create('project-a', {
      reportDate: '2026-08-24', contractorId: 'contractor-b', description: 'Daily report',
    }, 'user-a')).rejects.toThrow(BadRequestException);
    expect(prisma.fitoutDailyReportEntry.create).not.toHaveBeenCalled();
  });

  describe('Gantt project references', () => {
    const prisma = {
      fitoutProject: { findUnique: jest.fn() },
      fitoutTask: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      fitoutContractor: { findFirst: jest.fn() },
    };
    const service = new FitoutGanttService(prisma as any, {} as any);

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.fitoutProject.findUnique.mockResolvedValue({ id: 'project-a' });
    });

    it.each([
      ['parentTaskId', 'task-b'],
      ['dependsOnTaskId', 'task-b'],
    ])('rejects a foreign %s on create', async (field, value) => {
      prisma.fitoutTask.findFirst.mockResolvedValue(null);
      await expect(service.createTask('project-a', {
        name: 'Task', plannedStart: '2026-08-24', plannedEnd: '2026-08-25', [field]: value,
      })).rejects.toThrow(BadRequestException);
      expect(prisma.fitoutTask.create).not.toHaveBeenCalled();
    });

    it('rejects a foreign contractor on create', async () => {
      prisma.fitoutContractor.findFirst.mockResolvedValue(null);
      await expect(service.createTask('project-a', {
        name: 'Task', plannedStart: '2026-08-24', plannedEnd: '2026-08-25', assignedContractorId: 'contractor-b',
      })).rejects.toThrow(BadRequestException);
      expect(prisma.fitoutTask.create).not.toHaveBeenCalled();
    });

    it('rejects a foreign contractor on update using the Task own project', async () => {
      prisma.fitoutTask.findUnique.mockResolvedValue({ id: 'task-a', projectId: 'project-a' });
      prisma.fitoutContractor.findFirst.mockResolvedValue(null);
      await expect(service.updateTask('task-a', { assignedContractorId: 'contractor-b' })).rejects.toThrow(BadRequestException);
      expect(prisma.fitoutTask.update).not.toHaveBeenCalled();
    });

    it('creates a task when every supplied reference belongs to the project', async () => {
      prisma.fitoutTask.findFirst
        .mockResolvedValueOnce({ id: 'parent-a' })
        .mockResolvedValueOnce({ id: 'dependency-a' })
        .mockResolvedValueOnce({ sortOrder: 2 });
      prisma.fitoutContractor.findFirst.mockResolvedValue({ id: 'contractor-a' });
      prisma.fitoutTask.create.mockImplementation(({ data }) => Promise.resolve(data));

      await expect(service.createTask('project-a', {
        name: 'Task', plannedStart: '2026-08-24', plannedEnd: '2026-08-25',
        parentTaskId: 'parent-a', dependsOnTaskId: 'dependency-a', assignedContractorId: 'contractor-a',
      })).resolves.toEqual(expect.objectContaining({
        projectId: 'project-a', parentTaskId: 'parent-a', dependsOnTaskId: 'dependency-a',
        assignedContractorId: 'contractor-a', sortOrder: 3,
      }));
    });
  });
});
