import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OccupancyAnalyticsService } from './occupancy-analytics.service';
import { RenewalRiskService } from './renewal-risk.service';
import { ComplianceService } from './compliance.service';
import { ComplianceSchedulerService } from './compliance-scheduler.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [
    OccupancyAnalyticsService,
    RenewalRiskService,
    ComplianceService,
    ComplianceSchedulerService,
  ],
  exports: [
    OccupancyAnalyticsService,
    RenewalRiskService,
    ComplianceService,
    ComplianceSchedulerService,
  ],
})
export class AnalyticsModule {}
