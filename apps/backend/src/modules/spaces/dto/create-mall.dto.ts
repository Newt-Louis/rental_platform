import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { MallLeaseCategory } from '@prisma/client';

export class CreateMallDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiPropertyOptional({ enum: MallLeaseCategory, description: 'Loại hình thuê (OFFICE/MALL) — quyết định loại phí Billing Add-in áp dụng, vd Phụ thu Phí Quản Lý chỉ áp dụng OFFICE' })
  @IsOptional()
  @IsEnum(MallLeaseCategory)
  leaseCategory?: MallLeaseCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  totalArea?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
