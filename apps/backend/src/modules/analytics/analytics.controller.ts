import { Controller, Get, Post, Put, Body, Query, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { OccupancyAnalyticsService } from './occupancy-analytics.service';
import { RenewalRiskService } from './renewal-risk.service';
import { ComplianceService } from './compliance.service';
import { ComplianceSchedulerService } from './compliance-scheduler.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.analytics)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private occupancy: OccupancyAnalyticsService,
    private renewalRisk: RenewalRiskService,
    private compliance: ComplianceService,
    private complianceScheduler: ComplianceSchedulerService,
  ) {}

  @Get('occupancy')
  @ApiOperation({ summary: 'Get occupancy analytics v2' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'floorId', required: false })
  @ApiQuery({ name: 'category', required: false })
  getOccupancyV2(
    @Query('mallId') mallId?: string,
    @Query('floorId') floorId?: string,
    @Query('category') category?: string,
  ) {
    return this.occupancy.getOccupancyV2(mallId, floorId, category);
  }

  @Get('occupancy/trend')
  @ApiOperation({ summary: 'Get occupancy trend over time' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'months', required: false })
  getOccupancyTrend(
    @Query('mallId') mallId?: string,
    @Query('months') months?: string,
  ) {
    return this.occupancy.getOccupancyTrend(mallId, months ? parseInt(months) : 12);
  }

  @Get('vacancy')
  @ApiOperation({ summary: 'Get vacancy analysis with estimated loss' })
  @ApiQuery({ name: 'mallId', required: false })
  getVacancyAnalysis(@Query('mallId') mallId?: string) {
    return this.occupancy.getVacancyAnalysis(mallId);
  }

  // GAP #28 — Breakdown ngành hàng theo tầng
  @Get('occupancy/category-by-floor')
  @ApiOperation({ summary: 'GAP #28 — Breakdown ngành hàng × tầng với tỉ lệ lấp đầy từng ngành' })
  @ApiQuery({ name: 'mallId', required: false })
  getCategoryByFloor(@Query('mallId') mallId?: string) {
    return this.occupancy.getCategoryByFloor(mallId);
  }

  @Get('renewal-risk')
  @ApiOperation({ summary: 'Get renewal risk dashboard' })
  @ApiQuery({ name: 'mallId', required: false })
  getRenewalRiskDashboard(@Query('mallId') mallId?: string) {
    return this.renewalRisk.getRiskDashboard(mallId);
  }

  @Post('renewal-risk/:contractId')
  @ApiOperation({ summary: 'Calculate renewal risk for a contract' })
  calculateRenewalRisk(@Param('contractId') contractId: string) {
    return this.renewalRisk.calculateRiskScore(contractId);
  }

  @Get('multi-mall')
  @ApiOperation({ summary: 'Get multi-mall comparison' })
  getMultiMallComparison() {
    return this.compliance.getMultiMallComparison();
  }

  @Get('mall-policy/:mallId')
  @ApiOperation({ summary: 'Get mall policy' })
  getMallPolicy(@Param('mallId') mallId: string) {
    return this.compliance.getMallPolicy(mallId);
  }

  @Post('mall-policy/:mallId')
  @ApiOperation({ summary: 'Update mall policy' })
  upsertMallPolicy(
    @Param('mallId') mallId: string,
    @Body() body: { policies: Record<string, any>; kpiTargets?: Record<string, any> },
  ) {
    return this.compliance.upsertMallPolicy(mallId, body);
  }

  @Get('compliance/exports')
  @ApiOperation({ summary: 'List compliance exports' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listExports(
    @Query('mallId') mallId?: string,
    @Query('status') status?: string,
  ) {
    return this.compliance.listExports({ mallId, status });
  }

  @Post('compliance/exports')
  @ApiOperation({ summary: 'Request compliance export' })
  requestExport(
    @Body() body: {
      exportType: string;
      mallId?: string;
      periodStart: string;
      periodEnd: string;
    },
    @CurrentUser() user: any,
  ) {
    return this.compliance.requestExport({
      exportType: body.exportType,
      mallId: body.mallId,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      requestedBy: user?.id ?? 'system',
    });
  }

  @Post('compliance/exports/:id/generate')
  @ApiOperation({ summary: 'Generate compliance export' })
  generateExport(@Param('id') id: string) {
    return this.compliance.generateExport(id);
  }

  @Post('compliance/exports/generate-monthly')
  @ApiOperation({ summary: 'Manually trigger monthly compliance report generation' })
  triggerMonthlyReports() {
    return this.complianceScheduler.generateMonthlyReports();
  }

  // ── Retention Policy ───────────────────────────────────────────────────────
  @Get('compliance/retention/default')
  @ApiOperation({ summary: 'Get default document retention policy (days)' })
  getDefaultRetention() {
    return this.complianceScheduler.getDefaultRetentionPolicy();
  }

  @Get('compliance/retention/:mallId')
  @ApiOperation({ summary: 'Get retention policy for a mall' })
  getMallRetention(@Param('mallId') mallId: string) {
    return this.complianceScheduler.getMallRetentionPolicy(mallId);
  }

  @Put('compliance/retention/:mallId')
  @ApiOperation({ summary: 'Update retention policy for a mall' })
  updateMallRetention(
    @Param('mallId') mallId: string,
    @Body('retentionDays') retentionDays: Record<string, number>,
  ) {
    return this.complianceScheduler.updateRetentionPolicy(mallId, retentionDays);
  }
}
