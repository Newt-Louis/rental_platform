import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { ProposalPdfService } from './proposal-pdf.service';
import { DealScoringService } from './deal-scoring.service';
import { DealScoringController } from './deal-scoring.controller';
import { ProposalApprovalDocumentController } from './proposal-approval-document.controller';
import { ProposalScenarioService } from './proposal-scenario.service';
import { ProposalDocumentService } from './document/proposal-document.service';
import { ProposalDocumentDeliveryService } from './document/proposal-document-delivery.service';
import { CrmModule } from '../crm/crm.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [CrmModule, BillingModule, NotificationsModule, CategoriesModule],
  controllers: [ProposalsController, DealScoringController, ProposalApprovalDocumentController],
  providers: [ProposalsService, ProposalPdfService, DealScoringService, ProposalScenarioService, ProposalDocumentService, ProposalDocumentDeliveryService],
  exports: [ProposalsService, DealScoringService, ProposalScenarioService, ProposalDocumentService, ProposalPdfService],
})
export class ProposalsModule {}
