import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PeriodicChargeStatus, PeriodicChargeType } from '@prisma/client';

export class ListPeriodicChargesDto {
  @IsOptional() @IsString()
  mallId?: string;

  @IsOptional() @IsIn(Object.values(PeriodicChargeType))
  chargeType?: PeriodicChargeType;

  @IsOptional() @IsIn(Object.values(PeriodicChargeStatus))
  status?: PeriodicChargeStatus;

  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;

  @IsOptional() @IsString() @MaxLength(200)
  search?: string;
}

export class SaveDraftDto {
  // Shape depends on the entry's chargeType — validated against the required keys for that
  // type in BillingAddInService (headcount / elecStart,elecEnd,waterStart,waterEnd / hours).
  @Type(() => Object) @IsObject()
  inputData!: Record<string, number>;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class ListRateConfigsDto {
  @IsOptional() @IsString()
  mallId?: string;

  @IsOptional() @IsIn(Object.values(PeriodicChargeType))
  chargeType?: PeriodicChargeType;
}

export class CreateRateConfigDto {
  @IsString()
  mallId!: string;

  @IsIn(Object.values(PeriodicChargeType))
  chargeType!: PeriodicChargeType;

  // Shape depends on chargeType — validated against the required keys for that type in
  // BillingAddInService (normAreaPerPerson,surchargePerPerson / electricityUnitPrice,waterUnitPrice / hourlyRate).
  @Type(() => Object) @IsObject()
  ratesJson!: Record<string, number>;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional() @IsDateString()
  effectiveTo?: string;
}
