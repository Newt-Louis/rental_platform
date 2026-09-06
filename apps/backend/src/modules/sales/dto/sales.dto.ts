import { Type } from 'class-transformer';
import { CurrencyCode } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSalesDto {
  @IsString() @MinLength(1)
  tenantId!: string;

  @IsString() @MinLength(1)
  unitId!: string;

  @IsDateString()
  date!: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @Type(() => Number) @IsNumber() @Min(0)
  grossSales!: number;

  @Type(() => Number) @IsNumber() @Min(0)
  netSales!: number;

  /**
   * CUR-001 — REQUIRED. grossSales/netSales are meaningless without a unit, and
   * revenue-share billing subtracts a Contract-currency rent from this figure.
   * Must equal the Contract currency; the service validates that.
   */
  @IsEnum(CurrencyCode, { message: 'currencyCode phải là một trong: VND, USD, MMK' })
  currencyCode!: CurrencyCode;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  transactions?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class DisputeSalesDto {
  @IsString() @MinLength(3) @MaxLength(1000)
  reason!: string;
}
