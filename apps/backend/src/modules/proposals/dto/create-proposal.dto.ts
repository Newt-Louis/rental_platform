import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsDateString, IsInt, Min, Max, MinLength } from 'class-validator';

export class CreateProposalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty()
  @IsString()
  unitId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  area: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  term: number;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  rentPerSqm: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  camPerSqm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  rentFree?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  escalationPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  revenueSharePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  marketingFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  serviceFeeSqm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  businessSupportFeeSqm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rentCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  fitoutDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  handoverDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  openingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialConditions?: string;

  // GAP #91–94 — 4 field còn thiếu trong 21 mục Tờ Trình XN
  @ApiPropertyOptional({ description: 'Phí tiện ích VND/tháng (mục 12)' })
  @IsOptional()
  @IsNumber()
  utilityFee?: number;

  @ApiPropertyOptional({ description: 'Giờ hoạt động (mục 13), vd: "10:00–22:00"' })
  @IsOptional()
  @IsString()
  operatingHours?: string;

  @ApiPropertyOptional({ description: 'Phí ngoài giờ VND/giờ (mục 14)' })
  @IsOptional()
  @IsNumber()
  afterHoursFee?: number;

  @ApiPropertyOptional({ description: 'Số ngày thanh toán (mục 16), mặc định 30' })
  @IsOptional()
  @IsInt()
  paymentTermDays?: number;

  // GAP #41 — Tách 3 khoản cọc
  @ApiPropertyOptional({ description: 'Tiền cọc thuê (VND) — null = tính từ deposit × monthlyRent' })
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
}

export class UpdateProposalDto extends PartialType(CreateProposalDto) {}

export class RejectProposalDto {
  @IsString()
  @MinLength(5)
  rejectionReason: string;
}
