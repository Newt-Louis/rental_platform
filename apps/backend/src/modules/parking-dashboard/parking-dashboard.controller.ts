import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ParkingDashboardService } from './parking-dashboard.service';
import {
  ParkingDailyChartFilterDto,
  ParkingMonthlyChartFilterDto,
  ParkingMonthlySummaryFilterDto,
  ParkingTransactionExportFilterDto,
  ParkingTransactionFilterDto,
  ParkingTransactionFilterV2Dto,
  ParkingTransactionImageQueryDto,
  ParkingVoucherTypesQueryDto,
  ParkingYearlyChartFilterDto,
} from './dto/parking-transaction-filter.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleRoles } from '../../common/decorators/module-roles.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 1: descriptive only. Keyed by parkingCode with no mallId mapping
// -- schema-dependent, blocked on BC-008, not pure wiring.

@ApiTags('Parking')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@ModuleRoles('parking')
@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.PENDING_BUSINESS_CONFIRMATION, trackedAs: 'BC-008' })
@Controller('parking-dashboard')
export class ParkingDashboardController {
  constructor(private readonly parkingService: ParkingDashboardService) {}

  @Get('monthly-summary')
  @ApiOperation({ summary: 'Doanh thu & lượt xe tháng này / tháng trước (theo tháng dương lịch)' })
  @ApiQuery({ name: 'parkingCodes', required: true, description: 'Một hoặc nhiều mã bãi, phân tách bằng dấu phẩy' })
  monthlySummary(@Query() filter: ParkingMonthlySummaryFilterDto) {
    return this.parkingService.getMonthlySummary(filter.parkingCodes);
  }

  @Get('revenue-vehicle-chart-by-month')
  @ApiOperation({ summary: 'Doanh thu & lượt xe theo tháng trong một năm' })
  revenueVehicleChartByMonth(@Query() filter: ParkingMonthlyChartFilterDto) {
    return this.parkingService.getRevenueVehicleChartByMonth(filter.parkingCodes, filter.year);
  }

  @Get('revenue-vehicle-chart-by-day')
  @ApiOperation({ summary: 'Doanh thu & lượt xe theo ngày trong một tháng' })
  revenueVehicleChartByDay(@Query() filter: ParkingDailyChartFilterDto) {
    return this.parkingService.getRevenueVehicleChartByDay(filter.parkingCodes, filter.year, filter.month);
  }

  @Get('revenue-vehicle-chart-by-year')
  @ApiOperation({ summary: 'Doanh thu & lượt xe theo năm, trong một khoảng năm' })
  revenueVehicleChartByYear(@Query() filter: ParkingYearlyChartFilterDto) {
    return this.parkingService.getRevenueVehicleChartByYear(filter.parkingCodes, filter.fromYear, filter.toYear);
  }

  @Get('tenants')
  @ApiOperation({ summary: 'Danh sách bãi đỗ xe (tenant)' })
  getTenants() {
    return this.parkingService.getTenants();
  }

  @Get('voucher-types')
  @ApiOperation({ summary: 'Danh sách loại voucher (voucher_type_name) của bãi đỗ xe' })
  voucherTypes(@Query() q: ParkingVoucherTypesQueryDto) {
    return this.parkingService.getVoucherTypeNames(q.parkingCode);
  }

  @Post('transactions')
  @ApiOperation({ summary: 'Danh sách giao dịch bãi đỗ xe theo bộ lọc, phân trang' })
  transactions(@Body() filter: ParkingTransactionFilterDto) {
    return this.parkingService.getTransactions(filter);
  }

  @Post('transactions/v2')
  @ApiOperation({ summary: 'Danh sách giao dịch bãi đỗ xe theo bộ lọc, phân trang theo trang (page/total)' })
  transactionsV2(@Body() filter: ParkingTransactionFilterV2Dto) {
    return this.parkingService.getTransactionsV2(filter);
  }

  @Get('transactions/image')
  @ApiOperation({ summary: 'Ảnh giao dịch bãi đỗ xe — server tải từ image server và trả về (ẩn địa chỉ nguồn)' })
  async transactionImage(@Query() q: ParkingTransactionImageQueryDto, @Res() res: Response) {
    const img = await this.parkingService.getTransactionImage(q.parkingCode, q.sessionId, q.direction, q.view ?? 'plate');
    res.set({ 'Content-Type': img.contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.send(img.buffer);
  }

  @Post('transactions/export')
  @ApiOperation({ summary: 'Xuất Excel danh sách giao dịch bãi đỗ xe theo bộ lọc' })
  async exportTransactions(@Body() filter: ParkingTransactionExportFilterDto, @Res() res: Response) {
    // Streamed by the service (sets headers itself after validation, so an error still
    // produces a normal JSON response instead of a half-started xlsx download).
    await this.parkingService.exportTransactions(filter, res);
  }
}
