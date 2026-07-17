import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateSalesDto, DisputeSalesDto } from './dto/sales.dto';

@ApiTags('Sales Turnover')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.sales)
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
