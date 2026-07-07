import { Module } from '@nestjs/common';
import { FitoutController } from './fitout.controller';
import { FitoutSubmittalController } from './fitout-submittal.controller';
import { FitoutIssueController } from './fitout-issue.controller';
import { FitoutDailyReportController } from './fitout-daily-report.controller';
import { FitoutGanttController } from './fitout-gantt.controller';
import { FitoutService } from './fitout.service';
import { FitoutDocumentsService } from './fitout-documents.service';
import { FitoutSlaService } from './fitout-sla.service';
import { FitoutContractorService } from './fitout-contractor.service';
import { FitoutStageConfigService } from './fitout-stage-config.service';
import { FitoutFormTypeService } from './fitout-form-type.service';
import { FitoutSubmittalService } from './fitout-submittal.service';
import { FitoutIssueService } from './fitout-issue.service';
import { FitoutDailyReportService } from './fitout-daily-report.service';
import { FitoutGanttService } from './fitout-gantt.service';
import { FitoutDashboardService } from './fitout-dashboard.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [NotificationsModule, StorageModule],
  controllers: [
    FitoutController,
    FitoutSubmittalController,
    FitoutIssueController,
    FitoutDailyReportController,
    FitoutGanttController,
  ],
  providers: [
    FitoutService,
    FitoutDocumentsService,
    FitoutSlaService,
    FitoutContractorService,
    FitoutStageConfigService,
    FitoutFormTypeService,
    FitoutSubmittalService,
    FitoutIssueService,
    FitoutDailyReportService,
    FitoutGanttService,
    FitoutDashboardService,
  ],
  exports: [
    FitoutService,
    FitoutDocumentsService,
    FitoutSlaService,
    FitoutContractorService,
    FitoutStageConfigService,
    FitoutFormTypeService,
    FitoutSubmittalService,
    FitoutIssueService,
    FitoutDailyReportService,
    FitoutGanttService,
    FitoutDashboardService,
  ],
})
export class FitoutModule {}
