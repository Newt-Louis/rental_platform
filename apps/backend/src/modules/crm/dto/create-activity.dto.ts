import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateActivityDto {
  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  note: string;
}
