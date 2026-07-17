import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingService } from './booking.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';

@Injectable()
export class BookingScheduler {
  private readonly logger = new Logger(BookingScheduler.name);

  constructor(
    private readonly bookingService: BookingService,
    private readonly schedulerLock: SchedulerLockService,
  ) {}

  // Chạy mỗi giờ để tự động expire booking quá hạn
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'booking-expire-overdue',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async handleExpiredBookings() {
    await this.schedulerLock.runExclusive('booking-expire-overdue', 55 * 60_000, async () => {
      const result = await this.bookingService.expireOverdueBookings();
      if (result.expiredCount > 0) {
        this.logger.log(`Auto-expired ${result.expiredCount} booking(s)`);
      }
    });
  }
}
