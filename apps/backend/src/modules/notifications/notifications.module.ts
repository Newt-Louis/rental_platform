import { forwardRef, Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { ContractExpiryScheduler } from './contract-expiry.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmailDeliveryService } from './email-delivery.service';
import { EmailAttachmentRegistry } from './email-attachments';
import { CommonModule } from '../../common/common.module';
import { NotificationRoutingController } from './routing/notification-routing.controller';
import { NotificationRoutingConfigService } from './routing/notification-routing-config.service';
import { NotificationRoutingService } from './routing/notification-routing.service';
import { NotificationRecipientEligibilityService } from './routing/notification-recipient-eligibility.service';

@Module({
  imports: [PrismaModule, CommonModule, forwardRef(() => TenantsModule)],
  controllers: [NotificationsController, NotificationRoutingController],
  providers: [
    NotificationsService, EmailService, EmailDeliveryService, EmailAttachmentRegistry, ContractExpiryScheduler,
    NotificationRecipientEligibilityService, NotificationRoutingService, NotificationRoutingConfigService,
  ],
  exports: [
    NotificationsService, EmailService, EmailDeliveryService, EmailAttachmentRegistry,
    NotificationRoutingService, NotificationRecipientEligibilityService,
  ],
})
export class NotificationsModule {}
