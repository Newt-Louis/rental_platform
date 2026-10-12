import { notifySlotApprovers, releaseSlotBookingAfterFailure, markSlotBookingContracted } from './slot-booking-release';

describe('slot-booking-release', () => {
  const db: any = {
    slotBooking: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
    notification: { createMany: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  describe('notifySlotApprovers', () => {
    it('notifies active Leasing Manager / Mall Director of the booking mall', async () => {
      db.slotBooking.findUnique.mockResolvedValue({ id: 'b1', slot: { unit: { mallId: 'm1' } } });
      db.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

      const n = await notifySlotApprovers(db, 'b1', { title: 't', body: 'b', type: 'X' });

      expect(n).toBe(2);
      expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          mallAccess: { some: { mallId: 'm1', isActive: true, role: { in: ['LEASING_MANAGER', 'MALL_DIRECTOR'] } } },
        }),
      }));
      expect(db.notification.createMany.mock.calls[0][0].data).toHaveLength(2);
      expect(db.notification.createMany.mock.calls[0][0].data[0]).toMatchObject({
        userId: 'u1', type: 'X', entityType: 'SLOT_BOOKING', entityId: 'b1',
      });
    });

    it('never throws: a notification failure must not break the booking flow', async () => {
      db.slotBooking.findUnique.mockRejectedValue(new Error('db down'));
      await expect(notifySlotApprovers(db, 'b1', { title: 't', body: 'b', type: 'X' })).resolves.toBe(0);
    });

    it('does nothing when nobody can approve in that mall', async () => {
      db.slotBooking.findUnique.mockResolvedValue({ id: 'b1', slot: { unit: { mallId: 'm1' } } });
      db.user.findMany.mockResolvedValue([]);
      await expect(notifySlotApprovers(db, 'b1', { title: 't', body: 'b', type: 'X' })).resolves.toBe(0);
      expect(db.notification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('releaseSlotBookingAfterFailure', () => {
    it('cancels a booking that still holds the slot and reports bookings that can be reopened', async () => {
      db.slotBooking.findUnique.mockResolvedValue({ status: 'CONVERTED' });
      db.slotBooking.findMany.mockResolvedValue([{ id: 'b2', bookingRef: 'SB-2' }]);
      const result = await releaseSlotBookingAfterFailure(db, 'b1', 'failed');
      expect(db.slotBooking.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { status: 'CANCELLED', cancelReason: 'failed' } });
      expect(result).toEqual({ released: true, reopenable: [{ id: 'b2', bookingRef: 'SB-2' }] });
    });

    it('leaves a booking alone that does not hold the slot', async () => {
      db.slotBooking.findUnique.mockResolvedValue({ status: 'PENDING' });
      const result = await releaseSlotBookingAfterFailure(db, 'b1', 'failed');
      expect(db.slotBooking.update).not.toHaveBeenCalled();
      expect(result.released).toBe(false);
    });
  });

  it('markSlotBookingContracted only moves bookings that were approved/converted', async () => {
    await markSlotBookingContracted(db, 'b1');
    expect(db.slotBooking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: { in: ['APPROVED', 'CONFIRMED', 'CONVERTED'] } },
      data: { status: 'CONTRACTED' },
    });
    await markSlotBookingContracted(db, null);
    expect(db.slotBooking.updateMany).toHaveBeenCalledTimes(1);
  });
});
