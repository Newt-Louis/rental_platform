import { Body, Controller, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ReportClientErrorDto } from './dto/report-client-error.dto';

/**
 * Public and unauthenticated on purpose: unhandled frontend errors can happen
 * before login (e.g. on the login screen itself), so this can't require a
 * JWT. Protected from abuse by the global ThrottlerGuard (100 req/min) plus
 * DTO length limits; nothing here is stored, only logged, so there is no
 * write-amplification risk beyond log volume.
 */
@ApiTags('Telemetry')
@Controller('telemetry')
export class TelemetryController {
  private readonly logger = new Logger('ClientTelemetry');

  @Post('client-errors')
  @Public()
  @HttpCode(202)
  @ApiOperation({ summary: 'Report an unhandled frontend error for server-side logging' })
  report(@Body() dto: ReportClientErrorDto, @Req() req: any) {
    this.logger.error(
      JSON.stringify({
        requestId: req.requestId ?? null,
        source: dto.source ?? 'unknown',
        message: dto.message,
        route: dto.route ?? null,
        appVersion: dto.appVersion ?? null,
        stack: dto.stack ?? null,
      }),
    );
    return { received: true };
  }
}
