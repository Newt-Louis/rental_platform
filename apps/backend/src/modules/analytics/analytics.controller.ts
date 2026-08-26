import { Controller, Get, Post, Put, Body, Query, UseGuards, Param, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { Role } from '@prisma/client';
import { OccupancyAnalyticsService } from './occupancy-analytics.service';
import { RenewalRiskService } from './renewal-risk.service';
import { ComplianceService } from './compliance.service';
import { ComplianceSchedulerService } from './compliance-scheduler.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';
import { MallAccessService } from '../../common/services/mall-access.service';

// CR-101 Phase 3G (BC-013): every read route below resolves its Mall scope via
// MallAccessService (crossMallRead-aware, so CEO gets unrestricted per
// BC-CEO-SCOPE Option A) instead of trusting/ignoring a raw mallId.
// upsertMallPolicy/updateMallRetention are config-WRITE actions -- narrowed
// below to exclude CEO (BC-CEO-SCOPE Option A: "Analytics configuration" is
// one of the confirmed operational-write contradictions to remove).
const ANALYTICS_CONFIG_WRITE_ROLES = MODULE_ROLES.analytics.filter((r) => r !== Role.CEO);

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.analytics)
@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3G (BC-013)' })
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private occupancy: OccupancyAnalyticsService,
    private renewalRisk: RenewalRiskService,
    private compliance: ComplianceService,
    private complianceScheduler: ComplianceSchedulerService,
    private mallAccess: MallAccessService,
  ) {}

  /** Resolves the caller's Mall scope: an explicit mallId (validated against the
   * caller's own access), or the caller's full accessible set (null =
   * unrestricted, for ADMIN/CEO). */
  private async scope(user: any, mallId?: string): Promise<string[] | null> {
    if (mallId) {
      await this.mallAccess.assertMallAccess(user.id, user.role, mallId, { crossMallRead: true });
      return [mallId];
    }
    return this.mallAccess.getAccessibleMallIds(user.id, user.role, { crossMallRead: true });
  }

  @Get('occupancy')
  @ApiOperation({ summary: 'Get occupancy analytics v2' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'floorId', required: false })
  @ApiQuery({ name: 'category', required: false })
  async getOccupancyV2(
    @Query('mallId') mallId: string | undefined,
    @Query('floorId') floorId: string | undefined,
    @Query('category') category: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.occupancy.getOccupancyV2(mallId, floorId, category, await this.scope(user, mallId));
  }

  @Get('occupancy/trend')
  @ApiOperation({ summary: 'Get occupancy trend over time' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'months', required: false })
  async getOccupancyTrend(
    @Query('mallId') mallId: string | undefined,
    @Query('months') months: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.occupancy.getOccupancyTrend(mallId, months ? parseInt(months) : 12, await this.scope(user, mallId));
  }

  @Get('vacancy')
  @ApiOperation({ summary: 'Get vacancy analysis with estimated loss' })
  @ApiQuery({ name: 'mallId', required: false })
  async getVacancyAnalysis(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    return this.occupancy.getVacancyAnalysis(mallId, await this.scope(user, mallId));
  }

  // GAP #28 — Breakdown ngành hàng theo tầng
  @Get('occupancy/category-by-floor')
  @ApiOperation({ summary: 'GAP #28 — Breakdown ngành hàng × tầng với tỉ lệ lấp đầy từng ngành' })
  @ApiQuery({ name: 'mallId', required: false })
  async getCategoryByFloor(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    return this.occupancy.getCategoryByFloor(mallId, await this.scope(user, mallId));
  }

  @Get('renewal-risk')
  @ApiOperation({ summary: 'Get renewal risk dashboard' })
  @ApiQuery({ name: 'mallId', required: false })
  async getRenewalRiskDashboard(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    return this.renewalRisk.getRiskDashboard(mallId, await this.scope(user, mallId));
  }

  @Post('renewal-risk/:contractId')
  @ApiOperation({ summary: 'Calculate renewal risk for a contract' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'contractId', resolver: 'contract' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async calculateRenewalRisk(@Param('contractId') contractId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { contractId });
    return this.renewalRisk.calculateRiskScore(contractId);
  }

  @Get('multi-mall')
  @ApiOperation({ summary: 'Get multi-mall comparison' })
  @Scope({ type: ScopeType.MALL_SCOPED, crossMallRead: true, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3G (BC-013) -- closes the CONTRA-008/AUTH-01 gap this route was tracked under' })
  async getMultiMallComparison(@CurrentUser() user: any) {
    return this.compliance.getMultiMallComparison(await this.scope(user));
  }

  @Get('mall-policy/:mallId')
  @ApiOperation({ summary: 'Get mall policy' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'param', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async getMallPolicy(@Param('mallId') mallId: string, @CurrentUser() user: any) {
    await this.mallAccess.assertMallAccess(user.id, user.role, mallId, { crossMallRead: true });
    return this.compliance.getMallPolicy(mallId);
  }

  @Post('mall-policy/:mallId')
  @Roles(...ANALYTICS_CONFIG_WRITE_ROLES)
  @ApiOperation({ summary: 'Update mall policy' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'param', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async upsertMallPolicy(
    @Param('mallId') mallId: string,
    @Body() body: { policies: Record<string, any>; kpiTargets?: Record<string, any> },
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    return this.compliance.upsertMallPolicy(mallId, body);
  }

  @Get('compliance/exports')
  @ApiOperation({ summary: 'List compliance exports' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, crossMallRead: true, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-GOLDEN-W17' })
  async listExports(
    @Query('mallId') mallId?: string,
    @Query('status') status?: string,
    @CurrentUser() user?: any,
  ) {
    return this.compliance.listExports({ mallId, status, mallIds: await this.scope(user, mallId) });
  }

  @Post('compliance/exports')
  @ApiOperation({ summary: 'Request compliance export' })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-GOLDEN-W17' })
  async requestExport(
    @Body() body: {
      exportType: string;
      mallId?: string;
      periodStart: string;
      periodEnd: string;
    },
    @CurrentUser() user: any,
  ) {
    if (body.mallId) {
      await this.mallAccess.assertMallAccess(user.id, user.role, body.mallId);
    } else if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Global compliance exports require ADMIN role');
    }

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
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-GOLDEN-W17' })
  async generateExport(@Param('id') id: string, @CurrentUser() user: any) {
    const exp = await this.compliance.getExport(id);
    if (exp?.mallId) {
      await this.mallAccess.assertMallAccess(user.id, user.role, exp.mallId);
    } else if (exp && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Global compliance exports require ADMIN role');
    }
    return this.compliance.generateExport(id);
  }

  @Post('compliance/exports/generate-monthly')
  @Roles(Role.ADMIN)
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
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'param', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async getMallRetention(@Param('mallId') mallId: string, @CurrentUser() user: any) {
    await this.mallAccess.assertMallAccess(user.id, user.role, mallId, { crossMallRead: true });
    return this.complianceScheduler.getMallRetentionPolicy(mallId);
  }

  @Put('compliance/retention/:mallId')
  @Roles(...ANALYTICS_CONFIG_WRITE_ROLES)
  @ApiOperation({ summary: 'Update retention policy for a mall' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'param', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async updateMallRetention(
    @Param('mallId') mallId: string,
    @Body('retentionDays') retentionDays: Record<string, number>,
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    return this.complianceScheduler.updateRetentionPolicy(mallId, retentionDays);
  }
}
