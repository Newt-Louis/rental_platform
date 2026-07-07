import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { Role } from '@prisma/client';

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.reports)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('occupancy')
  @ApiOperation({ summary: 'Occupancy report by floor and status' })
  @ApiQuery({ name: 'mallId', required: false })
  occupancy(@Query('mallId') mallId?: string) {
    return this.reportsService.occupancyReport(mallId);
  }

  @Get('pipeline')
  @ApiOperation({ summary: 'Pipeline report: leads and proposals' })
  pipeline() {
    return this.reportsService.pipelineReport();
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue report by period' })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  revenue(@Query() params: any) {
    return this.reportsService.revenueReport(params);
  }

  @Get('contract-expiry')
  @ApiOperation({ summary: 'Contracts expiring within N days' })
  @ApiQuery({ name: 'days', required: false })
  contractExpiry(@Query() params: any) {
    return this.reportsService.contractExpiryReport(params);
  }

  @Get('tenant-sales')
  @ApiOperation({ summary: 'Tenant sales report for a period' })
  @ApiQuery({ name: 'period', required: true })
  tenantSales(@Query() params: any) {
    return this.reportsService.tenantSalesReport(params);
  }

  @Get('revenue-receivables')
  @ApiOperation({ summary: 'Doanh thu & công nợ chi tiết theo năm (thay P&L — không có dữ liệu chi phí để tính lãi/lỗ thật)' })
  @ApiQuery({ name: 'year', required: false })
  revenueReceivables(@Query() params: any) {
    return this.reportsService.revenueReceivablesReport(params);
  }

  @Get('ar-aging')
  @ApiOperation({ summary: 'Công nợ theo tuổi nợ (dùng lại logic Billing)' })
  // Cùng dữ liệu với /billing/ar-aging — giữ đúng mức hạn chế đó (không thêm LEASING_MANAGER
  // qua đường Reports) thay vì kế thừa MODULE_ROLES.reports rộng hơn.
  @Roles(...MODULE_ROLES.billingStaff, Role.CEO)
  arAging() {
    return this.reportsService.arAgingReport();
  }

  @Get('compliance')
  @ApiOperation({ summary: 'Báo cáo tuân thủ tổng hợp từ Nhật ký hệ thống' })
  // Trả về cả các dòng nhật ký lỗi thô — giữ đúng mức hạn chế ADMIN/CEO như màn Nhật ký hệ thống
  // (Phase 1), KHÔNG dùng MODULE_ROLES.reports rộng hơn ở class-level.
  @Roles(...MODULE_ROLES.auditLog)
  @ApiQuery({ name: 'dateFrom', required: false })
  compliance(@Query('dateFrom') dateFrom?: string) {
    return this.reportsService.complianceReport({ dateFrom });
  }

  @Get('export/:type')
  @ApiOperation({ summary: 'Export report as CSV (type: revenue | occupancy | expiry | pipeline)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async exportCsv(@Param('type') type: string, @Query() query: any, @Res() res: Response) {
    const csv = await this.reportsService.exportCsv(type, query.from, query.to);
    const filename = `report_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv);
  }
}
