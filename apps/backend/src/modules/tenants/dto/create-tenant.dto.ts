import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsBoolean, MaxLength, IsNotEmpty, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

// Convert empty / whitespace-only strings to undefined so @IsOptional skips subsequent validators
const toOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class CreateTenantDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200, { message: 'Tên công ty tối đa 200 ký tự' })
  companyName: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Tên thương hiệu không được để trống' })
  @MaxLength(100, { message: 'Tên thương hiệu tối đa 100 ký tự' })
  brandName: string;

  @ApiPropertyOptional({ maxLength: 14, description: '10 chữ số hoặc 10-3 (VD: 0123456789 hoặc 0123456789-001)' })
  @Transform(toOptional)
  @IsOptional()
  @Matches(/^\d{10}(-\d{3})?$/, { message: 'Mã số thuế không hợp lệ (VD: 0123456789 hoặc 0123456789-001)' })
  taxCode?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(toOptional)
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Người liên hệ tối đa 100 ký tự' })
  contactName?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(toOptional)
  @IsOptional()
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(255, { message: 'Email tối đa 255 ký tự' })
  contactEmail?: string;

  @ApiPropertyOptional({ maxLength: 15, description: 'SĐT Việt Nam: 0912345678 hoặc +84912345678' })
  @Transform(toOptional)
  @IsOptional()
  @Matches(/^(0|\+84)[0-9]{8,10}$/, { message: 'Số điện thoại không hợp lệ (VD: 0912345678 hoặc +84912345678)' })
  contactPhone?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(toOptional)
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Địa chỉ tối đa 500 ký tự' })
  address?: string;

  @ApiPropertyOptional()
  @Transform(toOptional)
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPortalUser?: boolean;
}
