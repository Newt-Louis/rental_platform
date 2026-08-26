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

  // Billing Add-in: Phụ thu Phí Quản Lý (MANAGEMENT_FEE_SURCHARGE) chỉ hợp lệ cho hợp đồng
  // thuộc Mall Văn phòng (leaseCategory = OFFICE) — chặn sớm khi bật periodicChargeTypes.
  describe('periodicChargeTypes MANAGEMENT_FEE_SURCHARGE — OFFICE-only guard', () => {
    beforeEach(() => {
      prisma.contract.findUnique.mockResolvedValue({
        id: 'contract-1', status: ContractStatus.DRAFT, unitId: 'unit-1', periodicChargeTypes: [],
      });
    });

    it('rejects enabling MANAGEMENT_FEE_SURCHARGE for a MALL-category unit', async () => {
      prisma.unit.findUnique.mockResolvedValue({ mall: { leaseCategory: 'MALL' } });

      await expect(
        service.update('contract-1', { periodicChargeTypes: ['MANAGEMENT_FEE_SURCHARGE'] as any }, 'user-1'),
      ).rejects.toThrow('leaseCategory = OFFICE');
      expect(tx.contract.update).not.toHaveBeenCalled();
    });

    it('allows enabling MANAGEMENT_FEE_SURCHARGE for an OFFICE-category unit', async () => {
      prisma.unit.findUnique.mockResolvedValue({ mall: { leaseCategory: 'OFFICE' } });
      tx.contract.update.mockResolvedValue({ id: 'contract-1', periodicChargeTypes: ['MANAGEMENT_FEE_SURCHARGE'] });

      await service.update('contract-1', { periodicChargeTypes: ['MANAGEMENT_FEE_SURCHARGE'] as any }, 'user-1');

      expect(tx.contract.update).toHaveBeenCalledWith({
        where: { id: 'contract-1' },
        data: { periodicChargeTypes: ['MANAGEMENT_FEE_SURCHARGE'] },
      });
    });

    it('does not check leaseCategory for UTILITY/AFTER_HOURS_COOLING (both lease types)', async () => {
      tx.contract.update.mockResolvedValue({ id: 'contract-1', periodicChargeTypes: ['UTILITY'] });

      await service.update('contract-1', { periodicChargeTypes: ['UTILITY'] as any }, 'user-1');

      expect(prisma.unit.findUnique).not.toHaveBeenCalled();
      expect(tx.contract.update).toHaveBeenCalled();
    });
  });
});
