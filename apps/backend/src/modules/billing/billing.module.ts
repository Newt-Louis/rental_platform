import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingScheduleService } from './billing-schedule.service';
import { BillingScheduler } from './billing-scheduler';
import { ArDunningService } from './ar-dunning.service';
import { PenaltyInterestService } from './penalty-interest.service';
import { CollectionKpiService } from './collection-kpi.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../../storage/storage.module';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Module({
  imports: [NotificationsModule, StorageModule, MulterModule.register({ storage: memoryStorage() })],
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
