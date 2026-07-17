import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ type: Boolean, description: 'true: active, false: locked; omit: all' })
  @IsOptional()
  // Keep this as a string. With global implicit conversion, Boolean('false') is
  // true before a property transform runs, which reverses the locked filter.
  @IsIn(['true', 'false'])
  isActive?: 'true' | 'false';
}
