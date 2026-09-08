import { Controller, Get, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionsService } from '../../common/services/permissions.service';
import { UpdateModulePermissionDto } from './dto/update-module-permission.dto';

@ApiTags('Permissions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get('effective')
  @ApiOperation({ summary: "Modules the caller's role can access, optionally scoped to a Mall" })
  @ApiQuery({ name: 'mallId', required: false })
  async getEffective(@CurrentUser() user: any, @Query('mallId') mallId?: string) {
    const modules = await this.permissions.getEffectiveModules(user.role, mallId);
    return { modules };
  }

  @Get('matrix')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Full role x module permission matrix for the admin UI, optionally scoped to a Mall' })
  @ApiQuery({ name: 'mallId', required: false, description: 'Omit for the Global default template' })
  getMatrix(@Query('mallId') mallId?: string) {
    return this.permissions.getMatrix(mallId);
  }

  @Patch('matrix')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Allow/deny one role for one module, optionally scoped to a Mall (omit mallId to edit the Global template)' })
  async updateMatrix(@Body() dto: UpdateModulePermissionDto, @CurrentUser() user: any) {
    await this.permissions.setAllowed(dto.module, dto.role, dto.allowed, user.id, dto.mallId);
    return { success: true };
  }
}
