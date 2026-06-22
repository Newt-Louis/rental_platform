import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingScheduleService } from './billing-schedule.service';
import { BillingScheduler } from './billing-scheduler';
import { ArDunningService } from './ar-dunning.service';
import { PenaltyInterestService } from './penalty-interest.service';
import { CollectionKpiService } from './collection-kpi.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingScheduleService,
    BillingScheduler,
    ArDunningService,
    PenaltyInterestService,
    CollectionKpiService,
  ],
  exports: [BillingService, BillingScheduleService, ArDunningService],
})
export class BillingModule {}
