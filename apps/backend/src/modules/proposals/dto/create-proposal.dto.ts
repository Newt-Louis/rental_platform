import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsDateString, IsInt, Min } from 'class-validator';

export class CreateProposalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty()
  @IsString()
  unitId: string;

  @ApiProperty()
  @IsNumber()
  area: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  term: number;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsNumber()
  rentPerSqm: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  camPerSqm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  deposit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  rentFree?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  escalationPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  revenueSharePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  marketingFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  serviceFeeSqm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  businessSupportFeeSqm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rentCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  fitoutDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  handoverDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  openingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialConditions?: string;
}
