import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class FitoutApprovalLevelDto {
  @ApiPropertyOptional({ description: 'Tên hiển thị của cấp duyệt; bỏ trống sẽ tự sinh "<Tên hồ sơ> — Cấp N"' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  stepName?: string;

  @ApiProperty({ description: 'Tài khoản duy nhất đứng tên duyệt ở cấp này' })
  @IsString()
  @MinLength(1)
  approverId: string;
}

export class ReplaceFitoutApprovalLevelsDto {
  @ApiProperty({ description: 'Mall áp dụng — cấp duyệt fitout khai báo riêng cho từng mall' })
  @IsString()
  @MinLength(1)
  mallId: string;

  @ApiProperty({ type: [FitoutApprovalLevelDto], description: 'Danh sách cấp duyệt theo thứ tự; mảng rỗng = xoá cấu hình của mall này' })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FitoutApprovalLevelDto)
  levels: FitoutApprovalLevelDto[];
}
