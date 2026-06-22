import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

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
  findAll(@Query() query: any) {
    return this.salesService.findAll(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get sales summary for a period' })
  @ApiQuery({ name: 'period', required: true })
  getSummary(@Query('period') period: string) {
    return this.salesService.getSummary(period);
  }

  @Get('top-tenants')
  @ApiOperation({ summary: 'Get top tenants by sales for a period' })
  @ApiQuery({ name: 'period', required: true })
  @ApiQuery({ name: 'limit', required: false })
  getTopTenants(@Query('period') period: string, @Query('limit') limit?: number) {
    return this.salesService.getTopTenants(period, limit);
  }

  @Post()
  @ApiOperation({ summary: 'Record sales turnover (upsert by period)' })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.salesService.create(dto, user.id);
  }

  @Get('deadline')
  @ApiOperation({ summary: 'Get submission deadline status for a period' })
  @ApiQuery({ name: 'period', required: true })
  getDeadlineStatus(@Query('period') period: string) {
    return this.salesService.getDeadlineStatus(period);
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Get audit trail for a sales record' })
  getAuditTrail(@Param('id') id: string) {
    return this.salesService.getAuditTrail(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a sales record' })
  approveSales(@Param('id') id: string, @CurrentUser() user: any) {
    return this.salesService.approveSales(id, user.id);
  }

  @Post(':id/dispute')
  @ApiOperation({ summary: 'Dispute a sales record' })
  disputeSales(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: any) {
    return this.salesService.disputeSales(id, reason, user.id);
  }
}
