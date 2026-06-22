import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsInt, Min, IsDateString } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ description: 'ID của unit muốn đặt' })
  @IsString()
  unitId: string;

  @ApiPropertyOptional({ description: 'ID lead đang quan tâm' })
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiPropertyOptional({ description: 'ID customer (nếu đã là customer)' })
  @IsOptional()
  @IsString()
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
  @ApiPropertyOptional({ description: 'Lý do hủy booking' })
  @IsOptional()
  @IsString()
  reason?: string;
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

  @ApiPropertyOptional({ description: 'Mô hình kinh doanh (Gian hàng, Chuỗi, Kiosk...)' })
  @IsOptional()
  @IsString()
  businessModel?: string;

  @ApiPropertyOptional({ description: 'Phí Dịch vụ USD/m²/tháng' })
  @IsOptional()
  @IsNumber()
  serviceFeeSqm?: number;

  @ApiPropertyOptional({ description: 'Phí hỗ trợ Kinh doanh USD/m²/tháng' })
  @IsOptional()
  @IsNumber()
  businessSupportFeeSqm?: number;

  @ApiPropertyOptional({ description: 'Đơn vị tiền tệ giá thuê: VND hoặc USD' })
  @IsOptional()
  @IsString()
  rentCurrency?: string;

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
}
