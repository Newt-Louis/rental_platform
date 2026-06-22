import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingScheduler } from './booking.scheduler';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [ScheduleModule, CategoriesModule],
  controllers: [BookingController],
  providers: [BookingService, BookingScheduler],
  exports: [BookingService],
})
export class BookingModule {}
