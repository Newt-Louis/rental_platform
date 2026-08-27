import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateWorkOrderDto {
  @IsString() mallId: string;
  @IsOptional() @IsString() unitId?: string;
  @IsString() category: string;
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"]) priority?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() assignedDepartment?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsArray() @Type(() => String) checklist?: string[];
  @IsOptional() @IsString() sourceEntityType?: string;
  @IsOptional() @IsString() sourceEntityId?: string;
}
