import { PartialType } from '@nestjs/swagger';
import { CreateApprovalPolicyRuleDto } from './create-approval-policy-rule.dto';

export class UpdateApprovalPolicyRuleDto extends PartialType(CreateApprovalPolicyRuleDto) {}

