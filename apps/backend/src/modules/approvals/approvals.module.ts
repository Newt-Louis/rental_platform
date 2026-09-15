import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { PriceApprovalPolicyService } from './price-approval-policy.service';
import { ApproverReplacementService } from './approver-replacement.service';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [CategoriesModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, PriceApprovalPolicyService, ApproverReplacementService],
  exports: [ApprovalsService, PriceApprovalPolicyService],
})
export class ApprovalsModule {}
