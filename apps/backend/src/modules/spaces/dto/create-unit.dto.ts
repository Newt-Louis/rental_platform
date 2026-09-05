import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum, IsBoolean, IsNotEmpty, Min } from 'class-validator';
import { UnitStatus } from '@prisma/client';

// Enums from schema — imported as string enums to avoid circular dependency before prisma client regeneration
export enum UnitLeaseTermTypeDto {
  LONG  = 'LONG',
  SHORT = 'SHORT',
}

export enum SpaceTypeDto {
  RETAIL_UNIT    = 'RETAIL_UNIT',
  LED            = 'LED',
  ESCALATOR_WRAP = 'ESCALATOR_WRAP',
  KIOSK_EVENT    = 'KIOSK_EVENT',
  ADVERTISING    = 'ADVERTISING',
  SERVICE        = 'SERVICE',
}

export enum UnitTierDto {
  A = 'A',
  B = 'B',
  C = 'C',
}

export class CreateUnitDto {
  @ApiPropertyOptional({ description: 'Mặc định lấy theo mall đang active của user nếu không truyền' })
  @IsOptional()
  @IsString({ message: 'Mã trung tâm thương mại không hợp lệ' })
  mallId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Mã tòa nhà không hợp lệ' })
  buildingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Tầng đã chọn không hợp lệ' })
  floorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Khu vực đã chọn không hợp lệ' })
  zoneId?: string;

  @ApiProperty()
  @IsString({ message: 'Mã mặt bằng phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập mã mặt bằng' })
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Tên mặt bằng phải là chuỗi ký tự' })
  name?: string;

  @ApiProperty()
  @IsNumber({}, { message: 'Diện tích GFA phải là một số hợp lệ' })
  @Min(0.01, { message: 'Diện tích GFA phải lớn hơn 0' })
  areaGFA: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Diện tích NLA phải là một số hợp lệ' })
  @Min(0, { message: 'Diện tích NLA không được âm' })
  areaNLA?: number;

  @ApiPropertyOptional({ description: 'Legacy free-text category label. Ignored when categoryId is provided (derived from the Category master record instead).' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'FK to Category master data (Admin > Ngành hàng). When set, `category` is derived from this record\'s name.' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Giá thuê cơ bản phải là một số hợp lệ' })
  @Min(0, { message: 'Giá thuê cơ bản không được âm' })
  baseRentPerSqm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Phí CAM phải là một số hợp lệ' })
  @Min(0, { message: 'Phí CAM không được âm' })
  camPerSqm?: number;

  @ApiPropertyOptional({ enum: UnitStatus })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;

  // ─── GAP #3 — Hình thức thuê ────────────────────────────────────────────

  @ApiPropertyOptional({ enum: UnitLeaseTermTypeDto, description: 'LONG = dài hạn, SHORT = ngắn hạn' })
  @IsOptional()
  @IsEnum(UnitLeaseTermTypeDto, { message: 'Hình thức thuê không hợp lệ' })
  leaseTermType?: UnitLeaseTermTypeDto;

  // ─── GAP #4 — Loại mặt bằng ─────────────────────────────────────────────

  @ApiPropertyOptional({ enum: SpaceTypeDto })
  @IsOptional()
  @IsEnum(SpaceTypeDto, { message: 'Loại mặt bằng không hợp lệ' })
  spaceType?: SpaceTypeDto;

  // ─── GAP #5 — Sảnh linh động ─────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'true = cho phép thuê theo diện tích linh động' })
  @IsOptional()
  @IsBoolean()
  isFlexibleArea?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Diện tích linh động tối thiểu phải là một số hợp lệ' })
  @Min(0, { message: 'Diện tích linh động tối thiểu không được âm' })
  minFlexArea?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Diện tích linh động tối đa phải là một số hợp lệ' })
  @Min(0, { message: 'Diện tích linh động tối đa không được âm' })
  maxFlexArea?: number;

  // ─── GAP #6 — Tier ──────────────────────────────────────────────────────

  @ApiPropertyOptional({ enum: UnitTierDto, description: 'A = prime, B = standard, C = value' })
  @IsOptional()
  @IsEnum(UnitTierDto, { message: 'Phân hạng mặt bằng không hợp lệ' })
  tier?: UnitTierDto;
}
