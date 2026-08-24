import { ContractStatus, Prisma, UnitStatus } from '@prisma/client';
import { ContractsService } from './contracts.service';

describe('ContractsService direct-write atomicity', () => {
  const tx: any = {
    unit: { findUnique: jest.fn() },
    contract: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    contractEvent: { create: jest.fn() },
  };
  const prisma: any = {
    unit: { findUnique: jest.fn() },
    contract: { findFirst: jest.fn(), findUnique: jest.fn() },
    proposal: { findUnique: jest.fn() },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
  };
  const events: any = { logEvent: jest.fn() };
  const unitStatus: any = { canTransition: jest.fn(() => true), transition: jest.fn() };
  let service: ContractsService;

  const dto: any = {
    tenantId: 'tenant-1',
    unitId: 'unit-1',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    term: 12,
    rent: 100,
    deposit: 300,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', status: UnitStatus.NEGOTIATING });
    prisma.contract.findFirst.mockResolvedValue(null);
    tx.unit.findUnique.mockResolvedValue({ id: 'unit-1', status: UnitStatus.NEGOTIATING });
    tx.contract.findFirst.mockResolvedValue(null);
    tx.contract.create.mockImplementation(({ data }: any) => ({
      id: 'contract-1',
      status: ContractStatus.DRAFT,
      ...data,
    }));
    events.logEvent.mockResolvedValue({ id: 'event-1' });
    unitStatus.transition.mockResolvedValue(undefined);
    service = new ContractsService(
      prisma,
      events,
      unitStatus,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('creates Contract, transitions Unit and writes audit through one Serializable transaction', async () => {
    await service.create(dto, 'user-1');

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(tx.contract.create).toHaveBeenCalledTimes(1);
    expect(unitStatus.transition).toHaveBeenCalledWith(
      'unit-1',
      UnitStatus.CONTRACTED,
      expect.objectContaining({ userId: 'user-1', tenantId: 'tenant-1' }),
      tx,
    );
    expect(events.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 'contract-1', eventType: 'CONTRACT_CREATED' }),
      tx,
    );
  });

  it('propagates an audit failure so the transaction can roll back the Contract and Unit writes', async () => {
    events.logEvent.mockRejectedValue(new Error('audit unavailable'));

    await expect(service.create(dto, 'user-1')).rejects.toThrow('audit unavailable');
    expect(unitStatus.transition).toHaveBeenCalledWith(
      'unit-1',
      UnitStatus.CONTRACTED,
      expect.any(Object),
      tx,
    );
  });

  it('retries a concurrent Serializable conflict so the winner is revalidated', async () => {
    prisma.$transaction
      .mockRejectedValueOnce(Object.assign(new Error('serialization conflict'), { code: 'P2034' }))
      .mockImplementationOnce(async (callback: any) => callback(tx));

    await service.create(dto, 'user-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.contract.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.contract.create).toHaveBeenCalledTimes(1);
  });

  it('updates Contract fields and writes their audit event through the same transaction', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      id: 'contract-1',
      status: ContractStatus.DRAFT,
      unitId: 'unit-1',
      notes: 'Before',
    });
    tx.contract.update.mockResolvedValue({
      id: 'contract-1',
      status: ContractStatus.DRAFT,
      unitId: 'unit-1',
      notes: 'After',
    });

    await service.update('contract-1', { notes: 'After' }, 'user-1');

    expect(tx.contract.update).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: { notes: 'After' },
    });
    expect(events.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 'contract-1', eventType: 'CONTRACT_UPDATED' }),
      tx,
    );
  });
});
