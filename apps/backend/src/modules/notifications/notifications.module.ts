import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { ContractExpiryScheduler } from './contract-expiry.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, ContractExpiryScheduler],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
