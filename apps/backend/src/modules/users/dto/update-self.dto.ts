import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

// Self-service profile edit — deliberately narrower than UpdateUserDto (no
// role/isActive/email/department/tenantId) so any authenticated role can hit
// this endpoint without a privilege-escalation path.
export class UpdateSelfDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}
