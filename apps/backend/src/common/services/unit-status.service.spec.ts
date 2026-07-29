import { BadRequestException } from '@nestjs/common';
import { UnitStatus } from '@prisma/client';
import { UnitStatusService } from './unit-status.service';

describe('UnitStatusService lifecycle integrity', () => {
  const prisma: any = {
    unit: { findUnique: jest.fn(), update: jest.fn() },
    contract: { findFirst: jest.fn() },
    unitBooking: { findFirst: jest.fn() },
    unitHistory: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new UnitStatusService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.contract.findFirst.mockResolvedValue(null);
    prisma.unitBooking.findFirst.mockResolvedValue(null);
    prisma.unit.update.mockResolvedValue({ id: 'unit-1' });
    prisma.unitHistory.create.mockResolvedValue({ id: 'history-1' });
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it('does not downgrade a unit that has a live contract', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', status: UnitStatus.CONTRACTED });
    prisma.contract.findFirst.mockResolvedValue({ contractNumber: 'CTR-001' });

    await expect(service.transition('unit-1', UnitStatus.BOOKING, { force: true }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.unit.update).not.toHaveBeenCalled();
  });

  it('requires a real active booking before entering BOOKING', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', status: UnitStatus.VACANT });

    await expect(service.transition('unit-1', UnitStatus.BOOKING))
      .rejects.toThrow('Cannot set BOOKING without an active booking');
  });

  it('updates BOOKING and records history when an active booking exists', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', status: UnitStatus.VACANT });
    prisma.unitBooking.findFirst.mockResolvedValue({ id: 'booking-1' });

    await service.transition('unit-1', UnitStatus.BOOKING, { userId: 'user-1' });

    expect(prisma.unit.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: UnitStatus.BOOKING, vacantSince: null }),
    }));
    expect(prisma.unitHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ oldValue: UnitStatus.VACANT, newValue: UnitStatus.BOOKING }),
    }));
  });
});
