import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsDateString, IsInt, IsEnum, IsArray } from 'class-validator';
import { ContractType, BillingCycle, CurrencyCode, PeriodicChargeType } from '@prisma/client';

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

  @ApiPropertyOptional({
    enum: CurrencyCode,
    description:
      'Only used for a contract created without a proposalId. When proposalId is set, the currency is always taken from the Proposal — any value sent here is ignored (see MULTI_CURRENCY_ARCHITECTURE.md).',
  })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currencyCode?: CurrencyCode;

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

  @ApiPropertyOptional({
    enum: PeriodicChargeType,
    isArray: true,
    description: 'Loại phí Billing Add-in vận hành cần nhập mỗi kỳ cho hợp đồng này (Phụ thu PQL chỉ hợp lệ khi Mall.leaseCategory = OFFICE)',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(PeriodicChargeType, { each: true })
  periodicChargeTypes?: PeriodicChargeType[];
}
