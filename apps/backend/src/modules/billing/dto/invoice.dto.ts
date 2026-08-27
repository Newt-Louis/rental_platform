import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateInvoiceLineDto {
  @IsString() @MinLength(1) @MaxLength(50)
  type!: string;

  @IsString() @MinLength(1) @MaxLength(500)
  description!: string;

  @Type(() => Number) @IsNumber() @Min(0)
  qty!: number;

  @Type(() => Number) @IsNumber() @Min(0)
  unitPrice!: number;

  @Type(() => Number) @IsNumber() @Min(0)
  amount!: number;
}

export class CreateInvoiceDto {
  @IsString() @MinLength(1)
  contractId!: string;

  @IsString() @MinLength(1)
  tenantId!: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @IsOptional() @IsString() @MaxLength(50)
  type?: string;

  @Type(() => Number) @IsNumber() @Min(0)
  subtotal!: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  vatRate?: number;

  @IsDateString()
  dueDate!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateInvoiceLineDto)
  lines?: CreateInvoiceLineDto[];
}

export class AddInvoiceLineDto {
  @IsString() @MinLength(1) @MaxLength(50)
  type!: string;

  @IsString() @MinLength(1) @MaxLength(500)
  description!: string;

  @Type(() => Number) @IsNumber() @Min(0)
  qty!: number;

  @Type(() => Number) @IsNumber() @Min(0)
  unitPrice!: number;

  @IsOptional() @IsString() @MaxLength(50)
  unit?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class UpdateInvoiceLineDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500)
  description?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  qty?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  unitPrice?: number;
}
