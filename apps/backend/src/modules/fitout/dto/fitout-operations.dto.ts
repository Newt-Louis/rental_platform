import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFitoutIssueDto {
  @IsString() @MinLength(1) projectId!: string;
  @IsString() @MinLength(1) unitId!: string;
  @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(50) category?: string;
  @IsOptional() @IsString() @MaxLength(50) severity?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) positionX?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) positionY?: number;
}

export class UpdateFitoutIssueDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(50) category?: string;
  @IsOptional() @IsString() @MaxLength(50) severity?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class CreateDailyReportDto {
  @IsString() @MinLength(1) projectId!: string;
  @IsDateString() reportDate!: string;
  @IsOptional() @IsString() contractorId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) workforceCount?: number;
  @IsString() @MinLength(1) @MaxLength(10000) description!: string;
  @IsOptional() @IsString() @MaxLength(200) areaTag?: string;
}

export class CreateGanttTaskDto {
  @IsString() @MinLength(1) projectId!: string;
  @IsString() @MinLength(1) @MaxLength(300) name!: string;
  @IsOptional() @IsString() parentTaskId?: string;
  @IsDateString() plannedStart!: string;
  @IsDateString() plannedEnd!: string;
  @IsOptional() @IsString() assignedContractorId?: string;
  @IsOptional() @IsString() dependsOnTaskId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateGanttTaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) name?: string;
  @IsOptional() @IsDateString() plannedStart?: string;
  @IsOptional() @IsDateString() plannedEnd?: string;
  @IsOptional() @IsDateString() revisedStart?: string;
  @IsOptional() @IsDateString() revisedEnd?: string;
  @IsOptional() @IsDateString() actualStart?: string;
  @IsOptional() @IsDateString() actualEnd?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) percentComplete?: number;
  @IsOptional() @IsString() assignedContractorId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}
