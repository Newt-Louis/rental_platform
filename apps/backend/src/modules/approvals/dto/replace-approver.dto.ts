import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ReplaceApproverDto {
  @ApiProperty()
  @IsString()
  mallId: string;

  @ApiProperty({ description: 'Người phụ trách hiện tại' })
  @IsString()
  fromUserId: string;

  @ApiProperty({ description: 'Người phụ trách mới' })
  @IsString()
  toUserId: string;
}
