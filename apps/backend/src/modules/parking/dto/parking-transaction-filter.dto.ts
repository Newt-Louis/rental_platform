import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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
