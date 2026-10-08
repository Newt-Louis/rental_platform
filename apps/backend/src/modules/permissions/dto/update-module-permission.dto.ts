import { IsBoolean, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export const PERMISSION_ACTION_VALUES = ['view', 'create', 'update', 'delete'] as const;

export class UpdateModulePermissionDto {
  @IsString()
  module: string;

  @IsEnum(Role)
  role: Role;

  @IsBoolean()
  allowed: boolean;

  /** Which right to set; omitted = 'view' (module access), as before. */
  @IsOptional()
  @IsIn(PERMISSION_ACTION_VALUES)
  action?: (typeof PERMISSION_ACTION_VALUES)[number];

  @IsOptional()
  @IsString()
  mallId?: string;
}
