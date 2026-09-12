import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CurrencyCode } from '@prisma/client';

/**
 * CR-...-ALWAYS-WARN-004 — inputs for a pricing evaluation that writes nothing.
 *
 * Only the fields that can change the outcome. The unit is read live on the
 * server, so the caller cannot preview against a unit, category or band it
 * merely remembers.
 */
export class PreviewPricingDto {
  @ApiProperty()
  @IsString()
  unitId: string;

  @ApiProperty({ description: 'Giá đề xuất /m²/tháng' })
  @IsNumber()
  @Min(0)
  proposedRentPerSqm: number;

  @ApiPropertyOptional({ enum: CurrencyCode })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currencyCode?: CurrencyCode;
}
