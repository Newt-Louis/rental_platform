import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsDateString, IsInt, IsEnum } from 'class-validator';
import { ContractType, BillingCycle } from '@prisma/client';

export class CreateContractDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proposalId?: string;

  @ApiProperty()
  @IsString()
  tenantId: string;

  @ApiProperty()
  @IsString()
  unitId: string;

  @ApiPropertyOptional({ enum: ContractType })
  @IsOptional()
  @IsEnum(ContractType)
  type?: ContractType;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiProperty()
  @IsInt()
  term: number;

  @ApiProperty()
  @IsNumber()
  rent: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cam?: number;

  @ApiProperty()
  @IsNumber()
  deposit: number;

  @ApiPropertyOptional({ enum: BillingCycle })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  paymentTerm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  rentFree?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  escalationPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managedById?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
