import { Type } from "class-transformer";
import {
  ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsObject,
  IsOptional, IsString, Max, Min, MinLength, ValidateNested,
} from "class-validator";

export class ParkingRateDto {
  @IsIn(["CAR", "MOTORBIKE", "BICYCLE"])
  vehicleType!: string;

  @Type(() => Number) @IsInt() @Min(0)
  registeredQuantity!: number;

  @Type(() => Number) @IsNumber() @Min(0)
  unitPrice!: number;

  @Type(() => Number) @IsNumber() @Min(0)
  excessUnitPrice!: number;
}

export class CreateParkingContractDto {
  @IsString() @MinLength(1) mallId!: string;
  @IsString() @MinLength(1) tenantId!: string;
  @IsString() @MinLength(1) contractNumber!: string;
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsIn(["FIXED_QUOTA", "PRINCIPLE_ACTUAL"]) contractType?: string;
  @IsOptional() @IsDateString() signedDate?: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(28) billingDay?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) paymentTermDays?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) depositAmount?: number;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ParkingRateDto)
  rates!: ParkingRateDto[];
}

export class UpdateParkingContractDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsIn(["FIXED_QUOTA", "PRINCIPLE_ACTUAL"]) contractType?: string;
  @IsOptional() @IsDateString() signedDate?: string | null;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(28) billingDay?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) paymentTermDays?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) depositAmount?: number;
  @IsOptional() @IsString() notes?: string;
}

export class ParkingAdjustmentDto {
  @IsIn(["CAR", "MOTORBIKE", "BICYCLE"]) vehicleType!: string;
  @Type(() => Number) @IsInt() @Min(0) newQuantity!: number;
  @IsOptional() @IsDateString() effectiveDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) excessUnitPrice?: number;
  @IsString() @MinLength(1) reason!: string;
}

export class GenerateParkingStatementDto {
  @IsString() period!: string;
  @IsOptional() @IsObject() actualQuantities?: Record<string, number>;
  @IsOptional() @Type(() => Number) @IsNumber() adjustment?: number;
  @IsOptional() @IsString() notes?: string;
}

export class ParkingPaymentDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() referenceNo?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ParkingStatusDto {
  @IsIn(["DRAFT", "ACTIVE", "SUSPENDED", "EXPIRED", "TERMINATED", "RENEWED"])
  status!: string;
}

export class ParkingReconcileDto {
  @IsIn(["PENDING", "MATCHED", "DISPUTED"])
  status!: string;
}
