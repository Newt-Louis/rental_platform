import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ArrayUnique, IsArray, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiPropertyOptional({ enum: Role, default: Role.LEASING_EXECUTIVE })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Tenant record liên kết — chỉ có ý nghĩa khi role=TENANT' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Danh sách Mall được cấp quyền truy cập. Bỏ trống = tài khoản xem dữ liệu của tất cả Mall. '
      + 'Tài khoản và quyền Mall được tạo trong cùng một transaction.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  mallIds?: string[];

  @ApiPropertyOptional({ enum: Role, description: 'Vai trò áp dụng cho các Mall được chọn. Mặc định là role của tài khoản.' })
  @IsOptional()
  @IsEnum(Role)
  mallRole?: Role;
}
