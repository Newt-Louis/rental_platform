import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsNumber, IsEnum, IsDateString, IsInt, IsNotEmpty, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { LeadSource, LeadStatus, LeadPriority, UnitLeaseTermType, CurrencyCode } from '@prisma/client';

export class CreateLeadDto {
  @ApiProperty()
  @IsString()
  brandName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiProperty()
  @IsString()
  contactName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadPriority, description: 'Lead priority: HOT, WARM, COLD' })
  @IsOptional()
  @IsEnum(LeadPriority)
  priority?: LeadPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mallId?: string;

  @ApiPropertyOptional({ enum: UnitLeaseTermType, default: UnitLeaseTermType.LONG })
  @IsOptional()
  @IsEnum(UnitLeaseTermType)
  leaseTermType?: UnitLeaseTermType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedRent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedArea?: number;

  // RPT-CUR-005: was documented as "in VND". Nothing enforced that, and the
  // pipeline aggregates it as if it were. The amount now carries its currency.
  @ApiPropertyOptional({ description: 'Estimated deal value, denominated in currencyCode' })
  @IsOptional()
  @IsNumber()
  estimatedValue?: number;

  @ApiPropertyOptional({
    enum: CurrencyCode,
    description:
      'Currency of expectedRent and estimatedValue. REQUIRED whenever either is supplied — ' +
      'there is no default and no FX conversion.',
  })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currencyCode?: CurrencyCode;

  @ApiPropertyOptional({ description: 'Expected close date (ISO string)' })
  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredCategory?: string;

  @ApiPropertyOptional({ description: 'Position in kanban column for ordering' })
  @IsOptional()
  @IsInt()
  position?: number;

  @ApiPropertyOptional({ description: 'Reason for losing the lead' })
  @IsOptional()
  @IsString()
  lostReason?: string;
}

export class UpdateLeadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Tên thương hiệu không được để trống' })
  @MinLength(2, { message: 'Tên thương hiệu tối thiểu 2 ký tự' })
  brandName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Người liên hệ không được để trống' })
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^(0|\+84)[0-9]{8,10}$/, { message: 'Số điện thoại không hợp lệ (VD: 0912345678 hoặc +84912345678)' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadPriority })
  @IsOptional()
  @IsEnum(LeadPriority)
  priority?: LeadPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({ enum: UnitLeaseTermType })
  @IsOptional()
  @IsEnum(UnitLeaseTermType)
  leaseTermType?: UnitLeaseTermType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedRent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedArea?: number;

  // RPT-CUR-005: settable on update so a legacy row whose currency was never
  // captured can be corrected without re-entering the amounts. `estimatedValue`
  // is deliberately still not updatable here — that is pre-existing behaviour
  // this wave does not change.
  @ApiPropertyOptional({
    enum: CurrencyCode,
    description: 'Currency of expectedRent and estimatedValue. No default, no FX conversion.',
  })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currencyCode?: CurrencyCode;
}
