import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ParkingDashboardService } from './parking-dashboard.service';
import {
  ParkingMonthlyChartFilterDto,
  ParkingMonthlySummaryFilterDto,
  ParkingTransactionExportFilterDto,
  ParkingTransactionFilterDto,
  ParkingTransactionFilterV2Dto,
  ParkingYearlyChartFilterDto,
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

  @Get('monthly-summary')
  @ApiOperation({ summary: 'Doanh thu & lượt xe tháng này / tháng trước (theo tháng dương lịch)' })
  @ApiQuery({ name: 'parkingCode', required: true })
  monthlySummary(@Query() filter: ParkingMonthlySummaryFilterDto) {
    return this.parkingService.getMonthlySummary(filter.parkingCode);
  }

  @Get('revenue-vehicle-chart-by-month')
  @ApiOperation({ summary: 'Doanh thu & lượt xe theo tháng trong một năm' })
  revenueVehicleChartByMonth(@Query() filter: ParkingMonthlyChartFilterDto) {
    return this.parkingService.getRevenueVehicleChartByMonth(filter.parkingCode, filter.year);
  }

  @Get('revenue-vehicle-chart-by-year')
  @ApiOperation({ summary: 'Doanh thu & lượt xe theo năm, trong một khoảng năm' })
  revenueVehicleChartByYear(@Query() filter: ParkingYearlyChartFilterDto) {
    return this.parkingService.getRevenueVehicleChartByYear(filter.parkingCode, filter.fromYear, filter.toYear);
  }

  @Get('tenants')
  @ApiOperation({ summary: 'Danh sách bãi đỗ xe (tenant)' })
  getTenants() {
    return this.parkingService.getTenants();
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
    // Streamed by the service (sets headers itself after validation, so an error still
    // produces a normal JSON response instead of a half-started xlsx download).
    await this.parkingService.exportTransactions(filter, res);
  }
}
