import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
  UseInterceptors, UploadedFile, UploadedFiles,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { SpacesService, MergeUnitDto } from './spaces.service';
import { UnitMediaService } from './unit-media.service';
import { CreateMallDto } from './dto/create-mall.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MallAccessService } from '../../common/services/mall-access.service';
import { UnitStatus, UnitMediaType } from '@prisma/client';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 1: descriptive only. This controller carries the platform's
// most severe confirmed gap (P0-002, Unit CRUD) plus, newly found this session,
// a whole-Mall-level gap on updateMall/deleteMall/getMall. Media/History/
// Map-Position sub-sections are not individually re-annotated this pass (not
// independently re-verified) and inherit the class default -- flagged as a
// follow-up, not silently assumed safe.

@ApiTags('Spaces')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.spaces)
@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.GAP, trackedAs: 'class default; see method-level overrides below for verified sections' })
@Controller('spaces')
export class SpacesController {
  constructor(
    private readonly spacesService: SpacesService,
    private readonly unitMediaService: UnitMediaService,
    private readonly mallAccess: MallAccessService,
  ) {}

  // ─── Malls ────────────────────────────────────────────────────────────────

  @Get('malls')
  @ApiOperation({ summary: 'List all malls' })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED })
  async getMalls(@CurrentUser() user: any) {
    const mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.spacesService.getMalls(mallIds ?? undefined);
  }

  @Post('malls')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Create mall' })
  @Scope({ type: ScopeType.GLOBAL, globalReason: 'Creating a brand-new Mall has no existing Mall to scope against; whether non-ADMIN roles should be allowed to do this at all is a separate ROLE AUTH question, out of AUTH-01 scope' })
  createMall(@Body() dto: CreateMallDto) {
    return this.spacesService.createMall(dto);
  }

  @Post('malls/setup')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Create mall with floors and zones in one transaction' })
  @Scope({ type: ScopeType.GLOBAL, globalReason: 'Creating a brand-new Mall has no existing Mall to scope against' })
  setupMall(@Body() dto: any) {
    return this.spacesService.setupMall(dto);
  }

  @Get('malls/:id')
  @ApiOperation({ summary: 'Get mall by ID' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'param', key: 'id' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getMall(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.assertMallAccess(user.id, user.role, id);
    return this.spacesService.getMall(id);
  }

  @Patch('malls/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update mall' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'param', key: 'id' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async updateMall(@Param('id') id: string, @Body() dto: Partial<CreateMallDto>, @CurrentUser() user: any) {
    await this.mallAccess.assertMallAccess(user.id, user.role, id);
    return this.spacesService.updateMall(id, dto);
  }

  @Delete('malls/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Deactivate mall' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'param', key: 'id' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async deleteMall(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.assertMallAccess(user.id, user.role, id);
    return this.spacesService.deleteMall(id);
  }

  // ─── Floors ───────────────────────────────────────────────────────────────

  @Get('floors')
  @ApiOperation({ summary: 'List floors' })
  @ApiQuery({ name: 'mallId', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B -- explicit mallId is authorized; omitted mallId now falls back to the accessible-Mall set instead of returning every Floor platform-wide' })
  async getFloors(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const accessibleMallIds = mallId ? undefined : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.spacesService.getFloors(mallId, accessibleMallIds);
  }

  @Post('floors')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Create floor' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'body', key: 'mallId' }, status: EnforcementStatus.ENFORCED })
  createFloor(@Body() dto: { mallId: string; name: string; level: string; sortOrder?: number }) {
    return this.spacesService.createFloor(dto);
  }

  @Patch('floors/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update floor' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'floor' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async updateFloor(@Param('id') id: string, @Body() dto: { name?: string; level?: string; sortOrder?: number }, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { floorId: id });
    return this.spacesService.updateFloor(id, dto);
  }

  @Delete('floors/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Deactivate floor' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'floor' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async deleteFloor(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { floorId: id });
    return this.spacesService.deleteFloor(id);
  }

  // ─── Zones ────────────────────────────────────────────────────────────────

  @Get('zones')
  @ApiOperation({ summary: 'List zones' })
  @ApiQuery({ name: 'floorId', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getZones(@Query('floorId') floorId: string | undefined, @Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const accessibleMallIds = mallId ? undefined : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.spacesService.getZones(floorId, mallId, accessibleMallIds);
  }

  @Post('zones')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Create zone' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'body', key: 'mallId' }, status: EnforcementStatus.ENFORCED })
  createZone(@Body() dto: { mallId: string; floorId?: string; name: string; code?: string }) {
    return this.spacesService.createZone(dto);
  }

  @Patch('zones/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update zone' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'zone' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async updateZone(@Param('id') id: string, @Body() dto: { name?: string; code?: string; floorId?: string }, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { zoneId: id });
    return this.spacesService.updateZone(id, dto);
  }

  @Delete('zones/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Deactivate zone' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'zone' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async deleteZone(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { zoneId: id });
    return this.spacesService.deleteZone(id);
  }

  // ─── Units ────────────────────────────────────────────────────────────────

  @Get('units')
  @ApiOperation({ summary: 'List units with filters' })
  @ApiQuery({ name: 'floorId', required: false })
  @ApiQuery({ name: 'zoneId', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: UnitStatus })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'spaceType', required: false, description: 'GAP #4 — filter by space type' })
  @ApiQuery({ name: 'tier', required: false, description: 'GAP #6 — filter by tier (A/B/C)' })
  @ApiQuery({ name: 'leaseTermType', required: false, description: 'GAP #3 — filter by lease term type (LONG/SHORT)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B (P0-002)' })
  async getUnits(@Query() query: any, @CurrentUser() user: any) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const accessibleMallIds = query.mallId ? undefined : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.spacesService.getUnits(query, accessibleMallIds);
  }

  @Get('units/occupancy')
  @ApiOperation({ summary: 'Get occupancy summary stats' })
  @ApiQuery({ name: 'mallId', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getOccupancy(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const accessibleMallIds = mallId ? undefined : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.spacesService.getOccupancySummary(mallId, accessibleMallIds);
  }

  // ─── Static sub-routes must come BEFORE units/:id ───────────────────────

  @Get('units/stale-vacant')
  @ApiOperation({ summary: 'Get units that have been vacant for extended period' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'days', required: false, description: 'Days threshold (default 90)' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getStaleVacantUnits(
    @Query('mallId') mallId: string | undefined,
    @Query('days') days: string | undefined,
    @CurrentUser() user: any,
  ) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const accessibleMallIds = mallId ? undefined : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.spacesService.getStaleVacantUnits(mallId, days ? +days : undefined, accessibleMallIds);
  }

  @Get('units/expiring')
  @ApiOperation({ summary: 'Get units with leases expiring soon' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'days', required: false, description: 'Days ahead to look (default 90)' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getExpiringLeases(
    @Query('mallId') mallId: string | undefined,
    @Query('days') days: string | undefined,
    @CurrentUser() user: any,
  ) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const accessibleMallIds = mallId ? undefined : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.spacesService.getExpiringLeases(mallId, days ? +days : undefined, accessibleMallIds);
  }

  @Get('units/compare')
  @ApiOperation({ summary: 'Compare multiple units side by side (2-5 units)' })
  @ApiQuery({ name: 'ids', required: true, description: 'Comma-separated unit IDs' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'query', key: 'ids', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B -- one id per entry in the comma-separated list, accessible-set checked in service' })
  compareUnits(@Query('ids') ids: string, @CurrentUser() user: any) {
    const unitIds = ids.split(',').map((id) => id.trim()).filter(Boolean);
    return this.spacesService.compareUnits(unitIds, user);
  }

  @Get('units/search')
  @ApiOperation({ summary: 'Advanced unit search with multiple filters' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'floorId', required: false })
  @ApiQuery({ name: 'zoneId', required: false })
  @ApiQuery({ name: 'status', required: false, description: 'Single status or comma-separated' })
  @ApiQuery({ name: 'category', required: false, description: 'Single category or comma-separated' })
  @ApiQuery({ name: 'minArea', required: false })
  @ApiQuery({ name: 'maxArea', required: false })
  @ApiQuery({ name: 'minRent', required: false })
  @ApiQuery({ name: 'maxRent', required: false })
  @ApiQuery({ name: 'condition', required: false })
  @ApiQuery({ name: 'expiringWithin', required: false, description: 'Days until lease expires' })
  @ApiQuery({ name: 'vacantDays', required: false, description: 'Minimum days vacant' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['code', 'rent', 'area', 'leaseEnd', 'updated'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async searchUnits(@Query() query: any, @CurrentUser() user: any) {
    if (query.status && query.status.includes(',')) {
      query.status = query.status.split(',');
    }
    if (query.category && query.category.includes(',')) {
      query.category = query.category.split(',');
    }
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const accessibleMallIds = query.mallId ? undefined : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.spacesService.getUnitsAdvanced(query, accessibleMallIds);
  }

  // ─── GAP #2 — Merge / Split Units ────────────────────────────────────────

  @Post('units/merge')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({
    summary: 'GAP #2 — Gộp nhiều mặt bằng thành 1',
    description: 'Tạo unit tổng hợp C từ [A, B, ...]. Tất cả unit nguồn phải đang VACANT và cùng mall.',
  })
  @ApiBody({
    schema: {
      required: ['unitIds', 'code'],
      properties: {
        unitIds:         { type: 'array', items: { type: 'string' }, description: 'Ít nhất 2 unit IDs' },
        code:            { type: 'string', description: 'Mã unit tổng hợp mới (VD: A01+A02)' },
        name:            { type: 'string' },
        baseRentPerSqm:  { type: 'number' },
        camPerSqm:       { type: 'number' },
      },
    },
  })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'body', key: 'unitIds', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B -- one id per entry; service enforces all entries share one Mall before checking it' })
  mergeUnits(
    @Body() body: { unitIds: string[] } & MergeUnitDto,
    @CurrentUser() user: any,
  ) {
    const { unitIds, ...dto } = body;
    return this.spacesService.mergeUnits(unitIds, dto, user?.id, user);
  }

  @Post('units/:id/split')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({
    summary: 'GAP #2 — Tách mặt bằng tổng hợp về các unit gốc',
    description: 'Phục hồi các unit gốc về VACANT và vô hiệu hoá unit tổng hợp.',
  })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async splitUnit(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.spacesService.splitUnit(id, user?.id);
  }

  // ─── Parameterized routes below ──────────────────────────────────────────

  @Get('units/:id')
  @ApiOperation({ summary: 'Get unit by ID with tenant and lease info' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B (P0-002)' })
  async getUnit(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.spacesService.getUnit(id);
  }

  @Post('units')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Create unit' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'body', key: 'mallId' }, status: EnforcementStatus.ENFORCED })
  createUnit(@Body() dto: CreateUnitDto, @CurrentUser() user: any) {
    return this.spacesService.createUnit({ ...dto, mallId: dto.mallId ?? user.activeMallId });
  }

  @Patch('units/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update unit' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B (P0-002)' })
  async updateUnit(@Param('id') id: string, @Body() dto: UpdateUnitDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.spacesService.updateUnit(id, dto);
  }

  @Patch('units/:id/status')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update unit status' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B (P0-002)' })
  async updateUnitStatus(@Param('id') id: string, @Body('status') status: UnitStatus, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.spacesService.updateUnitStatus(id, status, user?.id);
  }

  @Delete('units/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Delete unit' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B (P0-002)' })
  async deleteUnit(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.spacesService.deleteUnit(id, user?.id);
  }

  // ─── Unit Media ───────────────────────────────────────────────────────────

  @Get('units/:id/media')
  @ApiOperation({ summary: 'Danh sách media của unit (ảnh, floor plan, video, brochure)' })
  @ApiQuery({ name: 'type', required: false, enum: UnitMediaType })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getUnitMedia(@Param('id') id: string, @Query('type') type: UnitMediaType | undefined, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.unitMediaService.getUnitMedia(id, type);
  }

  @Post('units/:id/media')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Upload media cho unit (ảnh, floor plan, video, brochure)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async uploadUnitMedia(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type?: UnitMediaType; caption?: string; isCover?: string },
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.unitMediaService.uploadMedia(
      id,
      file,
      { ...body, isCover: body.isCover === 'true' },
      user.id,
    );
  }

  @Patch('units/:id/media/:mediaId')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Cập nhật caption, thứ tự, hoặc đánh dấu cover' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async updateUnitMedia(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Body() body: { caption?: string; sortOrder?: number; isCover?: boolean },
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.unitMediaService.updateMedia(id, mediaId, body, user.id);
  }

  @Delete('units/:id/media/:mediaId')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Xóa media của unit' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async deleteUnitMedia(@Param('id') id: string, @Param('mediaId') mediaId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.unitMediaService.deleteMedia(id, mediaId);
  }

  // ─── Unit Import (Bulk Data Upload) ──────────────────────────────────────

  @Post('units/import')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({
    summary: 'Import dữ liệu unit hàng loạt từ CSV/JSON',
    description: 'Hỗ trợ tạo mới và cập nhật. Columns bắt buộc: code, areaGFA, areaNLA. Optional: name, category, baseRentPerSqm, camPerSqm, description',
  })
  @ApiQuery({ name: 'mallId', required: true })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async importUnits(
    @Query('mallId') mallId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    return this.unitMediaService.importUnits(mallId, file, user.id);
  }

  @Get('units/import/logs')
  @ApiOperation({ summary: 'Lịch sử import unit' })
  @ApiQuery({ name: 'mallId', required: true })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getImportLogs(@Query('mallId') mallId: string, @CurrentUser() user: any) {
    await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    return this.unitMediaService.getImportLogs(mallId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Unit History
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('units/:id/history')
  @ApiOperation({ summary: 'Get unit change history' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getUnitHistory(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.spacesService.getUnitHistory(id);
  }

  @Patch('units/:id/with-history')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update unit with history tracking' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async updateUnitWithHistory(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.spacesService.updateUnitWithHistory(id, dto, user?.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Analytics
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('analytics/rent')
  @ApiOperation({ summary: 'Rent analytics by floor and category' })
  @ApiQuery({ name: 'mallId', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getRentAnalytics(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    return this.spacesService.getRentAnalytics(mallId);
  }

  @Get('analytics/occupancy-trend')
  @ApiOperation({ summary: 'Historical occupancy trend' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'months', required: false, description: 'Number of months (default 12)' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getOccupancyTrend(
    @Query('mallId') mallId: string | undefined,
    @Query('months') months: string | undefined,
    @CurrentUser() user: any,
  ) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    return this.spacesService.getOccupancyTrend(mallId, months ? +months : undefined);
  }

  @Get('analytics/availability-calendar')
  @ApiOperation({ summary: 'Unit availability calendar/forecast' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'months', required: false, description: 'Months ahead to forecast (default 6)' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getAvailabilityCalendar(
    @Query('mallId') mallId: string | undefined,
    @Query('months') months: string | undefined,
    @CurrentUser() user: any,
  ) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    return this.spacesService.getAvailabilityCalendar(mallId, months ? +months : undefined);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Bulk Operations
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('units/bulk-update')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Bulk update multiple units' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'body', key: 'unitIds', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B (P0-002) -- one id per entry, accessible-set checked in service' })
  bulkUpdateUnits(
    @Body() body: { unitIds: string[]; updates: any },
    @CurrentUser() user: any,
  ) {
    return this.spacesService.bulkUpdateUnits(body.unitIds, body.updates, user?.id, user);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL MAP — Floor Plan Upload & Unit Positioning
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('floors/:id/map')
  @ApiOperation({ summary: 'Get floor map data: floor plan URL + all units with positions' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'floor' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async getFloorMapData(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { floorId: id });
    return this.spacesService.getFloorMapData(id);
  }

  @Post('floors/:id/floor-plan')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Upload floor plan image for a floor (JPG/PNG/WebP)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'floor' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async uploadFloorPlan(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { floorId: id });
    return this.spacesService.uploadFloorPlan(id, file);
  }

  @Delete('floors/:id/floor-plan')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Delete floor plan image' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'floor' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async deleteFloorPlan(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { floorId: id });
    return this.spacesService.deleteFloorPlan(id);
  }

  @Patch('floors/:id/map-positions')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Batch save unit positions on floor map (% coordinates)' })
  @Scope({
    type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'floor' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B.1 -- authorizes the floor here, AND (as of Phase 3B.1) SpacesService.saveMapPositions independently verifies every body.positions[].unitId belongs to this Floor and Mall before writing (INV-SPACE-MAP-001/002)',
  })
  async saveMapPositions(
    @Param('id') id: string,
    @Body() body: { positions: Array<{ unitId: string; polygon?: number[][]; x?: number; y?: number; w?: number; h?: number }> },
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { floorId: id });
    return this.spacesService.saveMapPositions(id, body.positions);
  }

  @Patch('units/:id/map-position')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update a single unit map position on floor plan' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async updateUnitMapPosition(
    @Param('id') id: string,
    @Body() body: { polygon?: number[][] | null; x?: number | null; y?: number | null; w?: number | null; h?: number | null },
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.spacesService.updateUnitMapPosition(id, body);
  }

  @Delete('units/:id/map-position')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Remove unit from floor map (clear position)' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B' })
  async clearUnitMapPosition(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: id });
    return this.spacesService.clearUnitMapPosition(id);
  }
}
