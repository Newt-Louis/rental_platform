import { BadRequestException } from '@nestjs/common';
import { SlotsService } from './slots.service';

describe('SlotsService short-term booking timeline', () => {
  const prisma = {
    slotBooking: { findMany: jest.fn() },
  } as any;
  const service = new SlotsService(prisma, {} as any);

  beforeEach(() => jest.clearAllMocks());

  it('accepts installation, rental and dismantling in chronological order', () => {
    expect(() => (service as any).validateBookingTimeline({
      installationStart: new Date('2026-08-17T07:00:00Z'),
      installationEnd: new Date('2026-08-17T09:00:00Z'),
      rentalStart: new Date('2026-08-17T09:00:00Z'),
      rentalEnd: new Date('2026-08-17T18:00:00Z'),
      dismantlingStart: new Date('2026-08-17T18:00:00Z'),
      dismantlingEnd: new Date('2026-08-17T20:00:00Z'),
    })).not.toThrow();
  });

  it('rejects a rental that starts before installation is complete', () => {
    expect(() => (service as any).validateBookingTimeline({
      installationStart: new Date('2026-08-17T07:00:00Z'),
      installationEnd: new Date('2026-08-17T10:00:00Z'),
      rentalStart: new Date('2026-08-17T09:00:00Z'),
      rentalEnd: new Date('2026-08-17T18:00:00Z'),
      dismantlingStart: new Date('2026-08-17T18:00:00Z'),
      dismantlingEnd: new Date('2026-08-17T20:00:00Z'),
    })).toThrow(BadRequestException);
  });

  it('detects conflict during installation even when rental windows do not overlap', async () => {
    prisma.slotBooking.findMany.mockResolvedValue([{
      bookingRef: 'SB-2026-00001',
      installationStartDatetime: new Date('2026-08-17T07:00:00Z'),
      dismantlingEndDatetime: new Date('2026-08-17T20:00:00Z'),
      startDatetime: new Date('2026-08-17T09:00:00Z'),
      endDatetime: new Date('2026-08-17T18:00:00Z'),
    }]);

    const conflict = await (service as any).findBookingConflict(
      'slot-1',
      new Date('2026-08-17T06:00:00Z'),
      new Date('2026-08-17T08:00:00Z'),
    );
    expect(conflict.bookingRef).toBe('SB-2026-00001');
  });
});
