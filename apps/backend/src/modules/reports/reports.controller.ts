import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { MallAccessService } from '../../common/services/mall-access.service';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 3G (BC-013): every route below now resolves its Mall scope via
// MallAccessService instead of trusting/ignoring a raw mallId. Policy: normal
// staff/MALL_DIRECTOR get their own UserMallAccess-derived set; CEO gets
// unrestricted (crossMallRead, per BC-CEO-SCOPE Option A); ADMIN unrestricted
// (bypass). No route may treat a missing mallId as "show everything" for a
// non-privileged caller -- that was the CONTRA-008/AUTH-01 gap this closes.

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.reports)
@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3G (BC-013)' })
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly mallAccess: MallAccessService,
  ) {}

  /** Resolves the caller's Mall scope for a report: an explicit mallId (validated
   * against the caller's own access), or the caller's full accessible set
   * (null = unrestricted, for ADMIN/CEO). */
  private async scope(user: any, mallId?: string): Promise<string[] | null> {
    if (mallId) {
      await this.mallAccess.assertMallAccess(user.id, user.role, mallId, { crossMallRead: true });
      return [mallId];
    }
    return this.mallAccess.getAccessibleMallIds(user.id, user.role, { crossMallRead: true });
  }

  @Get('occupancy')
  @ApiOperation({ summary: 'Occupancy report by floor and status' })
  @ApiQuery({ name: 'mallId', required: false })
  async occupancy(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    return this.reportsService.occupancyReport(mallId, await this.scope(user, mallId));
  }

  @Get('pipeline')
  @ApiOperation({ summary: 'Pipeline report: leads and proposals' })
  async pipeline(@CurrentUser() user: any) {
    return this.reportsService.pipelineReport(await this.scope(user));
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue report by period' })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  async revenue(@Query() params: any, @CurrentUser() user: any) {
    return this.reportsService.revenueReport(params, await this.scope(user, params.mallId));
  }

  @Get('contract-expiry')
  @ApiOperation({ summary: 'Contracts expiring within N days' })
  @ApiQuery({ name: 'days', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  async contractExpiry(@Query() params: any, @CurrentUser() user: any) {
    return this.reportsService.contractExpiryReport(params, await this.scope(user, params.mallId));
  }

  @Get('tenant-sales')
  @ApiOperation({ summary: 'Tenant sales report for a period' })
  @ApiQuery({ name: 'period', required: true })
  @ApiQuery({ name: 'mallId', required: false })
  async tenantSales(@Query() params: any, @CurrentUser() user: any) {
    return this.reportsService.tenantSalesReport(params, await this.scope(user, params.mallId));
  }

  @Get('revenue-receivables')
  @ApiOperation({ summary: 'Doanh thu & công nợ chi tiết theo năm (thay P&L — không có dữ liệu chi phí để tính lãi/lỗ thật)' })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  async revenueReceivables(@Query() params: any, @CurrentUser() user: any) {
    return this.reportsService.revenueReceivablesReport(params, await this.scope(user, params.mallId));
  }

  @Get('ar-aging')
  @ApiOperation({ summary: 'Công nợ theo tuổi nợ (dùng lại logic Billing)' })
  // Cùng dữ liệu với /billing/ar-aging — giữ đúng mức hạn chế đó (không thêm LEASING_MANAGER
  // qua đường Reports) thay vì kế thừa MODULE_ROLES.reports rộng hơn.
  @Roles(...MODULE_ROLES.billingStaff, Role.CEO)
  async arAging(@CurrentUser() user: any) {
    return this.reportsService.arAgingReport(await this.scope(user));
  }

  @Get('compliance')
  @ApiOperation({ summary: 'Báo cáo tuân thủ tổng hợp từ Nhật ký hệ thống' })
  // Trả về cả các dòng nhật ký lỗi thô — giữ đúng mức hạn chế ADMIN/CEO như màn Nhật ký hệ thống
  // (Phase 1), KHÔNG dùng MODULE_ROLES.reports rộng hơn ở class-level. Both roles reachable here
  // (ADMIN, CEO) are unrestricted under the approved Mall policy, so no Mall filter is needed.
  @Roles(...MODULE_ROLES.auditLog)
  @ApiQuery({ name: 'dateFrom', required: false })
  compliance(@Query('dateFrom') dateFrom?: string) {
    return this.reportsService.complianceReport({ dateFrom });
  }

  @Get('export/:type')
  @ApiOperation({ summary: 'Export report as CSV (type: revenue | occupancy | expiry | pipeline)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  async exportCsv(@Param('type') type: string, @Query() query: any, @CurrentUser() user: any, @Res() res: Response) {
    const exported = await this.reportsService.exportCsv(type, query.from, query.to, await this.scope(user, query.mallId));
    const filename = `report_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Export-Row-Count', exported.rowCount.toString());
    res.setHeader('X-Export-Limit', exported.limit.toString());
    res.setHeader('X-Export-Truncated', exported.truncated.toString());
    res.send('﻿' + exported.csv);
  }
}
