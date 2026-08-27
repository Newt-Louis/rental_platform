import { BadRequestException } from '@nestjs/common';
import { ContractStatus, UnitStatus } from '@prisma/client';
import { BillingScheduleService } from '../billing/billing-schedule.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractEventsService } from './contract-events.service';
import { ContractsService } from './contracts.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { OutboxService } from '../../common/services/outbox.service';
import { OperationalMetricsService } from '../../common/services/operational-metrics.service';

describe('ContractsService activation workflow', () => {
  const tx = {
    contract: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    contractEvent: { create: jest.fn() },
  };
  const prisma = {
    contract: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const events = {};
  const unitStatus = {};
  const billingSchedule = { buildScheduleForContract: jest.fn() };
  const outbox = { enqueue: jest.fn() };
  const metrics = { increment: jest.fn() };
  let service: ContractsService;

  const readyContract = {
    id: 'contract-1',
    status: ContractStatus.DRAFT,
    tenantId: 'tenant-1',
    unitId: 'unit-1',
    isActive: true,
    deletedAt: null,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2027-01-01'),
    rent: 100,
    cam: 10,
    deposit: 300,
    paymentTerm: 30,
    tenant: { id: 'tenant-1', isActive: true, deletedAt: null },
    unit: { id: 'unit-1', isActive: true, status: UnitStatus.CONTRACTED },
    proposal: {
      handoverDate: new Date('2026-01-02'),
      openingDate: new Date('2026-02-01'),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    tx.contract.findUniqueOrThrow.mockResolvedValue(readyContract);
    tx.contract.update.mockResolvedValue({
      ...readyContract,
      status: ContractStatus.ACTIVE,
    });
    tx.contractEvent.create.mockResolvedValue({ id: 'event-1' });
    outbox.enqueue.mockResolvedValue({ id: 'outbox-1' });
    billingSchedule.buildScheduleForContract.mockResolvedValue({ periodsGenerated: 12 });
    service = new ContractsService(
      prisma as unknown as PrismaService,
      events as ContractEventsService,
      unitStatus as UnitStatusService,
      billingSchedule as unknown as BillingScheduleService,
      outbox as unknown as OutboxService,
      metrics as unknown as OperationalMetricsService,
    );
  });

  it('reports activation readiness with actionable prerequisites', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      ...readyContract,
      unit: { ...readyContract.unit, status: UnitStatus.VACANT },
    });

    const result = await service.getActivationReadiness('contract-1');

    expect(result.ready).toBe(false);
    expect(result.missing).toContain(
      'Unit must be CONTRACTED before activation (current: VACANT)',
    );
  });

  it('atomically changes status and writes the contract event before provisioning', async () => {
    prisma.contract.findUnique.mockResolvedValue(readyContract);

    const result = await service.updateStatus(
      'contract-1',
      ContractStatus.ACTIVE,
      'user-1',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.contract.update).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: { status: ContractStatus.ACTIVE },
    });
    expect(tx.contractEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contractId: 'contract-1',
        eventType: 'STATUS_CHANGED',
        beforeValue: ContractStatus.DRAFT,
        afterValue: ContractStatus.ACTIVE,
      }),
    });
    expect(outbox.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventKey: 'contract:contract-1:activated',
        eventName: 'contract.activated',
      }),
    );
    expect(billingSchedule.buildScheduleForContract).toHaveBeenCalledWith(
      'contract-1',
      tx,
    );
    expect(result.status).toBe(ContractStatus.ACTIVE);
  });

  it('rejects activation before any status mutation when prerequisites fail', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      ...readyContract,
      tenant: { ...readyContract.tenant, isActive: false },
    });

    await expect(
      service.updateStatus('contract-1', ContractStatus.ACTIVE, 'user-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('replays provisioning idempotently without creating another status event', async () => {
    const activeContract = { ...readyContract, status: ContractStatus.ACTIVE };
    prisma.contract.findUnique.mockResolvedValue(activeContract);
    tx.contract.findUniqueOrThrow.mockResolvedValue(activeContract);

    await service.updateStatus('contract-1', ContractStatus.ACTIVE, 'user-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.contract.update).not.toHaveBeenCalled();
    expect(tx.contractEvent.create).not.toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ eventKey: 'contract:contract-1:activated' }),
    );
    expect(billingSchedule.buildScheduleForContract).toHaveBeenCalledWith(
      'contract-1',
      tx,
    );
  });

  it('resolves a lost concurrent-activation race instead of surfacing a serialization error', async () => {
    prisma.contract.findUnique
      .mockResolvedValueOnce(readyContract) // getActivationReadiness pre-check
      .mockResolvedValueOnce({ ...readyContract, status: ContractStatus.ACTIVE }); // post-catch re-fetch
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });

    const result = await service.updateStatus('contract-1', ContractStatus.ACTIVE, 'user-1');

    expect(result.status).toBe(ContractStatus.ACTIVE);
  });
});
