import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SlotType { SHORT_TERM = 'SHORT_TERM', LONG_TERM = 'LONG_TERM', FLEXIBLE = 'FLEXIBLE' }
export enum SlotBookingType { DAILY = 'DAILY', HOURLY = 'HOURLY', MONTHLY = 'MONTHLY' }

export class CreateUnitSlotDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() area: number;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;

  @ApiPropertyOptional() @IsNumber() @IsOptional() posX?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() posY?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() posW?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() posH?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() fillColor?: string;

  @ApiPropertyOptional({ enum: SlotType }) @IsEnum(SlotType) @IsOptional() slotType?: SlotType;
  @ApiPropertyOptional() @IsNumber() @IsOptional() pricePerDaySqm?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() pricePerHour?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() pricePerSqmMonth?: number;
}

export class UpdateUnitSlotDto {
  @ApiPropertyOptional() @IsString() @IsOptional() name?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() area?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() posX?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() posY?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() posW?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() posH?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() fillColor?: string;
  @ApiPropertyOptional({ enum: SlotType }) @IsEnum(SlotType) @IsOptional() slotType?: SlotType;
  @ApiPropertyOptional() @IsNumber() @IsOptional() pricePerDaySqm?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() pricePerHour?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() pricePerSqmMonth?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

export class CreateSlotBookingDto {
  @ApiPropertyOptional() @IsString() @IsOptional() leadId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() customerId?: string;

  @ApiProperty({ enum: SlotBookingType }) @IsEnum(SlotBookingType) type: SlotBookingType;
  @ApiProperty() @IsDateString() startDatetime: string;
  @ApiProperty() @IsDateString() endDatetime: string;

  @ApiPropertyOptional() @IsNumber() @IsOptional() @Min(0) @Max(100) discountPct?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class CreateSlotPricingRuleDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() ruleType: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() multiplier?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() discountPct?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() minDays?: number;
  @ApiPropertyOptional() @IsDateString() @IsOptional() startDate?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() endDate?: string;
}

export class CreateSlotGridDto {
  @ApiProperty({ description: 'Number of rows in the grid', example: 2 })
  @IsNumber()
  @Min(1)
  @Max(6)
  rows: number;

  @ApiProperty({ description: 'Number of columns in the grid', example: 3 })
  @IsNumber()
  @Min(1)
  @Max(6)
  cols: number;

  @ApiPropertyOptional({ enum: SlotType })
  @IsEnum(SlotType)
  @IsOptional()
  slotType?: SlotType;
}
