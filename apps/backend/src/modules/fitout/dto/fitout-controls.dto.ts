import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

const toDecimalString = ({ value }: { value: unknown }) => typeof value === 'number' ? String(value) : value;
const DECIMAL_18_2 = /^\d{1,16}(?:\.\d{1,2})?$/;

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
  @Transform(toDecimalString) @IsString() @Matches(DECIMAL_18_2) proposedAmount: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() scheduleImpactDays?: number;
}

export class DecideFitoutChangeOrderDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: string;
  @IsOptional() @Transform(toDecimalString) @IsString() @Matches(DECIMAL_18_2) approvedAmount?: string;
  @IsOptional() @IsString() decisionNote?: string;
}
