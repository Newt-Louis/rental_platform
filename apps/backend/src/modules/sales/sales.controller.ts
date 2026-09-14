import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ModuleRoles } from '../../common/decorators/module-roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateSalesDto, DisputeSalesDto } from './dto/sales.dto';
import { Scope } from '../../common/decorators/scope.decorator';
import { MallAccessService } from '../../common/services/mall-access.service';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 3G (BC-CEO-SCOPE Option A): "Sales creation" is a confirmed
// operational-write contradiction -- CEO keeps read/approve/dispute, loses
// record-creation specifically.
const SALES_CREATE_ROLES = MODULE_ROLES.sales.filter((r) => r !== Role.CEO);

// MALL-001 / BC-007 -- the gap this class default recorded was PROVEN at runtime
// (2026-09-07) and is now closed. A MALL_DIRECTOR holding access to Mall A only
// could read Mall B's turnover through every list route, and could APPROVE and
// DISPUTE a Mall B record by id -- a financial approval state feeding
// revenue-share billing.
//
// Every route now derives its Mall scope server-side from the authenticated
// user. List routes intersect through `getAccessibleMallIds`; :id-keyed routes
// resolve the record's owning Mall through MallAccessService's
// `salesTurnoverId` resolver. Nothing on the request can widen the scope: the
// only client-supplied filter here is `tenantId`, which narrows within the
// derived Mall set and cannot reach outside it.
@ApiTags('Sales Turnover')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@ModuleRoles('sales')
@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: 'MALL-001 -- runtime-proven and closed 2026-09-07; was BC-007 / CONTRA-008' })
@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly mallAccess: MallAccessService,
  ) {}

  /**
   * The user's own Mall set, never anything the request asked for.
   *
   * `null` comes back only for roles MallAccessService lets bypass (ADMIN; and
   * TENANT, whose boundary is tenantId in the service). Every other role gets an
   * array -- `[]` included, which the service applies as a filter matching no
   * rows rather than as an absent filter.
   */
  private scope(user: { id: string; role: string }) {
    return this.mallAccess.getAccessibleMallIds(user.id, user.role);
  }

  @Get()
  @ApiOperation({ summary: 'List sales turnover records' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.salesService.findAll(query, user, await this.scope(user));
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get sales summary for a period' })
  @ApiQuery({ name: 'period', required: true })
  async getSummary(@Query('period') period: string, @CurrentUser() user: any) {
    return this.salesService.getSummary(period, user, await this.scope(user));
  }

  @Get('top-tenants')
  @ApiOperation({ summary: 'Get top tenants by sales for a period (nội bộ — lộ tên/doanh thu tenant khác)' })
  @Roles(...MODULE_ROLES.salesStaff)
  @ApiQuery({ name: 'period', required: true })
  @ApiQuery({ name: 'limit', required: false })
  async getTopTenants(
    @CurrentUser() user: any,
    @Query('period') period: string,
    @Query('limit') limit?: number,
  ) {
    return this.salesService.getTopTenants(period, limit, await this.scope(user));
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
  async getDeadlineStatus(@Query('period') period: string, @CurrentUser() user: any) {
    return this.salesService.getDeadlineStatus(period, await this.scope(user));
  }

  @Get('submission-units')
  @ApiOperation({ summary: 'Get tenant-scoped units available for sales submission' })
  getSubmissionUnits(@CurrentUser() user: any) {
    return this.salesService.getSubmissionUnits(user);
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Get audit trail for a sales record' })
  @Roles(...MODULE_ROLES.salesStaff)
  async getAuditTrail(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { salesTurnoverId: id });
    return this.salesService.getAuditTrail(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a sales record' })
  @Roles(...MODULE_ROLES.salesStaff)
  async approveSales(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { salesTurnoverId: id });
    return this.salesService.approveSales(id, user.id);
  }

  @Post(':id/dispute')
  @ApiOperation({ summary: 'Dispute a sales record' })
  @Roles(...MODULE_ROLES.salesStaff)
  async disputeSales(@Param('id') id: string, @Body() dto: DisputeSalesDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { salesTurnoverId: id });
    return this.salesService.disputeSales(id, dto.reason, user.id);
  }
}
