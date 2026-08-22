import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateSalesDto, DisputeSalesDto } from './dto/sales.dto';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 3G (BC-CEO-SCOPE Option A): "Sales creation" is a confirmed
// operational-write contradiction -- CEO keeps read/approve/dispute, loses
// record-creation specifically.
const SALES_CREATE_ROLES = MODULE_ROLES.sales.filter((r) => r !== Role.CEO);

// CR-101 Phase 1: descriptive only. Class default reflects the confirmed gap
// for internal (non-TENANT) roles -- no mallId filtering anywhere in this
// controller/service. TENANT's own-submission paths are correctly
// tenant-scoped at the service layer (verified: sales.service.ts) and
// overridden below; :id-keyed routes (audit/approve/dispute) are not
// individually re-verified this pass and inherit the class default.
@ApiTags('Sales Turnover')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.sales)
@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.GAP, trackedAs: 'BC-007 / CONTRA-008' })
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'List sales turnover records' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.salesService.findAll(query, user);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get sales summary for a period' })
  @ApiQuery({ name: 'period', required: true })
  getSummary(@Query('period') period: string, @CurrentUser() user: any) {
    return this.salesService.getSummary(period, user);
  }

  @Get('top-tenants')
  @ApiOperation({ summary: 'Get top tenants by sales for a period (nội bộ — lộ tên/doanh thu tenant khác)' })
  @Roles(...MODULE_ROLES.salesStaff)
  @ApiQuery({ name: 'period', required: true })
  @ApiQuery({ name: 'limit', required: false })
  getTopTenants(@Query('period') period: string, @Query('limit') limit?: number) {
    return this.salesService.getTopTenants(period, limit);
  }

  @Post()
  @Roles(...SALES_CREATE_ROLES)
  @ApiOperation({ summary: 'Record sales turnover (upsert by period)' })
  create(@Body() dto: CreateSalesDto, @CurrentUser() user: any) {
    return this.salesService.create(dto, user.id, user);
  }

  @Get('deadline')
  @ApiOperation({ summary: 'Get submission deadline status for a period (nội bộ — lộ tên tenant khác)' })
  @Roles(...MODULE_ROLES.salesStaff)
  @ApiQuery({ name: 'period', required: true })
  getDeadlineStatus(@Query('period') period: string) {
    return this.salesService.getDeadlineStatus(period);
  }

  @Get('submission-units')
  @ApiOperation({ summary: 'Get tenant-scoped units available for sales submission' })
  getSubmissionUnits(@CurrentUser() user: any) {
    return this.salesService.getSubmissionUnits(user);
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Get audit trail for a sales record' })
  @Roles(...MODULE_ROLES.salesStaff)
  getAuditTrail(@Param('id') id: string) {
    return this.salesService.getAuditTrail(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a sales record' })
  @Roles(...MODULE_ROLES.salesStaff)
  approveSales(@Param('id') id: string, @CurrentUser() user: any) {
    return this.salesService.approveSales(id, user.id);
  }

  @Post(':id/dispute')
  @ApiOperation({ summary: 'Dispute a sales record' })
  @Roles(...MODULE_ROLES.salesStaff)
  disputeSales(@Param('id') id: string, @Body() dto: DisputeSalesDto, @CurrentUser() user: any) {
    return this.salesService.disputeSales(id, dto.reason, user.id);
  }
}
