import { IsOptional, IsString, MinLength } from 'class-validator';

export class ApproveDecisionDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectDecisionDto {
  @IsString()
  @MinLength(5)
  comment: string;
}
