// Dong bo trang thai booking ngan han khi Proposal/Hop dong thanh cong hoac that bai.
// Dung chung boi proposals va contracts, chay trong cung transaction voi thay doi cua chung.
import { Prisma } from '@prisma/client';
import { SLOT_HARD_HOLD_STATUSES } from './slot-allocation';

type Db = Pick<Prisma.TransactionClient, 'slotBooking'>;

/** Hop dong da duoc tao tu Proposal cua booking -> booking CONTRACTED (slot ghi nhan da khai thac). */
export async function markSlotBookingContracted(db: Db, slotBookingId: string | null | undefined) {
  if (!slotBookingId) return;
  await db.slotBooking.updateMany({
    where: { id: slotBookingId, status: { in: ['APPROVED', 'CONFIRMED', 'CONVERTED'] } },
    data: { status: 'CONTRACTED' },
  });
}

/**
 * Proposal bi tu choi / hop dong that bai: booking dang chiem slot duoc giai phong (CANCELLED).
 * Cac booking da bi LOCKED vi no KHONG tu mo lai -- chung hien trong danh sach "can xu ly"
 * de nguoi co tham quyen xac nhan mo lai. Co xung dot chua khoa thi duoc go co.
 */
export async function releaseSlotBookingAfterFailure(
  db: Db,
  slotBookingId: string | null | undefined,
  reason: string,
) {
  if (!slotBookingId) return { released: false };
  const booking = await db.slotBooking.findUnique({ where: { id: slotBookingId }, select: { status: true } });
  if (!booking || !(SLOT_HARD_HOLD_STATUSES as readonly string[]).includes(booking.status)) {
    return { released: false };
  }
  await db.slotBooking.update({
    where: { id: slotBookingId },
    data: { status: 'CANCELLED', cancelReason: reason },
  });
  await db.slotBooking.updateMany({
    where: { conflictWithBookingId: slotBookingId, status: { in: ['PENDING', 'SUBMITTED'] } },
    data: { conflictWithBookingId: null, conflictFlaggedAt: null },
  });
  return { released: true };
}
