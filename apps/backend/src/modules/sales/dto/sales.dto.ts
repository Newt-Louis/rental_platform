import { Type } from 'class-transformer';
import {
  IsDateString,
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

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  transactions?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class DisputeSalesDto {
  @IsString() @MinLength(3) @MaxLength(1000)
  reason!: string;
}
