import { IsOptional, IsString } from 'class-validator';

export class ResetModulePermissionsDto {
  @IsOptional()
  @IsString()
  mallId?: string;
}
