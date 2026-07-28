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
  @IsString()
  mallId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buildingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  floorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zoneId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  areaGFA: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  areaNLA?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseRentPerSqm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  camPerSqm?: number;

  @ApiPropertyOptional({ enum: UnitStatus })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;

  // ─── GAP #3 — Hình thức thuê ────────────────────────────────────────────

  @ApiPropertyOptional({ enum: UnitLeaseTermTypeDto, description: 'LONG = dài hạn, SHORT = ngắn hạn' })
  @IsOptional()
  @IsEnum(UnitLeaseTermTypeDto)
  leaseTermType?: UnitLeaseTermTypeDto;

  // ─── GAP #4 — Loại mặt bằng ─────────────────────────────────────────────

  @ApiPropertyOptional({ enum: SpaceTypeDto })
  @IsOptional()
  @IsEnum(SpaceTypeDto)
  spaceType?: SpaceTypeDto;

  // ─── GAP #5 — Sảnh linh động ─────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'true = cho phép thuê theo diện tích linh động' })
  @IsOptional()
  @IsBoolean()
  isFlexibleArea?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minFlexArea?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxFlexArea?: number;

  // ─── GAP #6 — Tier ──────────────────────────────────────────────────────

  @ApiPropertyOptional({ enum: UnitTierDto, description: 'A = prime, B = standard, C = value' })
  @IsOptional()
  @IsEnum(UnitTierDto)
  tier?: UnitTierDto;
}
