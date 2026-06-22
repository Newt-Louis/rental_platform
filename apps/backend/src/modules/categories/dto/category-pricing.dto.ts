import { IsString, IsOptional, IsNumber, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryPricingDto {
  @ApiProperty({ description: 'Mall ID' })
  @IsString()
  mallId: string;

  @ApiProperty({ description: 'Category ID' })
  @IsString()
  categoryId: string;

  @ApiPropertyOptional({ description: 'Floor ID (optional for floor-specific pricing)' })
  @IsString()
  @IsOptional()
  floorId?: string;

  @ApiPropertyOptional({ description: 'Zone ID (optional for zone-specific pricing)' })
  @IsString()
  @IsOptional()
  zoneId?: string;

  @ApiProperty({ description: 'Minimum rent per sqm (VND)', example: 400000 })
  @IsNumber()
  @Min(0)
  minRentPerSqm: number;

  @ApiProperty({ description: 'Maximum rent per sqm (VND)', example: 800000 })
  @IsNumber()
  @Min(0)
  maxRentPerSqm: number;

  @ApiPropertyOptional({ description: 'Suggested rent per sqm (VND)', example: 550000 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  suggestedRent?: number;

  @ApiPropertyOptional({ description: 'CAM per sqm (VND)', example: 80000, default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  camPerSqm?: number;

  @ApiPropertyOptional({ description: 'Effective from date' })
  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: 'Effective to date (null = no end)' })
  @IsDateString()
  @IsOptional()
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateCategoryPricingDto {
  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @IsOptional()
  minRentPerSqm?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxRentPerSqm?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @IsOptional()
  suggestedRent?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @IsOptional()
  camPerSqm?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;
}

export class PriceLookupDto {
  @ApiProperty()
  @IsString()
  mallId: string;

  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  floorId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  zoneId?: string;
}

export class ValidatePriceDto {
  @ApiProperty()
  @IsString()
  mallId: string;

  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  floorId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  zoneId?: string;

  @ApiProperty({ description: 'Proposed rent per sqm (VND)' })
  @IsNumber()
  @Min(0)
  proposedRentPerSqm: number;
}
