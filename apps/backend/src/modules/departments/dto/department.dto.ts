import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class ListDepartmentsDto extends PaginationDto {
  @ApiProperty({ description: "Mall whose Department catalogue is requested" })
  @IsString()
  @IsNotEmpty()
  mallId: string;
}

export class DepartmentOptionsDto {
  @ApiProperty({
    description: "Mall whose complete Department options are requested",
  })
  @IsString()
  @IsNotEmpty()
  mallId: string;
}

export class CreateDepartmentDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: "Owning Mall. Immutable after creation." })
  @IsString()
  @IsNotEmpty()
  mallId: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "Same-Mall parent Department ID",
  })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "Null makes this a root Department",
  })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
