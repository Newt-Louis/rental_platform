import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Condition types accepted when CREATING or UPDATING a rule.
 *
 * SEM-001: `RENT_FREE_DAYS` is deliberately absent. `Proposal.rentFree` is
 * denominated in months, so a day-denominated threshold could never match
 * correctly. Existing persisted rows with that conditionType are still
 * evaluated — see the deprecation shim in `approval-policy.util.ts` — but no
 * new one may be created.
 */
export enum ApprovalPolicyConditionType {
  DISCOUNT_PCT = 'DISCOUNT_PCT',
  RENT_FREE_MONTHS = 'RENT_FREE_MONTHS',
  INDUSTRY_TAG = 'INDUSTRY_TAG',
  HAS_AR_DEBT = 'HAS_AR_DEBT',
  PRICE_BELOW_MIN = 'PRICE_BELOW_MIN',
  PRICE_DEVIATION_PCT = 'PRICE_DEVIATION_PCT',
}

/** Recognised for evaluation of legacy persisted rows only. Not creatable. */
export const DEPRECATED_CONDITION_TYPES = ['RENT_FREE_DAYS'] as const;

export enum ApprovalPolicyOperator {
  GREATER_THAN = '>',
  GREATER_THAN_OR_EQUAL = '>=',
  LESS_THAN = '<',
  LESS_THAN_OR_EQUAL = '<=',
  EQUAL = '=',
  BETWEEN = 'BETWEEN',
}

export class CreateApprovalPolicyRuleDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty({ description: 'Mall áp dụng — quy tắc duyệt khai báo riêng cho từng mall' })
  @IsString()
  mallId: string;

  @ApiProperty({ description: 'Tài khoản đích danh đứng tên duyệt bước này' })
  @IsString()
  approverId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  stepName: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  stepOrder: number;


  @ApiProperty({ enum: ApprovalPolicyConditionType })
  @IsEnum(ApprovalPolicyConditionType)
  conditionType: ApprovalPolicyConditionType;

  @ApiPropertyOptional({ enum: ApprovalPolicyOperator })
  @IsOptional()
  @IsEnum(ApprovalPolicyOperator)
  operator?: ApprovalPolicyOperator;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  threshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  matchValue?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
