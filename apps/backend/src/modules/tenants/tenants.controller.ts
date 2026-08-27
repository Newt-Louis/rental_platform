import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MallAccessService } from '../../common/services/mall-access.service';
import { Role } from '@prisma/client';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 1: descriptive only.
import { SetTenantPortalPasswordDto } from './dto/portal-password.dto';

const TENANT_MANAGE_ROLES = [Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR];

@ApiTags('Tenants')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.tenants)
@Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'tenant' }, status: EnforcementStatus.ENFORCED })
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService, private readonly mallAccess: MallAccessService) {}

  @Get()
  @ApiOperation({ summary: 'List tenants' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: PaginationDto & { category?: string; mallId?: string; tenancyStatus?: string; leaseTermType?: string }, @CurrentUser() user: any) {
    const requestedMallId = query.mallId ?? user.activeMallId ?? undefined;
    if (requestedMallId) await this.mallAccess.assertMallAccess(user.id, user.role, requestedMallId);
    const mallIds = requestedMallId
      ? [requestedMallId]
      : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.tenantsService.findAll({ ...query, mallIds: mallIds ?? undefined });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant details' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { tenantId: id });
    return this.tenantsService.findOne(id);
  }

  @Post()
  @Roles(...TENANT_MANAGE_ROLES)
  @ApiOperation({ summary: 'Create tenant' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Put(':id')
  @Roles(...TENANT_MANAGE_ROLES)
  @ApiOperation({ summary: 'Update tenant' })
  async update(@Param('id') id: string, @Body() dto: Partial<CreateTenantDto>, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { tenantId: id });
    return this.tenantsService.update(id, dto);
  }

  @Post(':id/portal/reset-password')
  @Roles(...TENANT_MANAGE_ROLES)
  @ApiOperation({ summary: 'Invalidate the current password and email a new portal activation link' })
  async resetPortalPassword(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { tenantId: id });
    return this.tenantsService.resetPortalPassword(id);
  }

  @Post(':id/portal/account')
  @Roles(...TENANT_MANAGE_ROLES)
  @ApiOperation({ summary: 'Create and invite a portal account for an existing tenant' })
  async createPortalAccount(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { tenantId: id });
    return this.tenantsService.createPortalAccount(id);
  }

  @Patch(':id/portal/password')
  @Roles(...TENANT_MANAGE_ROLES)
  @ApiOperation({ summary: 'Set a new password for the tenant portal account' })
  async setPortalPassword(@Param('id') id: string, @Body() dto: SetTenantPortalPasswordDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { tenantId: id });
    return this.tenantsService.setPortalPassword(id, dto.newPassword);
  }

  @Delete(':id')
  @Roles(...TENANT_MANAGE_ROLES)
  @ApiOperation({ summary: 'Delete tenant (soft delete)' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { tenantId: id });
    return this.tenantsService.remove(id);
  }
}
