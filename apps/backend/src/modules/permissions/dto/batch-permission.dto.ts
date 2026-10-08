import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Role } from '@prisma/client';

/** A flag that is left out is not changed. */
export class RoleModuleChangeDto {
  @IsString() module: string;
  @IsOptional() @IsBoolean() view?: boolean;
  @IsOptional() @IsBoolean() create?: boolean;
  @IsOptional() @IsBoolean() update?: boolean;
  @IsOptional() @IsBoolean() delete?: boolean;
}

export class UpdateRolePermissionsBatchDto {
  @IsEnum(Role) role: Role;
  @IsOptional() @IsString() mallId?: string;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => RoleModuleChangeDto)
  changes: RoleModuleChangeDto[];
}

/** true = grant, false = deny, null = inherit from the role. */
export class UserModuleChangeDto {
  @IsString() module: string;
  @IsOptional() @IsBoolean() view?: boolean | null;
  @IsOptional() @IsBoolean() create?: boolean | null;
  @IsOptional() @IsBoolean() update?: boolean | null;
  @IsOptional() @IsBoolean() delete?: boolean | null;
}

export class UpdateUserPermissionsBatchDto {
  @IsOptional() @IsString() mallId?: string;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => UserModuleChangeDto)
  changes: UserModuleChangeDto[];
}
