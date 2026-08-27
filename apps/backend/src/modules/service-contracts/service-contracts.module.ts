import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { StorageModule } from '../../storage/storage.module';
import { ServiceContractsController } from './service-contracts.controller';
import { ServiceContractsService } from './service-contracts.service';
import { ServiceContractReminderScheduler } from './service-contract-reminder.scheduler';

@Module({
  imports: [StorageModule, MulterModule.register({ storage: memoryStorage() })],
  controllers: [ServiceContractsController],
  providers: [ServiceContractsService, ServiceContractReminderScheduler],
})
export class ServiceContractsModule {}
