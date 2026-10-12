import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HandoverRiskSeverity } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = 'Ngày phải có dạng YYYY-MM-DD';

export class StartHandoverTrackingDto {
  @ApiProperty({ example: '2026-12-01', description: 'Ngày Ban dự án dự kiến bàn giao mặt bằng (business date)' })
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  targetReadyDate!: string;

  @ApiPropertyOptional({ description: 'Đầu mối Ban dự án (User) — phải có quyền truy cập Mall' })
  @IsOptional()
  @IsString()
  projectOwnerId?: string;

  @ApiPropertyOptional({ description: 'Tên đầu mối Ban dự án khi họ không có tài khoản' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  projectOwnerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ChangeHandoverTargetDateDto {
  @ApiProperty({ example: '2026-12-15' })
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  targetReadyDate!: string;

  @ApiProperty({ description: 'Lý do thay đổi (bắt buộc)' })
  @IsString()
  @MinLength(5, { message: 'Lý do thay đổi phải có ít nhất 5 ký tự' })
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({ description: 'Version client đang thấy; lệch sẽ trả 409' })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class AddHandoverRiskDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({ enum: HandoverRiskSeverity })
  @IsEnum(HandoverRiskSeverity)
  severity!: HandoverRiskSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  dueDate?: string;
}

export class ResolveHandoverRiskDto {
  @ApiProperty()
  @IsString()
  @MinLength(5, { message: 'Ghi chú xử lý phải có ít nhất 5 ký tự' })
  @MaxLength(4000)
  resolutionNote!: string;
}

export class AddHandoverFollowerDto {
  @ApiPropertyOptional({ description: 'Bỏ trống = tự theo dõi' })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class ConfirmHandoverReadyDto {
  @ApiProperty({ description: 'Ghi chú xác nhận (bắt buộc)' })
  @IsString()
  @MinLength(5, { message: 'Ghi chú xác nhận phải có ít nhất 5 ký tự' })
  @MaxLength(4000)
  note!: string;
}

export class HandoverReasonDto {
  @ApiProperty()
  @IsString()
  @MinLength(5, { message: 'Lý do phải có ít nhất 5 ký tự' })
  @MaxLength(2000)
  reason!: string;
}
