import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from './decorators/roles.decorator';
import { OperationalMetricsService } from './services/operational-metrics.service';

@ApiTags('Operations')
@ApiBearerAuth('JWT-auth')
@Roles(Role.ADMIN, Role.CEO)
@Controller('operations')
export class OperationalController {
  constructor(private readonly metrics: OperationalMetricsService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Process-level operational metrics for administrators' })
  metricsSnapshot() {
    return this.metrics.snapshot();
  }
}
