/**
 * A Booking must never keep a Unit it no longer holds (BOOK-RELEASE).
 *
 * Converting a Booking to a Proposal puts it in CONVERTED, which is what the
 * Booking screen shows as "Đã lập đề xuất" and what blocks cancelling. If that
 * Proposal is then deleted, nothing holds the Unit any more — the Booking must
 * be cancellable so the Unit is released. Deleting a Booking outright must hand
 * the Unit over as well.
 */
import { BadRequestException } from '@nestjs/common';
import { BookingStatus, UnitStatus } from '@prisma/client';
import { BookingService } from './booking.service';

function harness(opts: { booking: any; activeProposals?: number; queued?: any }) {
  const tx: any = {
    unitBooking: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(opts.booking),
      findFirst: jest.fn().mockResolvedValue(opts.queued ?? null),
      update: jest.fn(),
    },
    proposal: { count: jest.fn().mockResolvedValue(opts.activeProposals ?? 0) },
    bookingActivity: { create: jest.fn() },
  };
  const prisma: any = {
    unitBooking: { findUnique: jest.fn().mockResolvedValue(opts.booking) },
    proposal: { count: jest.fn().mockResolvedValue(opts.activeProposals ?? 0) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const unitStatus = { transition: jest.fn() };
  const service = new BookingService(prisma, {} as any, unitStatus as any, {} as any, { create: jest.fn() } as any, {} as any, {} as any);
  return { service, prisma, tx, unitStatus };
}

const booking = (over: Record<string, unknown> = {}) => ({
  id: 'bk-1', bookingNumber: 'BK-2026-00002', unitId: 'unit-1', createdById: 'u-exec',
  status: BookingStatus.CONVERTED, isActive: true, ...over,
});

describe('Cancelling a booking whose Proposal is gone', () => {
  it('BOOK-RELEASE-001 a CONVERTED booking with no Proposal left can be cancelled, and the Unit goes back to VACANT', async () => {
    const { service, tx, unitStatus } = harness({ booking: booking(), activeProposals: 0 });

    const result = await service.cancel('bk-1', { reason: 'Đề xuất đã bị xóa' } as any, 'u-manager');

    expect(result).toEqual({ message: 'Booking đã được hủy' });
    expect(tx.unitBooking.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'bk-1' },
      data: expect.objectContaining({ status: BookingStatus.CANCELLED }),
    }));
    expect(unitStatus.transition).toHaveBeenCalledWith('unit-1', UnitStatus.VACANT, expect.anything(), tx);
  });

  it('BOOK-RELEASE-002 a CONVERTED booking that still has its Proposal cannot be cancelled', async () => {
    const { service, tx } = harness({ booking: booking(), activeProposals: 1 });

    await expect(service.cancel('bk-1', { reason: 'x' } as any, 'u-manager')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.unitBooking.update).not.toHaveBeenCalled();
  });

  it('BOOK-RELEASE-003 the Proposal check is repeated inside the transaction, so a conversion that lands first still wins', async () => {
    const { service, prisma, tx } = harness({ booking: booking(), activeProposals: 0 });
    // Pre-check sees no Proposal; by the time the transaction runs there is one.
    tx.proposal.count.mockResolvedValue(1);

    await expect(service.cancel('bk-1', { reason: 'x' } as any, 'u-manager')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.unitBooking.update).not.toHaveBeenCalled();
  });

  it('BOOK-RELEASE-004 an EXPIRED booking is still not cancellable', async () => {
    const { service } = harness({ booking: booking({ status: BookingStatus.EXPIRED }), activeProposals: 0 });
    await expect(service.cancel('bk-1', { reason: 'x' } as any, 'u-manager')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Deleting a booking releases the Unit it held', () => {
  it.each([BookingStatus.ACTIVE, BookingStatus.CONVERTED])('BOOK-RELEASE-005 deleting a %s booking, which held the Unit, hands it over', async (status) => {
    const { service, tx, unitStatus } = harness({ booking: booking({ status }) });

    await service.softDelete('bk-1', { id: 'admin', role: 'ADMIN' });

    expect(tx.unitBooking.update).toHaveBeenCalledWith({ where: { id: 'bk-1' }, data: { isActive: false } });
    expect(unitStatus.transition).toHaveBeenCalledWith('unit-1', UnitStatus.VACANT, expect.anything(), tx);
  });

  it('BOOK-RELEASE-006 the next booking in the queue takes the Unit instead of it going vacant', async () => {
    const { service, tx, unitStatus } = harness({ booking: booking({ status: BookingStatus.ACTIVE }), queued: { id: 'bk-2' } });

    await service.softDelete('bk-1', { id: 'admin', role: 'ADMIN' });

    expect(tx.unitBooking.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'bk-2' },
      data: expect.objectContaining({ status: BookingStatus.ACTIVE, priority: 1 }),
    }));
    expect(unitStatus.transition).toHaveBeenCalledWith('unit-1', UnitStatus.BOOKING, expect.anything(), tx);
  });

  it.each([BookingStatus.CANCELLED, BookingStatus.EXPIRED, BookingStatus.PENDING])('BOOK-RELEASE-007 deleting a %s booking, which holds nothing, touches no Unit', async (status) => {
    const { service, tx, unitStatus } = harness({ booking: booking({ status }) });

    await service.softDelete('bk-1', { id: 'admin', role: 'ADMIN' });

    expect(tx.unitBooking.update).toHaveBeenCalledWith({ where: { id: 'bk-1' }, data: { isActive: false } });
    // A queued booking is not the holder: releasing here would strand the real holder.
    expect(unitStatus.transition).not.toHaveBeenCalled();
    expect(tx.unitBooking.findFirst).not.toHaveBeenCalled();
  });

  it('BOOK-RELEASE-012 cancelling a queued booking neither releases the Unit nor promotes anyone', async () => {
    const { service, tx, unitStatus } = harness({ booking: booking({ status: BookingStatus.PENDING }), queued: { id: 'bk-3' } });

    await service.cancel('bk-1', { reason: 'Khách rút hồ sơ' } as any, 'u-manager');

    expect(tx.unitBooking.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'bk-1' }, data: expect.objectContaining({ status: BookingStatus.CANCELLED }),
    }));
    // Promoting here would have produced two ACTIVE owners for one Unit.
    expect(tx.unitBooking.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'bk-3' } }));
    expect(unitStatus.transition).not.toHaveBeenCalled();
  });

  it('BOOK-RELEASE-013 cancelling the holder does promote the next in queue', async () => {
    const { service, tx, unitStatus } = harness({ booking: booking({ status: BookingStatus.ACTIVE }), queued: { id: 'bk-3' } });

    await service.cancel('bk-1', { reason: 'Khách đổi ý' } as any, 'u-manager');

    expect(tx.unitBooking.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'bk-3' }, data: expect.objectContaining({ status: BookingStatus.ACTIVE, priority: 1 }),
    }));
    expect(unitStatus.transition).toHaveBeenCalledWith('unit-1', UnitStatus.BOOKING, expect.anything(), tx);
  });
});
