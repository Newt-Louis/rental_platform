import { Module } from '@nestjs/common';
import { BillingAddInController } from './billing-addin.controller';
import { BillingAddInService } from './billing-addin.service';
import { BillingAddInScheduler } from './billing-addin.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [BillingAddInController],
  providers: [BillingAddInService, BillingAddInScheduler],
  exports: [BillingAddInService],
})
export class BillingAddInModule {}
