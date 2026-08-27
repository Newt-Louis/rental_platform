import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FitoutService } from './fitout.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { FitoutStageConfigService } from './fitout-stage-config.service';
import { FitoutDocumentsService } from './fitout-documents.service';
import { FitoutSlaService } from './fitout-sla.service';

/**
 * Phase 5 hardening (docs/program/05-FITOUT-HANDOVER-COMPLETION.md, reliability backlog
 * items 6 & 7). Neither createFromContract() nor advanceStatus() had any test coverage
 * before this phase — these tests cover the atomicity/idempotency/concurrency guarantees
 * added this phase, mirroring the pattern already proven in
 * modules/contracts/contract-activation.spec.ts.
 */
describe('FitoutService — auto-create & stage-advance reliability', () => {
  const tx = {
    fitoutProject: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  const prisma: any = {
    fitoutProject: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const unitStatus = { transition: jest.fn() };
  const stageConfig = { getOrderedActive: jest.fn() };
  const documentsService = { checkGateRequirements: jest.fn() };
  const slaService = { recordMilestone: jest.fn(), completeMilestone: jest.fn() };
  const accessPolicy = {};
  let service: FitoutService;

  const STAGES = [
    { code: 'CONTRACT_SIGNED', order: 1, triggersUnitStatus: null, setsField: null },
    { code: 'SUBMIT_DESIGN', order: 2, triggersUnitStatus: null, setsField: null },
    { code: 'FITOUT_IN_PROGRESS', order: 3, triggersUnitStatus: 'UNDER_FITOUT', setsField: 'startDate' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: any) => cb(tx));
    stageConfig.getOrderedActive.mockResolvedValue(STAGES);
    documentsService.checkGateRequirements.mockResolvedValue({ canAdvance: true, missing: [] });
    service = new FitoutService(
      prisma as unknown as PrismaService,
      unitStatus as unknown as UnitStatusService,
      stageConfig as unknown as FitoutStageConfigService,
      documentsService as unknown as FitoutDocumentsService,
      slaService as unknown as FitoutSlaService,
      accessPolicy as any,
    );
  });

  describe('createFromContract', () => {
    const contract = { id: 'c1', tenantId: 't1', unitId: 'u1', handoverDate: null, openingDate: null };

    it('creates the project and its first milestone atomically', async () => {
      prisma.fitoutProject.findUnique.mockResolvedValue(null);
      tx.fitoutProject.findUnique.mockResolvedValue(null);
      tx.fitoutProject.create.mockResolvedValue({ id: 'fp1', contractId: 'c1', status: 'CONTRACT_SIGNED' });

      const result = await service.createFromContract(contract);

      expect(result.id).toBe('fp1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(slaService.recordMilestone).toHaveBeenCalledWith('fp1', 'CONTRACT_SIGNED', tx);
    });

    it('is idempotent when a project already exists for the contract (pre-check, no transaction opened)', async () => {
      prisma.fitoutProject.findUnique.mockResolvedValue({ id: 'fp1', contractId: 'c1' });

      const result = await service.createFromContract(contract);

      expect(result.id).toBe('fp1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('resolves a lost concurrent-create race via the DB unique constraint instead of throwing', async () => {
      prisma.fitoutProject.findUnique
        .mockResolvedValueOnce(null) // pre-check: no project yet
        .mockResolvedValueOnce({ id: 'fp1', contractId: 'c1' }); // post-catch re-fetch: winner's project
      tx.fitoutProject.findUnique.mockResolvedValue(null); // in-tx re-check, before the race is lost
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });

      const result = await service.createFromContract(contract);

      expect(result.id).toBe('fp1');
    });

    it('propagates a genuine failure (not a race) rather than swallowing it', async () => {
      prisma.fitoutProject.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValueOnce(new Error('db unavailable'));

      await expect(service.createFromContract(contract)).rejects.toThrow('db unavailable');
    });
  });

  describe('handleContractActivated', () => {
    it('rethrows a genuine createFromContract failure so the outbox retries it (Backbone Gate finding B)', async () => {
      prisma.fitoutProject.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValueOnce(new Error('no active fitout stage configured'));

      await expect(
        service.handleContractActivated({
          contractId: 'c1',
          tenantId: 't1',
          unitId: 'u1',
          handoverDate: null,
          openingDate: null,
        }),
      ).rejects.toThrow('no active fitout stage configured');
    });
  });

  describe('advanceStatus', () => {
    const project = {
      id: 'fp1', status: 'SUBMIT_DESIGN', unitId: 'u1', tenantId: 't1', startDate: null,
      contract: { id: 'c1', contractNumber: 'CTR-2026-0001', status: 'ACTIVE' },
    };

    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue(project as any);
    });

    describe('Contract-status guard (Phase 6 early cleanup, RELIABILITY_BACKLOG.md item 16)', () => {
      it.each(['ACTIVE', 'EXPIRING'])('allows advancing when the contract is %s', async (contractStatus) => {
        jest.spyOn(service, 'findOne').mockResolvedValue({
          ...project,
          contract: { ...project.contract, status: contractStatus },
        } as any);
        tx.fitoutProject.findUniqueOrThrow.mockResolvedValue(project);
        tx.fitoutProject.update.mockResolvedValue({ ...project, status: 'FITOUT_IN_PROGRESS' });

        const result = await service.advanceStatus('fp1', 'FITOUT_IN_PROGRESS', { userRole: Role.OPERATION });
        expect(result.status).toBe('FITOUT_IN_PROGRESS');
      });

      it.each(['TERMINATING', 'TERMINATED', 'EXPIRED', 'DRAFT', 'PENDING_LEGAL', 'PENDING_SIGNATURE'])(
        'rejects advancing when the contract is %s, before opening any transaction',
        async (contractStatus) => {
          jest.spyOn(service, 'findOne').mockResolvedValue({
            ...project,
            contract: { ...project.contract, status: contractStatus },
          } as any);

          await expect(service.advanceStatus('fp1', 'FITOUT_IN_PROGRESS', { userRole: Role.OPERATION })).rejects.toBeInstanceOf(BadRequestException);
          expect(prisma.$transaction).not.toHaveBeenCalled();
        },
      );
    });

    it('advances atomically, including the unit-status transition inside the same transaction', async () => {
      tx.fitoutProject.findUniqueOrThrow.mockResolvedValue(project);
      tx.fitoutProject.update.mockResolvedValue({ ...project, status: 'FITOUT_IN_PROGRESS' });

      const result = await service.advanceStatus('fp1', 'FITOUT_IN_PROGRESS', { userRole: Role.OPERATION });

      expect(unitStatus.transition).toHaveBeenCalledWith(
        'u1',
        'UNDER_FITOUT',
        expect.objectContaining({ reason: expect.stringContaining('fp1') }),
        tx,
      );
      expect(tx.fitoutProject.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'fp1' } }),
      );
      expect(slaService.completeMilestone).toHaveBeenCalledWith('fp1', 'SUBMIT_DESIGN', tx);
      expect(slaService.recordMilestone).toHaveBeenCalledWith('fp1', 'FITOUT_IN_PROGRESS', tx);
      expect(result.status).toBe('FITOUT_IN_PROGRESS');
    });

    it('treats a same-target retry (double-click) as an idempotent replay, not an error', async () => {
      tx.fitoutProject.findUniqueOrThrow.mockResolvedValue({ ...project, status: 'FITOUT_IN_PROGRESS' });

      jest.spyOn(service, 'findOne').mockResolvedValue({ ...project, status: 'FITOUT_IN_PROGRESS' } as any);
      const result = await service.advanceStatus('fp1', 'FITOUT_IN_PROGRESS', { userRole: Role.OPERATION });

      expect(tx.fitoutProject.update).not.toHaveBeenCalled();
      expect(unitStatus.transition).not.toHaveBeenCalled();
      expect(result.status).toBe('FITOUT_IN_PROGRESS');
    });

    it('rejects a stale-read transition when the project moved to a different status concurrently', async () => {
      tx.fitoutProject.findUniqueOrThrow.mockResolvedValue({ ...project, status: 'CONTRACT_SIGNED' });

      await expect(service.advanceStatus('fp1', 'FITOUT_IN_PROGRESS', { userRole: Role.OPERATION })).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.fitoutProject.update).not.toHaveBeenCalled();
    });

    it('resolves a lost concurrent-advance race (P2034) to the winning outcome', async () => {
      tx.fitoutProject.findUniqueOrThrow.mockResolvedValue(project);
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
      prisma.fitoutProject.findUnique.mockResolvedValue({ ...project, status: 'FITOUT_IN_PROGRESS' });

      const result = await service.advanceStatus('fp1', 'FITOUT_IN_PROGRESS', { userRole: Role.OPERATION });

      expect(result.status).toBe('FITOUT_IN_PROGRESS');
    });

    it('rejects skipping stages backward or sideways before ever opening a transaction', async () => {
      await expect(service.advanceStatus('fp1', 'CONTRACT_SIGNED', { userRole: Role.OPERATION })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects skipping over a configured stage', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ ...project, status: 'CONTRACT_SIGNED' } as any);

      await expect(service.advanceStatus('fp1', 'FITOUT_IN_PROGRESS', { userRole: Role.OPERATION }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a non-authorized stage advancer', async () => {
      await expect(service.advanceStatus('fp1', 'FITOUT_IN_PROGRESS', { userRole: Role.LEASING_MANAGER }))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires a reason and director/admin authority for a gate override', async () => {
      await expect(service.advanceStatus('fp1', 'FITOUT_IN_PROGRESS', {
        userRole: Role.OPERATION,
        override: true,
        overrideReason: 'Emergency',
      })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.advanceStatus('fp1', 'FITOUT_IN_PROGRESS', {
        userRole: Role.MALL_DIRECTOR,
        override: true,
      })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
