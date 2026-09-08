import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateModulePermissionDto {
  @IsString()
  module: string;

  @IsEnum(Role)
  role: Role;

  @IsBoolean()
  allowed: boolean;

  @IsOptional()
  @IsString()
  mallId?: string;
}
