/**
 * Deleting a Proposal gives its Booking back (BOOK-RELEASE, Proposal side).
 * The Booking screen must stop claiming a Proposal exists, and the Booking must
 * become cancellable again so its Unit can be released.
 */
import { BadRequestException } from '@nestjs/common';
import { BookingStatus, ProposalStatus } from '@prisma/client';
import { ProposalsService } from './proposals.service';

function harness(opts: { proposal: any; booking?: any }) {
  const tx: any = {
    proposal: { findUniqueOrThrow: jest.fn().mockResolvedValue(opts.proposal), update: jest.fn() },
    unitBooking: { findUnique: jest.fn().mockResolvedValue(opts.booking ?? null), update: jest.fn() },
    bookingActivity: { create: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const service = new (ProposalsService as any)(prisma, {}, {}, {}, { create: jest.fn() }, {}, {}, { increment: jest.fn() }, {}, {}, {}, {}, {}) as ProposalsService;
  (service as any).findOne = jest.fn().mockResolvedValue(opts.proposal);
  return { service, tx, prisma };
}

const proposal = (over: Record<string, unknown> = {}) => ({
  id: 'p-1', proposalNumber: 'PRO-2026-00011', status: ProposalStatus.DRAFT, isActive: true, bookingId: 'bk-1', ...over,
});
const booking = (over: Record<string, unknown> = {}) => ({
  id: 'bk-1', bookingNumber: 'BK-2026-00002', status: BookingStatus.CONVERTED, isActive: true, ...over,
});

describe('ProposalsService.remove', () => {
  it('BOOK-RELEASE-008 deleting the Proposal puts its Booking back to ACTIVE and records why', async () => {
    const { service, tx } = harness({ proposal: proposal(), booking: booking() });

    const result = await service.remove('p-1', 'u-manager');

    expect(tx.proposal.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p-1' },
      data: expect.objectContaining({ isActive: false, bookingId: null }),
    }));
    expect(tx.unitBooking.update).toHaveBeenCalledWith({
      where: { id: 'bk-1' },
      data: { status: BookingStatus.ACTIVE, convertedAt: null },
    });
    expect(tx.bookingActivity.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      bookingId: 'bk-1', type: 'NOTE_ADDED', performedById: 'u-manager',
      note: expect.stringContaining('PRO-2026-00011'),
    }));
    expect(result).toEqual({ message: 'Đề xuất đã được xóa', bookingRestored: 'BK-2026-00002' });
  });

  it('BOOK-RELEASE-009 a Proposal with no Booking behind it deletes as before', async () => {
    const { service, tx } = harness({ proposal: proposal({ bookingId: null }) });
    const result = await service.remove('p-1', 'u-manager');
    expect(tx.unitBooking.update).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'Đề xuất đã được xóa', bookingRestored: null });
  });

  it('BOOK-RELEASE-010 a Booking already moved on (cancelled, or converted again) is left alone', async () => {
    const { service, tx } = harness({ proposal: proposal(), booking: booking({ status: BookingStatus.CANCELLED }) });
    const result = await service.remove('p-1', 'u-manager');
    expect(tx.unitBooking.update).not.toHaveBeenCalled();
    expect(result.bookingRestored).toBeNull();
  });

  it('BOOK-RELEASE-011 deleting twice is not an error and does not restore the Booking twice', async () => {
    const { service, tx } = harness({ proposal: proposal({ isActive: false }), booking: booking() });
    const result = await service.remove('p-1', 'u-manager');
    expect(tx.proposal.update).not.toHaveBeenCalled();
    expect(tx.unitBooking.update).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'Đề xuất đã được xóa', bookingRestored: null });
  });

  it.each([ProposalStatus.SUBMITTED, ProposalStatus.APPROVED, ProposalStatus.CONVERTED])('BOOK-RELEASE-012 a %s Proposal cannot be deleted, so its Booking is untouched', async (status) => {
    const { service, tx, prisma } = harness({ proposal: proposal({ status }), booking: booking() });
    await expect(service.remove('p-1', 'u-manager')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.unitBooking.update).not.toHaveBeenCalled();
  });

  it('BOOK-RELEASE-013 a status that changed between the check and the transaction still blocks the delete', async () => {
    const { service, tx } = harness({ proposal: proposal(), booking: booking() });
    tx.proposal.findUniqueOrThrow.mockResolvedValue(proposal({ status: ProposalStatus.SUBMITTED }));
    await expect(service.remove('p-1', 'u-manager')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.proposal.update).not.toHaveBeenCalled();
    expect(tx.unitBooking.update).not.toHaveBeenCalled();
  });
});
