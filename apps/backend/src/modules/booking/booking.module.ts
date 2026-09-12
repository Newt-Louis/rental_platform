import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingScheduler } from './booking.scheduler';
import { CategoriesModule } from '../categories/categories.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ScheduleModule, CategoriesModule, ApprovalsModule, NotificationsModule],
  controllers: [BookingController],
  providers: [BookingService, BookingScheduler],
  exports: [BookingService],
})
export class BookingModule {}
