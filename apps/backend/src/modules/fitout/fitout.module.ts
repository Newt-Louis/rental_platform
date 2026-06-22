import { Module } from '@nestjs/common';
import { FitoutController } from './fitout.controller';
import { FitoutService } from './fitout.service';
import { FitoutDocumentsService } from './fitout-documents.service';
import { FitoutSlaService } from './fitout-sla.service';
import { FitoutContractorService } from './fitout-contractor.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [FitoutController],
  providers: [FitoutService, FitoutDocumentsService, FitoutSlaService, FitoutContractorService],
  exports: [FitoutService, FitoutDocumentsService, FitoutSlaService, FitoutContractorService],
})
export class FitoutModule {}
