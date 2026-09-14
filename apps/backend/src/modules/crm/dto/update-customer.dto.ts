import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CustomerStatus, CurrencyCode, LeadSource } from '@prisma/client';

/**
 * CR-CRM-CUSTOMER-PROFILE-EDIT — the editable surface of a Customer.
 *
 * `PUT /crm/customers/:id` previously took `@Body() dto: any`, which meant the
 * global ValidationPipe had no metadata to whitelist against and the service
 * spread the body straight into `prisma.customer.update`. Anything the client
 * sent was written. Verified against the running system: a plain PUT with
 * `{"customerCode":"HACKED-001"}` renamed a customer's identifier.
 *
 * This DTO is the allow-list. Declaring a field here is what makes it writable;
 * everything else is stripped before it reaches Prisma. Deliberately absent:
 *
 *   customerCode  identity, generated once and referenced by humans
 *   createdById   who created the record is not editable after the fact
 *   isActive      soft-delete state; DELETE owns it
 *   deletedAt     ditto
 *   wonAt/lostAt  derived from the status transition, not supplied
 *
 * `status` stays writable because the existing advance/deactivate actions use
 * this endpoint, and the service still applies the Lead-sync side effects.
 */
export class UpdateCustomerDto {
  // ── Company ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxCode?: string;

  @ApiPropertyOptional({ description: 'Ngành nghề kinh doanh (free text, khác ngành hàng thuê)' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  // ── Contact ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;

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
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email?: string;

  // ── Leasing requirement ───────────────────────────────────────────────────
  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  /**
   * CR-CRM-CATEGORY-MASTER-001 — identity is the Category id. The free-text
   * column is a display snapshot the server derives; it stays accepted for
   * pre-backfill rows but can never override a mapped one.
   */
  @ApiPropertyOptional({ nullable: true, description: 'Category.id, hoặc null để xoá' })
  @IsOptional()
  @IsString()
  preferredCategoryId?: string | null;

  @ApiPropertyOptional({ deprecated: true, description: 'Deprecated — dùng preferredCategoryId' })
  @IsOptional()
  @IsString()
  preferredCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedArea?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetMax?: number;

  /**
   * CUR-002-CUSTOMER — required whenever a budget figure is present. The
   * service rejects money without a unit of account rather than defaulting to
   * VND, so this is not optional in practice, only in shape.
   */
  @ApiPropertyOptional({ enum: CurrencyCode })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currencyCode?: CurrencyCode;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  // ── Ownership / workflow ──────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: CustomerStatus })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lostReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;
}
