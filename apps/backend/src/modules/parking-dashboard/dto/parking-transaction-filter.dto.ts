import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const TRANSACTION_SORT_FIELDS = ['check_in_time', 'check_out_time', 'total_fee', 'duration'] as const;
export type ParkingTransactionSortField = (typeof TRANSACTION_SORT_FIELDS)[number];

const PROMOTION_TYPES = ['NONE', 'BILL', 'VOUCHER'] as const;
export type ParkingPromotionType = (typeof PROMOTION_TYPES)[number];

export class ParkingTransactionFilterV2Dto {
  @IsString() @MinLength(1) @MaxLength(50)
  parkingCode!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional() @Type(() => Number) @IsInt()
  laneId?: number;

  @IsOptional() @IsString() @MaxLength(50)
  search?: string;

  @IsOptional() @IsIn(PROMOTION_TYPES)
  promotionType?: ParkingPromotionType;

  @IsOptional() @IsArray() @IsString({ each: true })
  paymentStatus?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  invoiceStatus?: string[];

  @IsOptional() @IsIn(TRANSACTION_SORT_FIELDS)
  sortBy?: ParkingTransactionSortField = 'check_in_time';

  @IsOptional() @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'desc';

  @IsOptional() @IsString()
  cursor?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 25;
}

export class ParkingTransactionFilterDto {
  @IsString() @MinLength(1) @MaxLength(50)
  parkingCode!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  pageIndex?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  pageSize?: number = 10;

  @IsOptional() @IsString() @MaxLength(50)
  cardCode?: string;

  @IsOptional() @IsString() @MaxLength(50)
  licensePlate?: string;
}

export class ParkingTransactionExportFilterDto {
  @IsString() @MinLength(1) @MaxLength(50)
  parkingCode!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

export class ParkingMonthlySummaryFilterDto {
  @IsString() @MinLength(1) @MaxLength(50)
  parkingCode!: string;
}

export class ParkingMonthlyChartFilterDto {
  @IsString() @MinLength(1) @MaxLength(50)
  parkingCode!: string;

  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year!: number;
}

export class ParkingYearlyChartFilterDto {
  @IsString() @MinLength(1) @MaxLength(50)
  parkingCode!: string;

  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  fromYear!: number;

  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  toYear!: number;
}
