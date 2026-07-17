import { Role } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum ApprovalPolicyConditionType {
  DISCOUNT_PCT = 'DISCOUNT_PCT',
  RENT_FREE_DAYS = 'RENT_FREE_DAYS',
  INDUSTRY_TAG = 'INDUSTRY_TAG',
  HAS_AR_DEBT = 'HAS_AR_DEBT',
  PRICE_BELOW_MIN = 'PRICE_BELOW_MIN',
  PRICE_DEVIATION_PCT = 'PRICE_DEVIATION_PCT',
}

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

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  approverRole: Role;

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
