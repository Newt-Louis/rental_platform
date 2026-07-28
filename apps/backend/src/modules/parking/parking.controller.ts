import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ParkingService } from './parking.service';
import { ParkingTransactionFilterDto } from './dto/parking-transaction-filter.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';

@ApiTags('Parking')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.parking)
@Controller('parking')
export class ParkingController {
  constructor(private readonly parkingService: ParkingService) {}

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

  @Post('transactions')
  @ApiOperation({ summary: 'Danh sách giao dịch bãi đỗ xe theo bộ lọc, phân trang' })
  transactions(@Body() filter: ParkingTransactionFilterDto) {
    return this.parkingService.getTransactions(filter);
  }

  @Post('transactions/export')
  @ApiOperation({ summary: 'Xuất Excel danh sách giao dịch bãi đỗ xe theo bộ lọc' })
  async exportTransactions(@Body() filter: ParkingTransactionFilterDto, @Res() res: Response) {
    const buffer = await this.parkingService.exportTransactions(filter);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ParkingHistory.xlsx"');
    res.send(buffer);
  }
}
