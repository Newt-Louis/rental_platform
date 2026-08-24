import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ParkingDashboardService } from './parking-dashboard.service';
import {
  ParkingDashboardKpiFilterDto,
  ParkingTransactionExportFilterDto,
  ParkingTransactionFilterDto,
  ParkingTransactionFilterV2Dto,
} from './dto/parking-transaction-filter.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 1: descriptive only. Keyed by parkingCode with no mallId mapping
// -- schema-dependent, blocked on BC-008, not pure wiring.

@ApiTags('Parking')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.parking)
@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.PENDING_BUSINESS_CONFIRMATION, trackedAs: 'BC-008' })
@Controller('parking-dashboard')
export class ParkingDashboardController {
  constructor(private readonly parkingService: ParkingDashboardService) {}

  @Get('revenue-report')
  @ApiOperation({ summary: 'KPI doanh thu bãi đỗ xe hôm nay / tháng trước' })
  @ApiQuery({ name: 'parkingCode', required: true })
  revenueReport(@Query('parkingCode') parkingCode: string) {
    return this.parkingService.getRevenueReport(parkingCode);
  }

  @Get('transaction-chart')
  @ApiOperation({ summary: 'Biểu đồ số lượt giao dịch theo ngày' })
  @ApiQuery({ name: 'parkingCode', required: true })
  @ApiQuery({ name: 'startTime', required: true })
  @ApiQuery({ name: 'finishTime', required: true })
  transactionChart(
    @Query('parkingCode') parkingCode: string,
    @Query('startTime') startTime: string,
    @Query('finishTime') finishTime: string,
  ) {
    return this.parkingService.getTransactionChart(parkingCode, startTime, finishTime);
  }

  @Get('revenue-chart')
  @ApiOperation({ summary: 'Biểu đồ doanh thu theo ngày' })
  @ApiQuery({ name: 'parkingCode', required: true })
  @ApiQuery({ name: 'startTime', required: true })
  @ApiQuery({ name: 'finishTime', required: true })
  revenueChart(
    @Query('parkingCode') parkingCode: string,
    @Query('startTime') startTime: string,
    @Query('finishTime') finishTime: string,
  ) {
    return this.parkingService.getRevenueChart(parkingCode, startTime, finishTime);
  }

  @Get('revenue-chart-by-year')
  @ApiOperation({ summary: 'Biểu đồ doanh thu theo tháng trong năm' })
  @ApiQuery({ name: 'parkingCode', required: true })
  @ApiQuery({ name: 'year', required: true })
  revenueChartByYear(@Query('parkingCode') parkingCode: string, @Query('year') year: string) {
    return this.parkingService.getRevenueChartByYear(parkingCode, Number(year));
  }

  @Get('payment-breakdown')
  @ApiOperation({ summary: 'Tổng tiền mặt / chuyển khoản / khuyến mãi (coupon, hóa đơn)' })
  @ApiQuery({ name: 'parkingCode', required: true })
  @ApiQuery({ name: 'startTime', required: true })
  @ApiQuery({ name: 'finishTime', required: true })
  paymentBreakdown(
    @Query('parkingCode') parkingCode: string,
    @Query('startTime') startTime: string,
    @Query('finishTime') finishTime: string,
  ) {
    return this.parkingService.getPaymentBreakdown(parkingCode, startTime, finishTime);
  }

  @Get('tenants')
  @ApiOperation({ summary: 'Danh sách bãi đỗ xe (tenant)' })
  getTenants() {
    return this.parkingService.getTenants();
  }

  @Get('kpi-summary')
  @ApiOperation({ summary: 'KPI tổng quan bãi đỗ xe (doanh thu, chỗ đang đỗ, giao dịch, khuyến mãi, thời gian đỗ)' })
  kpiSummary(@Query() filter: ParkingDashboardKpiFilterDto) {
    return this.parkingService.getKpiSummary(filter);
  }

  @Get('revenue-volume-chart')
  @ApiOperation({ summary: 'Biểu đồ doanh thu và lượt xe theo thời gian' })
  revenueVolumeChart(@Query() filter: ParkingDashboardKpiFilterDto) {
    return this.parkingService.getRevenueVolumeChart(filter);
  }

  @Get('revenue-split-chart')
  @ApiOperation({ summary: 'Biểu đồ doanh thu theo loại xe / loại thẻ' })
  @ApiQuery({ name: 'dimension', required: false, enum: ['vehicle_type_name', 'card_type_name'] })
  revenueSplitChart(
    @Query() filter: ParkingDashboardKpiFilterDto,
    @Query('dimension') dimension?: 'vehicle_type_name' | 'card_type_name',
  ) {
    return this.parkingService.getRevenueSplitChart(filter, dimension === 'card_type_name' ? 'card_type_name' : 'vehicle_type_name');
  }

  @Get('inflow-outflow-chart')
  @ApiOperation({ summary: 'Biểu đồ lượt vào/ra theo giờ trong ngày' })
  inflowOutflowChart(@Query() filter: ParkingDashboardKpiFilterDto) {
    return this.parkingService.getInflowOutflowChart(filter);
  }

  @Get('promotion-utilization-chart')
  @ApiOperation({ summary: 'Biểu đồ sử dụng khuyến mãi/voucher' })
  promotionUtilizationChart(@Query() filter: ParkingDashboardKpiFilterDto) {
    return this.parkingService.getPromotionUtilizationChart(filter);
  }

  @Post('transactions')
  @ApiOperation({ summary: 'Danh sách giao dịch bãi đỗ xe theo bộ lọc, phân trang' })
  transactions(@Body() filter: ParkingTransactionFilterDto) {
    return this.parkingService.getTransactions(filter);
  }

  @Post('transactions/v2')
  @ApiOperation({ summary: 'Danh sách giao dịch bãi đỗ xe theo bộ lọc, phân trang kiểu keyset/cursor' })
  transactionsV2(@Body() filter: ParkingTransactionFilterV2Dto) {
    return this.parkingService.getTransactionsV2(filter);
  }

  @Post('transactions/export')
  @ApiOperation({ summary: 'Xuất Excel danh sách giao dịch bãi đỗ xe theo bộ lọc' })
  async exportTransactions(@Body() filter: ParkingTransactionExportFilterDto, @Res() res: Response) {
    const buffer = await this.parkingService.exportTransactions(filter);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ParkingHistory.xlsx"');
    res.send(buffer);
  }
}
