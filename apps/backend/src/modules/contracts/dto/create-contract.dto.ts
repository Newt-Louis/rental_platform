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

  // GAP #41 — 3 khoản cọc
  @ApiPropertyOptional({ description: 'Tiền cọc thuê (VND)' })
  @IsOptional()
  @IsNumber()
  depositLease?: number;

  @ApiPropertyOptional({ description: 'Cọc thi công (VND)' })
  @IsOptional()
  @IsNumber()
  depositFitout?: number;

  @ApiPropertyOptional({ description: 'Phí thi công (VND)' })
  @IsOptional()
  @IsNumber()
  fitoutFee?: number;

  // GAP #91, #93 — Phí tiện ích & phí ngoài giờ
  @ApiPropertyOptional({ description: 'Phí tiện ích VND/tháng' })
  @IsOptional()
  @IsNumber()
  utilityFee?: number;

  @ApiPropertyOptional({ description: 'Phí ngoài giờ VND/giờ' })
  @IsOptional()
  @IsNumber()
  afterHoursFee?: number;

  @ApiPropertyOptional({ description: 'Giờ hoạt động, vd: "10:00–22:00"' })
  @IsOptional()
  @IsString()
  operatingHours?: string;
}
