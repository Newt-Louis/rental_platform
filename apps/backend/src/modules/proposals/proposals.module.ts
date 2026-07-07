import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { ProposalPdfService } from './proposal-pdf.service';
import { DealScoringService } from './deal-scoring.service';
import { DealScoringController } from './deal-scoring.controller';
import { ProposalScenarioService } from './proposal-scenario.service';
import { CrmModule } from '../crm/crm.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [CrmModule, BillingModule, NotificationsModule, CategoriesModule],
  controllers: [ProposalsController, DealScoringController],
  providers: [ProposalsService, ProposalPdfService, DealScoringService, ProposalScenarioService],
  exports: [ProposalsService, DealScoringService, ProposalScenarioService],
})
export class ProposalsModule {}
