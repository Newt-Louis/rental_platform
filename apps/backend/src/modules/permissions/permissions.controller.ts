import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserPermissionDto } from './dto/update-user-permission.dto';
import { UpdateRolePermissionsBatchDto, UpdateUserPermissionsBatchDto } from './dto/batch-permission.dto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionsService } from '../../common/services/permissions.service';
import { UpdateModulePermissionDto } from './dto/update-module-permission.dto';
import { ResetModulePermissionsDto } from './dto/reset-module-permissions.dto';

@ApiTags('Permissions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('effective')
  @ApiOperation({ summary: "Modules the caller's role can access, optionally scoped to a Mall" })
  @ApiQuery({ name: 'mallId', required: false })
  async getEffective(@CurrentUser() user: any, @Query('mallId') mallId?: string) {
    const modules = await this.permissions.getEffectiveModules(user.role, mallId);
    return { modules };
  }

  @Get('effective-actions')
  @ApiOperation({ summary: "Caller's View/Create/Update/Delete rights per module (role matrix + the user's own overrides)" })
  @ApiQuery({ name: 'mallId', required: false })
  getEffectiveActions(@CurrentUser() user: any, @Query('mallId') mallId?: string) {
    return this.permissions.getEffectiveActions({ id: user.id, role: user.role }, mallId);
  }

  @Get('users/:userId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "One user's own overrides plus their effective rights, optionally scoped to a Mall" })
  @ApiQuery({ name: 'mallId', required: false })
  async getUserPermissions(@Param('userId') userId: string, @Query('mallId') mallId?: string) {
    const user = await this.findOverridableUser(userId);
    const [overrides, effective] = await Promise.all([
      this.permissions.getUserOverrides(userId, mallId),
      this.permissions.getEffectiveActions({ id: user.id, role: user.role }, mallId),
    ]);
    return { role: user.role, overrides, effective };
  }

  @Patch('users/:userId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Grant (true), deny (false) or inherit (null) one right for one user' })
  async updateUserPermission(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserPermissionDto,
    @CurrentUser() actor: any,
  ) {
    await this.findOverridableUser(userId);
    await this.permissions.setUserOverride(userId, dto.module, dto.action, dto.value ?? null, actor.id, dto.mallId);
    return { success: true };
  }

  @Patch('users/:userId/batch')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Save many module overrides for one user at once (true/false/null per right)' })
  async updateUserPermissionsBatch(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserPermissionsBatchDto,
    @CurrentUser() actor: any,
  ) {
    await this.findOverridableUser(userId);
    await this.permissions.setUserRights(
      userId,
      dto.changes.map(({ module, ...flags }) => ({ module, flags })),
      actor.id,
      dto.mallId,
    );
    return { success: true };
  }

  @Delete('users/:userId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Remove every override of one user in a scope so they fully inherit their role again" })
  @ApiQuery({ name: 'mallId', required: false })
  async clearUserPermissions(@Param('userId') userId: string, @Query('mallId') mallId?: string) {
    await this.permissions.clearUserOverrides(userId, mallId);
    return { success: true };
  }

  /** ADMIN already bypasses every guard and TENANT is outside the staff matrix, so neither can carry overrides. */
  private async findOverridableUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === Role.ADMIN || user.role === Role.TENANT) {
      throw new BadRequestException('ADMIN and TENANT accounts cannot have per-user permission overrides');
    }
    return user;
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
    await this.permissions.setAllowed(dto.module, dto.role, dto.allowed, user.id, dto.mallId, dto.action);
    return { success: true };
  }

  @Patch('matrix/batch')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Save many module rights (view/create/update/delete) for one role at once, optionally scoped to a Mall' })
  async updateMatrixBatch(@Body() dto: UpdateRolePermissionsBatchDto, @CurrentUser() user: any) {
    await this.permissions.setRoleRights(
      dto.role,
      dto.changes.map(({ module, ...flags }) => ({ module, flags })),
      user.id,
      dto.mallId,
    );
    return { success: true };
  }

  @Post('matrix/reset')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reset one scope (a Mall, or Global when mallId is omitted) back to the shipped default permissions, discarding any admin customization there' })
  async resetMatrix(@Body() dto: ResetModulePermissionsDto) {
    await this.permissions.resetToDefault(dto.mallId);
    return { success: true };
  }
}
