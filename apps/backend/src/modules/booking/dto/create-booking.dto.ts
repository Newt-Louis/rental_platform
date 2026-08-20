import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsInt, Min, MinLength, IsDateString, IsEnum, ValidateIf } from 'class-validator';
import { BusinessModelEnum, CurrencyCode } from '@prisma/client';

export class CreateBookingDto {
  @ApiProperty({ description: 'ID của unit muốn đặt' })
  @IsString()
  unitId: string;

  @ValidateIf((o) => !o.customerId)
  @IsString({ message: 'Phải chọn Lead hoặc Customer' })
  @ApiPropertyOptional({ description: 'ID lead đang quan tâm (bắt buộc nếu không có customerId)' })
  leadId?: string;

  @ValidateIf((o) => !o.leadId)
  @IsString({ message: 'Phải chọn Lead hoặc Customer' })
  @ApiPropertyOptional({ description: 'ID customer (bắt buộc nếu không có leadId)' })
  customerId?: string;

  @ApiPropertyOptional({ description: 'Sale phụ trách booking này' })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Diện tích yêu cầu (m²)' })
  @IsOptional()
  @IsNumber()
  requestedArea?: number;

  @ApiPropertyOptional({ description: 'Thời hạn thuê mong muốn (tháng)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  requestedTerm?: number;

  @ApiPropertyOptional({ description: 'Mức giá kỳ vọng (VND/m²)' })
  @IsOptional()
  @IsNumber()
  expectedRent?: number;

  @ApiPropertyOptional({ enum: CurrencyCode, description: 'Đơn vị tiền tệ của expectedRent/proposedRentPerSqm (mặc định VND)' })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currencyCode?: CurrencyCode;

  @ApiPropertyOptional({ description: 'Giá sale đề xuất (VND/m²/tháng)' })
  @IsOptional()
  @IsNumber()
  proposedRentPerSqm?: number;

  @ApiPropertyOptional({ description: 'CAM sale đề xuất (VND/m²/tháng)' })
  @IsOptional()
  @IsNumber()
  proposedCamPerSqm?: number;

  @ApiPropertyOptional({ description: 'Số ngày giữ slot (mặc định 30 ngày)', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  holdDays?: number;

  @ApiPropertyOptional({ description: 'Ghi chú nội bộ' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBookingDto {
  @ApiPropertyOptional({ description: 'Chuyển sang lead khác' })
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiPropertyOptional({ description: 'Chuyển sang mặt bằng khác (chỉ cho PENDING booking)' })
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  requestedArea?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  requestedTerm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedRent?: number;

  @ApiPropertyOptional({ description: 'Giá sale đề xuất (VND/m²/tháng)' })
  @IsOptional()
  @IsNumber()
  proposedRentPerSqm?: number;

  @ApiPropertyOptional({ description: 'CAM sale đề xuất (VND/m²/tháng)' })
  @IsOptional()
  @IsNumber()
  proposedCamPerSqm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApprovePriceDto {
  @ApiPropertyOptional({ description: 'Ghi chú phê duyệt' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectPriceDto {
  @ApiProperty({ description: 'Lý do từ chối' })
  @IsString()
  reason: string;
}

export class ExtendBookingDto {
  @ApiProperty({ description: 'Số ngày gia hạn thêm', minimum: 1 })
  @IsInt()
  @Min(1)
  additionalDays: number;

  @ApiPropertyOptional({ description: 'Lý do gia hạn' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CancelBookingDto {
  @ApiProperty({ description: 'Lý do hủy booking', minLength: 5 })
  @IsString()
  @MinLength(5)
  reason: string;
}

export class ConvertToProposalDto {
  @ApiProperty({ description: 'Diện tích đề xuất thuê (m²)' })
  @IsNumber()
  area: number;

  @ApiProperty({ description: 'Thời hạn hợp đồng (tháng)' })
  @IsInt()
  @Min(1)
  term: number;

  @ApiProperty({ description: 'Ngày bắt đầu thuê dự kiến' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Giá thuê đề xuất (VND/m²/tháng)' })
  @IsNumber()
  rentPerSqm: number;

  @ApiPropertyOptional({ description: 'Phí quản lý (VND/m²/tháng)' })
  @IsOptional()
  @IsNumber()
  camPerSqm?: number;

  @ApiPropertyOptional({ description: 'Số tháng đặt cọc' })
  @IsOptional()
  @IsNumber()
  deposit?: number;

  @ApiPropertyOptional({ description: 'Số ngày miễn phí thuê' })
  @IsOptional()
  @IsInt()
  rentFree?: number;

  @ApiPropertyOptional({ description: 'Phần trăm tăng giá thuê hàng năm' })
  @IsOptional()
  @IsNumber()
  escalationPercent?: number;

  @ApiPropertyOptional({ enum: BusinessModelEnum, description: 'Mô hình kinh doanh' })
  @IsOptional()
  @IsEnum(BusinessModelEnum)
  businessModel?: BusinessModelEnum;

  @ApiPropertyOptional({ description: 'Phí Dịch vụ USD/m²/tháng' })
  @IsOptional()
  @IsNumber()
  serviceFeeSqm?: number;

  @ApiPropertyOptional({ description: 'Phí hỗ trợ Kinh doanh USD/m²/tháng' })
  @IsOptional()
  @IsNumber()
  businessSupportFeeSqm?: number;

  @ApiPropertyOptional({ enum: CurrencyCode, description: 'Đơn vị tiền tệ giá thuê. Mặc định kế thừa từ Booking.currencyCode, hoặc VND nếu Booking không có.' })
  @IsOptional()
  @IsEnum(CurrencyCode)
  rentCurrency?: CurrencyCode;

  @ApiPropertyOptional({ description: 'Số ngày hoàn thiện nội thất' })
  @IsOptional()
  @IsInt()
  fitoutDays?: number;

  @ApiPropertyOptional({ description: 'Ngày Bàn giao Mặt bằng dự kiến' })
  @IsOptional()
  @IsDateString()
  handoverDate?: string;

  @ApiPropertyOptional({ description: 'Ngày Khai trương dự kiến' })
  @IsOptional()
  @IsDateString()
  openingDate?: string;

  @ApiPropertyOptional({ description: 'Điều kiện đặc biệt' })
  @IsOptional()
  @IsString()
  specialConditions?: string;

  @ApiPropertyOptional({ description: 'Ghi chú' })
  @IsOptional()
  @IsString()
  notes?: string;

  // GAP #91–94
  @ApiPropertyOptional({ description: 'Phí tiện ích VND/tháng' })
  @IsOptional()
  @IsNumber()
  utilityFee?: number;

  @ApiPropertyOptional({ description: 'Giờ hoạt động, vd: "10:00–22:00"' })
  @IsOptional()
  @IsString()
  operatingHours?: string;

  @ApiPropertyOptional({ description: 'Phí ngoài giờ VND/giờ' })
  @IsOptional()
  @IsNumber()
  afterHoursFee?: number;

  @ApiPropertyOptional({ description: 'Điều khoản thanh toán (số ngày)' })
  @IsOptional()
  @IsInt()
  paymentTermDays?: number;

  // GAP #41
  @ApiPropertyOptional({ description: 'Tiền cọc thuê (VND) — null = tính tự động từ deposit × monthlyRent' })
  @IsOptional()
  @IsNumber()
  depositLease?: number;

  @ApiPropertyOptional({ description: 'Cọc thi công (VND)' })
  @IsOptional()
  @IsNumber()
  depositFitout?: number;

  @ApiPropertyOptional({ description: 'Phí thi công (VND)' })
  @IsOptional()
  @IsNumber()
  fitoutFee?: number;
}
