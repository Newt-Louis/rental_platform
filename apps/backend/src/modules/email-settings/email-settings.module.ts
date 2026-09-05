import { Module } from '@nestjs/common';
import { EmailSettingsController } from './email-settings.controller';
import { EmailSettingsService } from './email-settings.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [EmailSettingsController],
  providers: [EmailSettingsService],
})
export class EmailSettingsModule {}
