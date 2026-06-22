import { Role } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  @ApiProperty({
    description: 'DISCOUNT_PCT | RENT_FREE_DAYS | INDUSTRY_TAG | HAS_AR_DEBT',
  })
  @IsString()
  conditionType: string;

  @ApiPropertyOptional({ description: '> | >= | < | <= | = for numeric conditions' })
  @IsOptional()
  @IsString()
  operator?: string;

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

