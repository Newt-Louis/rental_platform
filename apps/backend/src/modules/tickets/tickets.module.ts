import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketSlaService } from './ticket-sla.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [NotificationsModule, StorageModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketSlaService],
  exports: [TicketsService, TicketSlaService],
})
export class TicketsModule {}
