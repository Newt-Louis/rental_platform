import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { ContractExpiryScheduler } from './contract-expiry.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmailDeliveryService } from './email-delivery.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, EmailDeliveryService, ContractExpiryScheduler],
  exports: [NotificationsService, EmailService, EmailDeliveryService],
})
export class NotificationsModule {}
