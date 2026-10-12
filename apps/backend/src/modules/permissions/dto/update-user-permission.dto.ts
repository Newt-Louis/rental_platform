import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PERMISSION_ACTION_VALUES } from './update-module-permission.dto';

export class UpdateUserPermissionDto {
  @IsString()
  module: string;

  @IsIn(PERMISSION_ACTION_VALUES)
  action: (typeof PERMISSION_ACTION_VALUES)[number];

  /** true = grant, false = deny, null = inherit from the user's role. */
  @IsOptional()
  @IsBoolean()
  value?: boolean | null;

  @IsOptional()
  @IsString()
  mallId?: string;
}
