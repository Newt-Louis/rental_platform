// Dong bo trang thai booking ngan han khi Proposal/Hop dong thanh cong hoac that bai.
// Dung chung boi proposals va contracts, chay trong cung transaction voi thay doi cua chung.
import { Prisma } from '@prisma/client';
import { SLOT_HARD_HOLD_STATUSES } from './slot-allocation';

type Db = Pick<Prisma.TransactionClient, 'slotBooking'>;
type NotifyDb = Pick<Prisma.TransactionClient, 'slotBooking' | 'user' | 'notification'>;

/**
 * Bao cho nguoi co tham quyen duyet booking ngan han (Leasing Manager / Mall Director dang
 * hoat dong tai Mall cua booking) rang co viec can xu ly: xung dot cho xac nhan khoa, hoac
 * booking bi khoa co the mo lai. Khong bao gio lam hong luong chinh: loi thong bao chi duoc nuot.
 */
export async function notifySlotApprovers(
  db: NotifyDb,
  bookingId: string,
  note: { title: string; body: string; type: string },
) {
  try {
    const booking = await db.slotBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, slot: { select: { unit: { select: { mallId: true } } } } },
    });
    const mallId = booking?.slot?.unit?.mallId;
    if (!mallId) return 0;
    const approvers = await db.user.findMany({
      where: {
        isActive: true,
        mallAccess: { some: { mallId, isActive: true, role: { in: ['LEASING_MANAGER', 'MALL_DIRECTOR'] } } },
      },
      select: { id: true },
    });
    if (!approvers.length) return 0;
    await db.notification.createMany({
      data: approvers.map((u) => ({
        userId: u.id,
        title: note.title,
        body: note.body,
        type: note.type,
        entityType: 'SLOT_BOOKING',
        entityId: bookingId,
      })),
    });
    return approvers.length;
  } catch {
    return 0;
  }
}

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
  if (!slotBookingId) return { released: false, reopenable: [] as Array<{ id: string; bookingRef: string }> };
  const booking = await db.slotBooking.findUnique({ where: { id: slotBookingId }, select: { status: true } });
  if (!booking || !(SLOT_HARD_HOLD_STATUSES as readonly string[]).includes(booking.status)) {
    return { released: false, reopenable: [] as Array<{ id: string; bookingRef: string }> };
  }
  await db.slotBooking.update({
    where: { id: slotBookingId },
    data: { status: 'CANCELLED', cancelReason: reason },
  });
  await db.slotBooking.updateMany({
    where: { conflictWithBookingId: slotBookingId, status: { in: ['PENDING', 'SUBMITTED'] } },
    data: { conflictWithBookingId: null, conflictFlaggedAt: null },
  });
  const reopenable = await db.slotBooking.findMany({
    where: { lockedByBookingId: slotBookingId, status: 'LOCKED' },
    select: { id: true, bookingRef: true },
  });
  return { released: true, reopenable };
}
