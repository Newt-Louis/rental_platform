import { AmendmentStatus, AmendmentType, ContractStatus, UnitStatus } from '@prisma/client';
import { ContractTerminationService } from './contract-termination.service';
import { ContractAmendmentsService } from './contract-templates.service';

describe('Contract lifecycle atomicity', () => {
  describe('termination', () => {
    const tx: any = {
      contract: { findUnique: jest.fn(), update: jest.fn() },
      contractTermination: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    };
    const prisma: any = {
      contract: { findUnique: jest.fn(), update: jest.fn() },
      contractTermination: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const unitStatus: any = { transition: jest.fn() };
    let service: ContractTerminationService;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new ContractTerminationService(prisma, unitStatus);
      prisma.contract.findUnique.mockResolvedValue({ id: 'contract-1', status: ContractStatus.ACTIVE });
      prisma.contractTermination.findUnique.mockResolvedValue(null);
      tx.contract.findUnique.mockResolvedValue({
        id: 'contract-1',
        status: ContractStatus.ACTIVE,
        unitId: 'unit-1',
      });
      tx.contractTermination.findUnique.mockResolvedValue(null);
      tx.contractTermination.upsert.mockResolvedValue({ id: 'term-1', status: 'INITIATED' });
      tx.contractTermination.update.mockResolvedValue({ id: 'term-1', status: 'COMPLETED' });
      tx.contract.update.mockResolvedValue({ id: 'contract-1' });
      unitStatus.transition.mockResolvedValue(undefined);
    });

    it('initiates the termination and Contract status in one transaction', async () => {
      await service.initiate('contract-1', {
        initiatedBy: 'TENANT',
        reason: 'Closure',
        effectiveDate: '2026-12-31',
      }, 'user-1');

      expect(tx.contractTermination.upsert).toHaveBeenCalledTimes(1);
      expect(tx.contract.update).toHaveBeenCalledWith({
        where: { id: 'contract-1' },
        data: { status: ContractStatus.TERMINATING },
      });
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it('completes termination, Contract and Unit state through one transaction client', async () => {
      tx.contractTermination.findUnique.mockResolvedValue({
        id: 'term-1',
        status: 'IN_PROGRESS',
        accessCardReturn: true,
        signageRemoved: true,
        keysReturned: true,
      });

      await service.complete('contract-1');

      expect(tx.contract.update).toHaveBeenCalledWith({
        where: { id: 'contract-1' },
        data: { status: ContractStatus.TERMINATED },
      });
      expect(unitStatus.transition).toHaveBeenCalledWith(
        'unit-1',
        UnitStatus.VACANT,
        { reason: 'Contract contract-1 terminated' },
        tx,
      );
    });
  });

  describe('amendment approval', () => {
    const tx: any = {
      contract: { update: jest.fn() },
      contractAmendment: { findUnique: jest.fn(), update: jest.fn() },
    };
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const events: any = { logEvent: jest.fn() };
    const billingSchedule: any = { buildScheduleForContract: jest.fn() };
    let service: ContractAmendmentsService;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new ContractAmendmentsService(prisma, events, billingSchedule);
      tx.contractAmendment.findUnique.mockResolvedValue({
        id: 'amendment-1',
        amendmentNumber: 'AMD-1',
        contractId: 'contract-1',
        status: AmendmentStatus.SUBMITTED,
        type: AmendmentType.RENT_CHANGE,
        changes: { rent: 120 },
        reason: 'Annual review',
        contract: { rent: 100 },
      });
      tx.contract.update.mockResolvedValue({ id: 'contract-1' });
      tx.contractAmendment.update.mockResolvedValue({
        id: 'amendment-1',
        status: AmendmentStatus.APPLIED,
      });
      billingSchedule.buildScheduleForContract.mockResolvedValue(undefined);
      events.logEvent.mockResolvedValue(undefined);
    });

    it('applies Contract, schedule, amendment status and audit through one transaction', async () => {
      await service.approve('amendment-1', 'user-1');

      expect(tx.contract.update).toHaveBeenCalledWith({
        where: { id: 'contract-1' },
        data: { rent: 120 },
      });
      expect(billingSchedule.buildScheduleForContract).toHaveBeenCalledWith('contract-1', tx);
      expect(tx.contractAmendment.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: AmendmentStatus.APPLIED }),
      }));
      expect(events.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'AMENDMENT_APPLIED' }),
        tx,
      );
    });
  });
});
