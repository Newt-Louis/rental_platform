import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from './decorators/roles.decorator';
import { OperationalMetricsService } from './services/operational-metrics.service';
import { PrismaService } from '../prisma/prisma.service';

const CONSECUTIVE_FAILURE_LOOKBACK = 5;

@ApiTags('Operations')
@ApiBearerAuth('JWT-auth')
@Roles(Role.ADMIN, Role.CEO)
@Controller('operations')
export class OperationalController {
  constructor(
    private readonly metrics: OperationalMetricsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Process-level operational metrics for administrators' })
  metricsSnapshot() {
    return this.metrics.snapshot();
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Last-run status of every scheduled job, for administrators' })
  async jobsSnapshot() {
    const jobNames = await this.prisma.jobExecution.findMany({
      distinct: ['jobName'],
      select: { jobName: true },
      orderBy: { jobName: 'asc' },
    });

    const jobs = await Promise.all(
      jobNames.map(async ({ jobName }) => {
        const recent = await this.prisma.jobExecution.findMany({
          where: { jobName },
          orderBy: { startedAt: 'desc' },
          take: CONSECUTIVE_FAILURE_LOOKBACK,
        });
        const last = recent[0] ?? null;
        const firstNonFailure = recent.findIndex((row) => row.status !== 'FAILED');
        const consecutiveFailures = firstNonFailure === -1 ? recent.length : firstNonFailure;

        return {
          jobName,
          lastStatus: last?.status ?? null,
          lastStartedAt: last?.startedAt ?? null,
          lastFinishedAt: last?.finishedAt ?? null,
          lastDurationMs: last?.durationMs ?? null,
          lastErrorSummary: last?.errorSummary ?? null,
          consecutiveFailures,
        };
      }),
    );

    return { jobs };
  }
}
