import { forwardRef, Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { ContractExpiryScheduler } from './contract-expiry.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmailDeliveryService } from './email-delivery.service';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule, forwardRef(() => TenantsModule)],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, EmailDeliveryService, ContractExpiryScheduler],
  exports: [NotificationsService, EmailService, EmailDeliveryService],
})
export class NotificationsModule {}
