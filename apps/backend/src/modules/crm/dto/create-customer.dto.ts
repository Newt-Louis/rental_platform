import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsNumber, IsEnum, IsUrl } from 'class-validator';
import { LeadSource, CurrencyCode } from '@prisma/client';

export class CreateCustomerDto {
  @ApiPropertyOptional({ description: 'Lead to link to this new customer profile' })
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiProperty()
  @IsString()
  companyName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiProperty()
  @IsString()
  contactName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactTitle?: string;

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
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  /**
   * CR-CRM-CATEGORY-MASTER-001 — DEPRECATED as an input. Identity is
   * `preferredCategoryId`; this free text is a display snapshot derived from
   * the Category master server-side.
   */
  @ApiPropertyOptional({ deprecated: true, description: 'Deprecated — send preferredCategoryId instead. Legacy display text only.' })
  @IsOptional()
  @IsString()
  preferredCategory?: string;

  /**
   * Authoritative preferred-category identity. PATCH semantics:
   *   omitted -> unchanged, null -> explicit clear, Category.id -> change.
   */
  @ApiPropertyOptional({ nullable: true, description: 'Category.id, or null to clear. Omit to leave unchanged.' })
  @IsOptional()
  @IsString()
  preferredCategoryId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedArea?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  budgetMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  budgetMax?: number;

  // CUR-002-CUSTOMER: the budget range has no meaning without this. No default,
  // no FX conversion.
  @ApiPropertyOptional({
    enum: CurrencyCode,
    description: 'Currency of budgetMin/budgetMax. REQUIRED whenever either is supplied.',
  })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currencyCode?: CurrencyCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateCustomerActivityDto {
  @ApiProperty({ enum: ['CALL', 'EMAIL', 'MEETING', 'SITE_VISIT', 'PROPOSAL_SENT', 'NOTE', 'OTHER'] })
  @IsString()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty()
  @IsString()
  note: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outcome?: string;
}
