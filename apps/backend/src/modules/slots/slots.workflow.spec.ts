import { BadRequestException, ConflictException } from '@nestjs/common';
import { SlotsService } from './slots.service';

// Luong duyet booking ngan han: khong FIFS, duyet truoc thang, xung dot chi bi khoa khi co nguoi xac nhan.
describe('SlotsService approval workflow', () => {
  const tx: any = {
    slotBooking: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    slotBookingLine: { findMany: jest.fn() },
    unitSlot: { findUnique: jest.fn() },
  };
  const prisma: any = {
    slotBooking: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(async (op: any) => op(tx)),
  };
  let service: SlotsService;

  const window = {
    startDatetime: new Date('2026-09-02T09:00:00Z'),
    endDatetime: new Date('2026-09-03T18:00:00Z'),
    installationStartDatetime: new Date('2026-09-02T07:00:00Z'),
    dismantlingEndDatetime: new Date('2026-09-03T20:00:00Z'),
  };
  const booking = (over: any = {}) => ({
    id: 'b1', bookingRef: 'SB-1', slotId: 's1', totalArea: 100, status: 'SUBMITTED',
    currencyCode: 'VND', totalAmount: 10, ...window, ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SlotsService(prisma, { isCommittedToTenant: jest.fn(() => false) } as any);
    tx.slotBookingLine.findMany.mockResolvedValue([{ slotId: 's1', areaRented: 100, slot: { area: 100, code: 'S1' } }]);
    tx.slotBooking.findMany.mockResolvedValue([]);
    tx.slotBooking.update.mockImplementation(async ({ data }: any) => ({ id: 'b1', ...data }));
  });

  it('submit: only PENDING can be submitted', async () => {
    prisma.slotBooking.findUnique.mockResolvedValue(booking({ status: 'APPROVED' }));
    await expect(service.submitBooking('b1')).rejects.toBeInstanceOf(BadRequestException);
    prisma.slotBooking.findUnique.mockResolvedValue(booking({ status: 'PENDING' }));
    prisma.slotBooking.update.mockResolvedValue({ id: 'b1', status: 'SUBMITTED' });
    await expect(service.submitBooking('b1')).resolves.toMatchObject({ status: 'SUBMITTED' });
  });

  it('approve: only SUBMITTED can be approved', async () => {
    tx.slotBooking.findUnique.mockResolvedValue(booking({ status: 'PENDING' }));
    await expect(service.approveBooking('b1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approve: refused when an earlier-approved booking already occupies the slot', async () => {
    tx.slotBooking.findUnique.mockResolvedValue(booking());
    tx.slotBooking.findMany.mockResolvedValueOnce([
      { id: 'other', bookingRef: 'SB-0', ...window, lines: [{ areaRented: 100 }] },
    ]);
    await expect(service.approveBooking('b1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.slotBooking.update).not.toHaveBeenCalled();
  });

  it('approve: flags overlapping unapproved bookings instead of locking them', async () => {
    tx.slotBooking.findUnique.mockResolvedValue(booking());
    tx.slotBooking.findMany
      .mockResolvedValueOnce([]) // no hard conflict for b1
      .mockResolvedValueOnce([booking({ id: 'b2', bookingRef: 'SB-2', status: 'SUBMITTED' })]) // candidates
      .mockResolvedValueOnce([{ id: 'b1', bookingRef: 'SB-1', ...window, lines: [{ areaRented: 100 }] }]); // hard conflict for b2
    const result: any = await service.approveBooking('b1', 'u1');
    expect(result.conflictedBookingIds).toEqual(['b2']);
    const b2Update = tx.slotBooking.update.mock.calls.find((c: any) => c[0].where.id === 'b2')[0];
    expect(b2Update.data).toMatchObject({ conflictWithBookingId: 'b1' });
    expect(b2Update.data.status).toBeUndefined(); // chua khoa -- cho nguoi xac nhan
  });

  it('approve: a partial-area booking does not flag a booking that still fits', async () => {
    tx.slotBooking.findUnique.mockResolvedValue(booking());
    tx.slotBookingLine.findMany
      .mockResolvedValueOnce([{ slotId: 's1', areaRented: 40, slot: { area: 100, code: 'S1' } }]) // b1
      .mockResolvedValueOnce([{ slotId: 's1', areaRented: 40, slot: { area: 100, code: 'S1' } }]) // b1 again (candidates)
      .mockResolvedValueOnce([{ slotId: 's1', areaRented: 50, slot: { area: 100, code: 'S1' } }]); // b2
    tx.slotBooking.findMany
      .mockResolvedValueOnce([]) // no hard conflict for b1
      .mockResolvedValueOnce([booking({ id: 'b2', status: 'SUBMITTED' })]) // candidates
      .mockResolvedValueOnce([{ id: 'b1', bookingRef: 'SB-1', ...window, lines: [{ areaRented: 40 }] }]); // approved b1 (40) + b2 (50) <= 100
    const result: any = await service.approveBooking('b1', 'u1');
    expect(result.conflictedBookingIds).toEqual([]);
  });

  it('confirm-lock: moves a flagged booking to LOCKED only when the blocker still holds the slot', async () => {
    prisma.slotBooking.findUnique
      .mockResolvedValueOnce(booking({ id: 'b2', status: 'SUBMITTED', conflictWithBookingId: 'b1' }))
      .mockResolvedValueOnce({ id: 'b1', bookingRef: 'SB-1', status: 'APPROVED' });
    prisma.slotBooking.update.mockImplementation(async ({ data }: any) => ({ id: 'b2', ...data }));
    await expect(service.confirmConflictLock('b2')).resolves.toMatchObject({ status: 'LOCKED', lockedByBookingId: 'b1' });
  });

  it('confirm-lock: clears the flag and refuses when the blocker was already released', async () => {
    prisma.slotBooking.findUnique
      .mockResolvedValueOnce(booking({ id: 'b2', status: 'SUBMITTED', conflictWithBookingId: 'b1' }))
      .mockResolvedValueOnce({ id: 'b1', bookingRef: 'SB-1', status: 'CANCELLED' });
    await expect(service.confirmConflictLock('b2')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.slotBooking.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { conflictWithBookingId: null, conflictFlaggedAt: null },
    }));
  });

  it('reopen: refused while the blocking booking is still approved', async () => {
    tx.slotBooking.findUnique
      .mockResolvedValueOnce(booking({ id: 'b2', status: 'LOCKED', lockedByBookingId: 'b1' }))
      .mockResolvedValueOnce({ bookingRef: 'SB-1', status: 'CONTRACTED' });
    await expect(service.reopenBooking('b2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('reopen: LOCKED -> SUBMITTED once the blocker is released and the slot is free', async () => {
    tx.slotBooking.findUnique
      .mockResolvedValueOnce(booking({ id: 'b2', status: 'LOCKED', lockedByBookingId: 'b1' }))
      .mockResolvedValueOnce({ bookingRef: 'SB-1', status: 'CANCELLED' });
    const result: any = await service.reopenBooking('b2');
    expect(result).toMatchObject({ status: 'SUBMITTED', lockedByBookingId: null });
  });

  it('cancel: releases conflict flags that pointed at the cancelled booking', async () => {
    prisma.slotBooking.update.mockResolvedValue({ id: 'b1', status: 'CANCELLED' });
    prisma.slotBooking.updateMany.mockResolvedValue({ count: 2 });
    prisma.slotBooking.count.mockResolvedValue(1);
    await service.cancelBooking('b1', 'x');
    expect(prisma.slotBooking.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ conflictWithBookingId: 'b1' }),
    }));
  });
});
