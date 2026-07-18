import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@Roles(...MODULE_ROLES.dashboard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get dashboard KPIs' })
  @ApiQuery({ name: 'mallId', required: false })
  getDashboard(
    @Query('mallId') mallId?: string,
    @CurrentUser() user?: { id: string; role: string },
  ) {
    return this.dashboardService.getDashboard(mallId, user);
  }

  @Get('cross-mall')
  @Roles(...MODULE_ROLES.crossMall)
  @ApiOperation({ summary: 'Cross-mall consolidation dashboard for CEO/ADMIN' })
  getCrossMallDashboard() {
    return this.dashboardService.getCrossMallDashboard();
  }
}
