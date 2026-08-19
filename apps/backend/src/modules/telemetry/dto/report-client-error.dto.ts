import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const CLIENT_ERROR_SOURCES = [
  'error-boundary',
  'window-error',
  'unhandled-rejection',
  'api-error',
] as const;

export class ReportClientErrorDto {
  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  route?: string;

  @IsOptional()
  @IsIn(CLIENT_ERROR_SOURCES)
  source?: (typeof CLIENT_ERROR_SOURCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  appVersion?: string;
}
