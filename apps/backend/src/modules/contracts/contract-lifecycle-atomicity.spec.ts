import { AmendmentStatus, AmendmentType, ContractStatus, UnitStatus } from '@prisma/client';
import { ContractTerminationService } from './contract-termination.service';
import { ContractAmendmentsService } from './contract-templates.service';

describe('Contract lifecycle atomicity', () => {
  describe('termination', () => {
    const tx: any = {
      contract: { findUnique: jest.fn(), update: jest.fn() },
      contractTermination: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
      unit: { findUnique: jest.fn() },
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
      tx.unit.findUnique.mockResolvedValue({ status: UnitStatus.OCCUPIED });
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
      expect(unitStatus.transition).toHaveBeenCalledWith(
        'unit-1',
        UnitStatus.LIQUIDATED,
        { reason: 'Termination initiated for contract contract-1', userId: 'user-1' },
        tx,
      );
    });

    it.each([UnitStatus.CONTRACTED, UnitStatus.UNDER_FITOUT, UnitStatus.OCCUPIED])(
      'captures the Unit status (%s) at initiate time as preTerminationUnitStatus, for both create and re-initiate-after-cancel paths',
      async (currentStatus) => {
        tx.unit.findUnique.mockResolvedValue({ status: currentStatus });

        await service.initiate('contract-1', {
          initiatedBy: 'TENANT',
          reason: 'Closure',
          effectiveDate: '2026-12-31',
        }, 'user-1');

        expect(tx.contractTermination.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({ preTerminationUnitStatus: currentStatus }),
            update: expect.objectContaining({ preTerminationUnitStatus: currentStatus }),
          }),
        );
      },
    );

    it('completes termination, Contract and Unit state through one transaction client', async () => {
      tx.contractTermination.findUnique.mockResolvedValue({
        id: 'term-1',
        status: 'IN_PROGRESS',
        accessCardReturn: true,
        signageRemoved: true,
        keysReturned: true,
      });

      await service.complete('contract-1', 'user-2');

      expect(tx.contract.update).toHaveBeenCalledWith({
        where: { id: 'contract-1' },
        data: { status: ContractStatus.TERMINATED },
      });
      expect(unitStatus.transition).toHaveBeenCalledWith(
        'unit-1',
        UnitStatus.VACANT,
        { reason: 'Contract contract-1 terminated', userId: 'user-2' },
        tx,
      );
    });

    it('cancels termination and restores Contract and Unit state through one transaction client', async () => {
      prisma.contract.findUnique.mockResolvedValue({
        unitId: 'unit-1',
        endDate: new Date('2030-01-01'),
      });
      prisma.contractTermination.findUnique.mockResolvedValue({ id: 'term-1', status: 'INITIATED' });

      await service.cancel('contract-1', 'user-3');

      expect(tx.contractTermination.update).toHaveBeenCalledWith({
        where: { contractId: 'contract-1' },
        data: { status: 'CANCELLED' },
      });
      expect(tx.contract.update).toHaveBeenCalledWith({
        where: { id: 'contract-1' },
        data: { status: ContractStatus.ACTIVE },
      });
      // No preTerminationUnitStatus on this (legacy-style) termination row -> falls back to
      // OCCUPIED, the only state that was ever reachable before this field existed.
      expect(unitStatus.transition).toHaveBeenCalledWith(
        'unit-1',
        UnitStatus.OCCUPIED,
        { reason: 'Termination cancelled for contract contract-1', userId: 'user-3' },
        tx,
      );
    });

    it.each([UnitStatus.CONTRACTED, UnitStatus.UNDER_FITOUT, UnitStatus.OCCUPIED])(
      'cancel restores the Unit to its captured preTerminationUnitStatus (%s), not a hardcoded OCCUPIED',
      async (priorStatus) => {
        prisma.contract.findUnique.mockResolvedValue({
          unitId: 'unit-1',
          endDate: new Date('2030-01-01'),
        });
        prisma.contractTermination.findUnique.mockResolvedValue({
          id: 'term-1',
          status: 'INITIATED',
          preTerminationUnitStatus: priorStatus,
        });

        await service.cancel('contract-1');

        expect(unitStatus.transition).toHaveBeenCalledWith(
          'unit-1',
          priorStatus,
          expect.objectContaining({ reason: 'Termination cancelled for contract contract-1' }),
          tx,
        );
      },
    );
  });

  describe('amendment approval', () => {
    const tx: any = {
      contract: { update: jest.fn() },
      contractAmendment: { findUnique: jest.fn(), update: jest.fn() },
      unit: { findUnique: jest.fn(), update: jest.fn() },
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
      // A rent-only amendment must never touch the Unit's denormalized lease dates.
      expect(tx.unit.update).not.toHaveBeenCalled();
    });

    it('syncs Unit.leaseEndDate when a renewal/extension amendment changes Contract.endDate — otherwise the "expiring soon" derivation goes stale', async () => {
      tx.contractAmendment.findUnique.mockResolvedValue({
        id: 'amendment-2',
        amendmentNumber: 'AMD-2',
        contractId: 'contract-1',
        status: AmendmentStatus.SUBMITTED,
        type: AmendmentType.RENEWAL,
        changes: { endDate: '2030-06-30' },
        reason: 'Renewal',
        contract: { unitId: 'unit-1', tenantId: 'tenant-1', endDate: new Date('2027-01-01') },
      });
      tx.unit.findUnique.mockResolvedValue({ id: 'unit-1', tenantId: 'tenant-1' });

      await service.approve('amendment-2', 'user-1');

      expect(tx.unit.update).toHaveBeenCalledWith({
        where: { id: 'unit-1' },
        data: { leaseEndDate: new Date('2030-06-30') },
      });
    });

    it('does not sync Unit lease dates when the Unit is no longer occupied by this contract\'s tenant (superseded/stale contract)', async () => {
      tx.contractAmendment.findUnique.mockResolvedValue({
        id: 'amendment-3',
        amendmentNumber: 'AMD-3',
        contractId: 'contract-1',
        status: AmendmentStatus.SUBMITTED,
        type: AmendmentType.RENEWAL,
        changes: { endDate: '2030-06-30' },
        reason: 'Renewal',
        contract: { unitId: 'unit-1', tenantId: 'tenant-1', endDate: new Date('2027-01-01') },
      });
      // Unit has since moved on to a different tenant — this amendment's contract is no longer
      // the live occupant, so its dates must not be written onto the Unit.
      tx.unit.findUnique.mockResolvedValue({ id: 'unit-1', tenantId: 'tenant-2' });

      await service.approve('amendment-3', 'user-1');

      expect(tx.unit.update).not.toHaveBeenCalled();
    });
  });
});
