import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Patch,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, CreateCustomerActivityDto } from './dto/create-customer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CustomerStatus } from '@prisma/client';

@ApiTags('Customers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.crm)
@Controller('crm/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List customers with filters and pagination' })
  @ApiQuery({ name: 'status', required: false, enum: CustomerStatus })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any) {
    return this.customersService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get customer statistics by status' })
  getStats() {
    return this.customersService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer detail with activities and leads' })
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new customer (auto-generates customer code KH-YYYY-NNNNN)' })
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: any) {
    return this.customersService.create(dto, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update customer info or status' })
  update(@Param('id') id: string, @Body() dto: any) {
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete customer' })
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }

  @Post(':id/activities')
  @ApiOperation({ summary: 'Add activity to customer timeline' })
  addActivity(
    @Param('id') id: string,
    @Body() dto: CreateCustomerActivityDto,
    @CurrentUser() user: any,
  ) {
    return this.customersService.addActivity(id, dto as any, user.id);
  }

  @Patch(':id/link-tenant')
  @ApiOperation({ summary: 'Link customer to a tenant (mark as ACTIVE)' })
  linkTenant(@Param('id') id: string, @Body('tenantId') tenantId: string) {
    return this.customersService.linkTenant(id, tenantId);
  }
}
