import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HandoverReadinessController } from './handover-readiness.controller';
import { HandoverReadinessService } from './handover-readiness.service';
import { HandoverReadinessAccessService } from './handover-readiness-access.service';
import { HandoverReadinessCommitmentsService } from './handover-readiness-commitments.service';
import { HandoverReadinessNotifierService } from './handover-readiness-notifier.service';
import { HandoverReadinessScheduler } from './handover-readiness.scheduler';

@Module({
  imports: [PrismaModule, StorageModule, NotificationsModule, MulterModule.register({ storage: memoryStorage() })],
  controllers: [HandoverReadinessController],
  providers: [
    HandoverReadinessService,
    HandoverReadinessAccessService,
    HandoverReadinessCommitmentsService,
    HandoverReadinessNotifierService,
    HandoverReadinessScheduler,
  ],
  exports: [HandoverReadinessService],
})
export class HandoverReadinessModule {}
