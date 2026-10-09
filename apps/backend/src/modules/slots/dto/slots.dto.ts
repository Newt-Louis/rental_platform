import { CurrencyCode, BusinessModelEnum, SlotCategory, SlotPricingTimeBasis } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean, IsDateString, IsArray, ArrayMinSize, ValidateNested, Min, Max } from 'class-validator';
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
  @ApiPropertyOptional({ description: 'Giá ngày thường (m²/ngày)' }) @IsNumber() @IsOptional() @Min(0) priceWeekdayPerDaySqm?: number;
  @ApiPropertyOptional({ description: 'Giá cuối tuần/lễ (m²/ngày)' }) @IsNumber() @IsOptional() @Min(0) priceWeekendHolidayPerDaySqm?: number;
  @ApiPropertyOptional({ enum: SlotCategory }) @IsEnum(SlotCategory) @IsOptional() category?: SlotCategory;
  @ApiPropertyOptional({ description: 'Đa giác trên bản vẽ: [{x,y}] theo % 0-100' }) @IsArray() @IsOptional() polygon?: Array<{ x: number; y: number }>;
  @ApiPropertyOptional({ enum: CurrencyCode, description: "Currency of the slot price fields. REQUIRED whenever any price is supplied; no default, no FX." }) @IsEnum(CurrencyCode) @IsOptional() currencyCode?: CurrencyCode;
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
  @ApiPropertyOptional({ description: 'Giá ngày thường (m²/ngày)' }) @IsNumber() @IsOptional() @Min(0) priceWeekdayPerDaySqm?: number;
  @ApiPropertyOptional({ description: 'Giá cuối tuần/lễ (m²/ngày)' }) @IsNumber() @IsOptional() @Min(0) priceWeekendHolidayPerDaySqm?: number;
  @ApiPropertyOptional({ enum: SlotCategory }) @IsEnum(SlotCategory) @IsOptional() category?: SlotCategory;
  @ApiPropertyOptional({ description: 'Đa giác trên bản vẽ: [{x,y}] theo % 0-100' }) @IsArray() @IsOptional() polygon?: Array<{ x: number; y: number }>;
  @ApiPropertyOptional({ enum: CurrencyCode, description: "Currency of the slot price fields. REQUIRED whenever any price is supplied; no default, no FX." }) @IsEnum(CurrencyCode) @IsOptional() currencyCode?: CurrencyCode;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

export class SlotBookingLineDto {
  @ApiProperty() @IsString() slotId: string;
  @ApiPropertyOptional({ description: 'Diện tích thuê (m²), nhập tự do trong phạm vi diện tích slot. Bỏ trống = thuê toàn bộ slot.' })
  @IsNumber() @IsOptional() @Min(0.01) areaRented?: number;
}

export class CreateSlotBookingDto {
  @ApiPropertyOptional() @IsString() @IsOptional() leadId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() customerId?: string;

  @ApiProperty({ enum: SlotBookingType }) @IsEnum(SlotBookingType) type: SlotBookingType;
  @ApiProperty({ description: 'Thời điểm bắt đầu lắp đặt' }) @IsDateString() installationStartDatetime: string;
  @ApiProperty({ description: 'Thời điểm kết thúc lắp đặt' }) @IsDateString() installationEndDatetime: string;
  @ApiProperty() @IsDateString() startDatetime: string;
  @ApiProperty() @IsDateString() endDatetime: string;
  @ApiProperty({ description: 'Thời điểm bắt đầu tháo dỡ' }) @IsDateString() dismantlingStartDatetime: string;
  @ApiProperty({ description: 'Thời điểm kết thúc tháo dỡ' }) @IsDateString() dismantlingEndDatetime: string;

  @ApiPropertyOptional({ type: [SlotBookingLineDto], description: 'Nhiều slot trong một booking. Bỏ trống = thuê toàn bộ slot trên đường dẫn.' })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SlotBookingLineDto) @IsOptional()
  lines?: SlotBookingLineDto[];

  @ApiPropertyOptional({ enum: SlotPricingTimeBasis, description: 'Cách xác định thời gian tính tiền (mặc định chỉ thời gian chương trình)' })
  @IsEnum(SlotPricingTimeBasis) @IsOptional() pricingTimeBasis?: SlotPricingTimeBasis;
  @ApiPropertyOptional({ description: 'Bắt đầu khoảng tính tiền (khi CUSTOM_RANGE)' }) @IsDateString() @IsOptional() pricingStart?: string;
  @ApiPropertyOptional({ description: 'Kết thúc khoảng tính tiền (khi CUSTOM_RANGE)' }) @IsDateString() @IsOptional() pricingEnd?: string;

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
  @ApiProperty({ description: 'Number of rows in the grid (max 10)', example: 2 })
  @IsNumber()
  @Min(1)
  @Max(10)
  rows: number;

  @ApiProperty({ description: 'Number of columns in the grid (max 10)', example: 3 })
  @IsNumber()
  @Min(1)
  @Max(10)
  cols: number;

  @ApiPropertyOptional({ enum: SlotType })
  @IsEnum(SlotType)
  @IsOptional()
  slotType?: SlotType;
}

/**
 * MON-CUR-SLOT-06 — CONFIRMED is the revenue-recognised / invoice-eligible
 * boundary, so a positive-value booking needs a currency to cross it. A legacy
 * booking recorded before `SlotBooking.currencyCode` existed may supply one here
 * instead of being permanently stuck in PENDING.
 */
export class ConfirmSlotBookingDto {
  @ApiPropertyOptional({
    enum: CurrencyCode,
    description:
      'Currency to attach while confirming. Required only when the booking has a ' +
      'positive amount and no currency yet. No default, no FX.',
  })
  @IsEnum(CurrencyCode)
  @IsOptional()
  currencyCode?: CurrencyCode;
}

/**
 * Booking ngắn hạn (SlotBooking) → Proposal. Chỉ dùng cho các trường không thể
 * suy ra từ chính booking (thời gian, diện tích, giá, tiền tệ đều lấy từ
 * SlotBooking) — xem SlotsService.convertToProposal().
 */
export class ConvertSlotBookingToProposalDto {
  @ApiPropertyOptional({ enum: BusinessModelEnum })
  @IsEnum(BusinessModelEnum)
  @IsOptional()
  businessModel?: BusinessModelEnum;

  @ApiPropertyOptional({ description: 'Ghi đè ghi chú của booking khi tạo Proposal' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class RejectSlotBookingDto {
  @ApiPropertyOptional() @IsString() @IsOptional() reason?: string;
}

export class ConfirmSlotLockDto {
  @ApiPropertyOptional() @IsString() @IsOptional() reason?: string;
}

export class CreateMallHolidayDto {
  @ApiProperty({ example: '2026-09-02' }) @IsDateString() date: string;
  @ApiProperty() @IsString() name: string;
}
