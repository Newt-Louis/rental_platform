import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEmailSettingsDto {
  @ApiPropertyOptional({ description: 'Bật/tắt gửi email qua SMTP đã cấu hình' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpHost?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpUser?: string;

  @ApiPropertyOptional({
    description: 'Mật khẩu SMTP mới -- bỏ trống field này (không gửi lên) để giữ nguyên mật khẩu cũ, gửi chuỗi rỗng để xoá',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  smtpPass?: string;

  @ApiPropertyOptional({ description: 'Địa chỉ/tên hiển thị khi gửi email, vd "THISO Leasing <noreply@thiso.com.vn>"' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  emailFrom?: string;
}

export class SendTestEmailDto {
  @ApiPropertyOptional({ description: 'Email nhận thử -- mặc định gửi cho chính admin đang đăng nhập nếu bỏ trống' })
  @IsOptional()
  @IsEmail()
  to?: string;
}
