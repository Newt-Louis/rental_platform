import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 1: descriptive only. Class default reflects the correctly-scoped
// (service-internal) main dashboard; the cross-mall route overrides below with
// crossMallRead per docs/architecture-review/19-CR-101-ADR.md's proposal.

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@Roles(...MODULE_ROLES.dashboard)
@Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED })
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get dashboard KPIs' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'refresh', required: false, description: 'Bypass Redis cache when true' })
  getDashboard(
    @Query('mallId') mallId?: string,
    @Query('refresh') refresh?: string,
    @CurrentUser() user?: { id: string; role: string },
  ) {
    return this.dashboardService.getDashboard(mallId, user, refresh === 'true');
  }

  @Get('cross-mall')
  @Roles(...MODULE_ROLES.crossMall)
  @Scope({ type: ScopeType.MALL_SCOPED, crossMallRead: true, status: EnforcementStatus.ENFORCED })
  @ApiOperation({ summary: 'Cross-mall consolidation dashboard for CEO/ADMIN' })
  getCrossMallDashboard() {
    return this.dashboardService.getCrossMallDashboard();
  }
}
