import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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

  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true })
  voucherTypeNames?: string[];

  @IsOptional() @IsIn(TRANSACTION_SORT_FIELDS)
  sortBy?: ParkingTransactionSortField = 'check_in_time';

  @IsOptional() @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'desc';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

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

export class ParkingTransactionImageQueryDto {
  @IsString() @MinLength(1) @MaxLength(50)
  parkingCode!: string;

  @Type(() => Number) @IsInt() @Min(1)
  sessionId!: number;

  @IsIn(['entry', 'exit'])
  direction!: 'entry' | 'exit';

  @IsOptional() @IsIn(['plate', 'overview'])
  view?: 'plate' | 'overview' = 'plate';
}

export class ParkingVoucherTypesQueryDto {
  @IsString() @MinLength(1) @MaxLength(50)
  parkingCode!: string;
}

export class ParkingTransactionExportFilterDto {
  @IsString() @MinLength(1) @MaxLength(50)
  parkingCode!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

// Dashboard charts accept several bãi at once: `parkingCodes=A,B` (or repeated params).
export class ParkingCodesQueryDto {
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : String(value ?? '').split(','))
      .map((c: string) => c.trim())
      .filter(Boolean),
  )
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @IsString({ each: true }) @MaxLength(50, { each: true })
  parkingCodes!: string[];
}

export class ParkingMonthlySummaryFilterDto extends ParkingCodesQueryDto {}

export class ParkingMonthlyChartFilterDto extends ParkingCodesQueryDto {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year!: number;
}

export class ParkingDailyChartFilterDto extends ParkingCodesQueryDto {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month!: number;
}

export class ParkingYearlyChartFilterDto extends ParkingCodesQueryDto {

  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  fromYear!: number;

  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  toYear!: number;
}
