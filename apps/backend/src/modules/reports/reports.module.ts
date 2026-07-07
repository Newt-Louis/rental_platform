import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { BillingModule } from '../billing/billing.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [BillingModule, AuditLogModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
