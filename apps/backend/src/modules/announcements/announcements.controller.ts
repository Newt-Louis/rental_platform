import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';
import { MallAccessService } from '../../common/services/mall-access.service';

// MALL-001 -- the tenant-viewer path was correctly Mall-scoped, but the STAFF
// path was not: findAllAdmin took no user at all, and findAll/findOne only ever
// checked TENANT. Proven at runtime 2026-09-07 -- a MALL_DIRECTOR holding Mall A
// read Mall B's announcements from all three. create/update/remove were already
// enforced (CR-101 Phase 3A) and are unchanged.
//
// All three read paths now derive the caller's Mall set server-side. A supplied
// `mallId` is validated by MallAccessGuard before the handler runs, so it can
// only narrow within that set.
@ApiTags('Announcements')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.announcements)
@Controller('announcements')
export class AnnouncementsController {
  constructor(
    private readonly service: AnnouncementsService,
    private readonly mallAccess: MallAccessService,
  ) {}

  /** The caller's own Mall set. `null` only for bypass roles; `[]` reaches nothing. */
  private scope(user: { id: string; role: string }) {
    return this.mallAccess.getAccessibleMallIds(user.id, user.role);
  }

  @Get()
  @ApiOperation({ summary: 'List published announcements (tenant view)' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED })
  async findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.service.findAll(query, user, await this.scope(user));
  }

  @Get('admin')
  @Roles(Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION, Role.LEASING_MANAGER)
  @ApiOperation({ summary: 'List all announcements (staff/admin view)' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'MALL-001 -- runtime-proven and closed 2026-09-07; was CONTRA-008 / AUTH-01' })
  async findAllAdmin(@Query() query: any, @CurrentUser() user: any) {
    return this.service.findAllAdmin(query, await this.scope(user));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get announcement details' })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findOneForUser(id, user, await this.scope(user));
  }

  @Post()
  @Roles(Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION, Role.LEASING_MANAGER)
  @ApiOperation({ summary: 'Create announcement' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'body', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async create(@Body() dto: any, @CurrentUser() user: any) {
    await this.mallAccess.assertMallAccess(user.id, user.role, dto.mallId);
    return this.service.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION, Role.LEASING_MANAGER)
  @ApiOperation({ summary: 'Update announcement' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'announcementMall' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { announcementId: id });
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION, Role.LEASING_MANAGER)
  @ApiOperation({ summary: 'Soft-delete announcement' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'announcementMall' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { announcementId: id });
    return this.service.remove(id);
  }
}
