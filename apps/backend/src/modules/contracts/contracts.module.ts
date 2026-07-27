import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractEventsService } from './contract-events.service';
import { ContractTemplatesService, ContractAmendmentsService } from './contract-templates.service';
import { ContractTerminationService } from './contract-termination.service';
import { ContractExpiryStatusScheduler } from './contract-expiry-status.scheduler';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    BillingModule,
  ],
  controllers: [ContractsController],
  providers: [
    ContractsService,
    ContractEventsService,
    ContractTemplatesService,
    ContractAmendmentsService,
    ContractTerminationService,
    ContractExpiryStatusScheduler,
  ],
  exports: [ContractsService, ContractEventsService, ContractTerminationService],
})
export class ContractsModule {}
