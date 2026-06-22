import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingService } from './booking.service';

@Injectable()
export class BookingScheduler {
  private readonly logger = new Logger(BookingScheduler.name);

  constructor(private readonly bookingService: BookingService) {}

  // Chạy mỗi giờ để tự động expire booking quá hạn
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredBookings() {
    const result = await this.bookingService.expireOverdueBookings();
    if (result.expiredCount > 0) {
      this.logger.log(`Auto-expired ${result.expiredCount} booking(s)`);
    }
  }
}
