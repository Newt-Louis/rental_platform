import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFitoutRiskDto {
  @IsString() @MinLength(2) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) probability: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) impact: number;
  @IsOptional() @IsString() mitigationPlan?: string;
  @IsOptional() @IsString() contingencyPlan?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class UpdateFitoutRiskDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) probability?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) impact?: number;
  @IsOptional() @IsIn(['OPEN', 'MITIGATING', 'ACCEPTED', 'CLOSED']) status?: string;
  @IsOptional() @IsString() mitigationPlan?: string;
  @IsOptional() @IsString() contingencyPlan?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class CreateFitoutChangeOrderDto {
  @IsString() @MinLength(2) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsIn(['ADDITION', 'DEDUCTION']) costType?: string;
  @Type(() => Number) @IsNumber() @Min(0) proposedAmount: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() scheduleImpactDays?: number;
}

export class DecideFitoutChangeOrderDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) approvedAmount?: number;
  @IsOptional() @IsString() decisionNote?: string;
}
