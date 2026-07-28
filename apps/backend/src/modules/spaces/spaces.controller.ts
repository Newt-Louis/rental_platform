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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UnitStatus, UnitMediaType } from '@prisma/client';

@ApiTags('Spaces')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.spaces)
@Controller('spaces')
export class SpacesController {
  constructor(
    private readonly spacesService: SpacesService,
    private readonly unitMediaService: UnitMediaService,
  ) {}

  // ─── Malls ────────────────────────────────────────────────────────────────

  @Get('malls')
  @ApiOperation({ summary: 'List all malls' })
  getMalls() {
    return this.spacesService.getMalls();
  }

  @Post('malls')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Create mall' })
  createMall(@Body() dto: CreateMallDto) {
    return this.spacesService.createMall(dto);
  }

  @Post('malls/setup')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Create mall with floors and zones in one transaction' })
  setupMall(@Body() dto: any) {
    return this.spacesService.setupMall(dto);
  }

  @Get('malls/:id')
  @ApiOperation({ summary: 'Get mall by ID' })
  getMall(@Param('id') id: string) {
    return this.spacesService.getMall(id);
  }

  @Patch('malls/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update mall' })
  updateMall(@Param('id') id: string, @Body() dto: Partial<CreateMallDto>) {
    return this.spacesService.updateMall(id, dto);
  }

  @Delete('malls/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Deactivate mall' })
  deleteMall(@Param('id') id: string) {
    return this.spacesService.deleteMall(id);
  }

  // ─── Floors ───────────────────────────────────────────────────────────────

  @Get('floors')
  @ApiOperation({ summary: 'List floors' })
  @ApiQuery({ name: 'mallId', required: false })
  getFloors(@Query('mallId') mallId?: string) {
    return this.spacesService.getFloors(mallId);
  }

  @Post('floors')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Create floor' })
  createFloor(@Body() dto: { mallId: string; name: string; level: string; sortOrder?: number }) {
    return this.spacesService.createFloor(dto);
  }

  @Patch('floors/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update floor' })
  updateFloor(@Param('id') id: string, @Body() dto: { name?: string; level?: string; sortOrder?: number }) {
    return this.spacesService.updateFloor(id, dto);
  }

  @Delete('floors/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Deactivate floor' })
  deleteFloor(@Param('id') id: string) {
    return this.spacesService.deleteFloor(id);
  }

  // ─── Zones ────────────────────────────────────────────────────────────────

  @Get('zones')
  @ApiOperation({ summary: 'List zones' })
  @ApiQuery({ name: 'floorId', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  getZones(@Query('floorId') floorId?: string, @Query('mallId') mallId?: string) {
    return this.spacesService.getZones(floorId, mallId);
  }

  @Post('zones')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Create zone' })
  createZone(@Body() dto: { mallId: string; floorId?: string; name: string; code?: string }) {
    return this.spacesService.createZone(dto);
  }

  @Patch('zones/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update zone' })
  updateZone(@Param('id') id: string, @Body() dto: { name?: string; code?: string; floorId?: string }) {
    return this.spacesService.updateZone(id, dto);
  }

  @Delete('zones/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Deactivate zone' })
  deleteZone(@Param('id') id: string) {
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
  getUnits(@Query() query: any) {
    return this.spacesService.getUnits(query);
  }

  @Get('units/occupancy')
  @ApiOperation({ summary: 'Get occupancy summary stats' })
  @ApiQuery({ name: 'mallId', required: false })
  getOccupancy(@Query('mallId') mallId?: string) {
    return this.spacesService.getOccupancySummary(mallId);
  }

  // ─── Static sub-routes must come BEFORE units/:id ───────────────────────

  @Get('units/stale-vacant')
  @ApiOperation({ summary: 'Get units that have been vacant for extended period' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'days', required: false, description: 'Days threshold (default 90)' })
  getStaleVacantUnits(
    @Query('mallId') mallId?: string,
    @Query('days') days?: string,
  ) {
    return this.spacesService.getStaleVacantUnits(mallId, days ? +days : undefined);
  }

  @Get('units/expiring')
  @ApiOperation({ summary: 'Get units with leases expiring soon' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'days', required: false, description: 'Days ahead to look (default 90)' })
  getExpiringLeases(
    @Query('mallId') mallId?: string,
    @Query('days') days?: string,
  ) {
    return this.spacesService.getExpiringLeases(mallId, days ? +days : undefined);
  }

  @Get('units/compare')
  @ApiOperation({ summary: 'Compare multiple units side by side (2-5 units)' })
  @ApiQuery({ name: 'ids', required: true, description: 'Comma-separated unit IDs' })
  compareUnits(@Query('ids') ids: string) {
    const unitIds = ids.split(',').map((id) => id.trim()).filter(Boolean);
    return this.spacesService.compareUnits(unitIds);
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
  searchUnits(@Query() query: any) {
    if (query.status && query.status.includes(',')) {
      query.status = query.status.split(',');
    }
    if (query.category && query.category.includes(',')) {
      query.category = query.category.split(',');
    }
    return this.spacesService.getUnitsAdvanced(query);
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
  mergeUnits(
    @Body() body: { unitIds: string[] } & MergeUnitDto,
    @CurrentUser() user: any,
  ) {
    const { unitIds, ...dto } = body;
    return this.spacesService.mergeUnits(unitIds, dto, user?.id);
  }

  @Post('units/:id/split')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({
    summary: 'GAP #2 — Tách mặt bằng tổng hợp về các unit gốc',
    description: 'Phục hồi các unit gốc về VACANT và vô hiệu hoá unit tổng hợp.',
  })
  splitUnit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spacesService.splitUnit(id, user?.id);
  }

  // ─── Parameterized routes below ──────────────────────────────────────────

  @Get('units/:id')
  @ApiOperation({ summary: 'Get unit by ID with tenant and lease info' })
  getUnit(@Param('id') id: string) {
    return this.spacesService.getUnit(id);
  }

  @Post('units')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Create unit' })
  createUnit(@Body() dto: CreateUnitDto, @CurrentUser() user: any) {
    return this.spacesService.createUnit({ ...dto, mallId: dto.mallId ?? user.activeMallId });
  }

  @Patch('units/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update unit' })
  updateUnit(@Param('id') id: string, @Body() dto: any) {
    return this.spacesService.updateUnit(id, dto);
  }

  @Patch('units/:id/status')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update unit status' })
  updateUnitStatus(@Param('id') id: string, @Body('status') status: UnitStatus, @CurrentUser() user: any) {
    return this.spacesService.updateUnitStatus(id, status, user?.id);
  }

  @Delete('units/:id')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Delete unit' })
  deleteUnit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spacesService.deleteUnit(id, user?.id);
  }

  // ─── Unit Media ───────────────────────────────────────────────────────────

  @Get('units/:id/media')
  @ApiOperation({ summary: 'Danh sách media của unit (ảnh, floor plan, video, brochure)' })
  @ApiQuery({ name: 'type', required: false, enum: UnitMediaType })
  getUnitMedia(@Param('id') id: string, @Query('type') type?: UnitMediaType) {
    return this.unitMediaService.getUnitMedia(id, type);
  }

  @Post('units/:id/media')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Upload media cho unit (ảnh, floor plan, video, brochure)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  uploadUnitMedia(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type?: UnitMediaType; caption?: string; isCover?: string },
    @CurrentUser() user: any,
  ) {
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
  updateUnitMedia(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Body() body: { caption?: string; sortOrder?: number; isCover?: boolean },
    @CurrentUser() user: any,
  ) {
    return this.unitMediaService.updateMedia(id, mediaId, body, user.id);
  }

  @Delete('units/:id/media/:mediaId')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Xóa media của unit' })
  deleteUnitMedia(@Param('id') id: string, @Param('mediaId') mediaId: string) {
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
  importUnits(
    @Query('mallId') mallId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.unitMediaService.importUnits(mallId, file, user.id);
  }

  @Get('units/import/logs')
  @ApiOperation({ summary: 'Lịch sử import unit' })
  @ApiQuery({ name: 'mallId', required: true })
  getImportLogs(@Query('mallId') mallId: string) {
    return this.unitMediaService.getImportLogs(mallId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Unit History
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('units/:id/history')
  @ApiOperation({ summary: 'Get unit change history' })
  getUnitHistory(@Param('id') id: string) {
    return this.spacesService.getUnitHistory(id);
  }

  @Patch('units/:id/with-history')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update unit with history tracking' })
  updateUnitWithHistory(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() user: any,
  ) {
    return this.spacesService.updateUnitWithHistory(id, dto, user?.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Analytics
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('analytics/rent')
  @ApiOperation({ summary: 'Rent analytics by floor and category' })
  @ApiQuery({ name: 'mallId', required: false })
  getRentAnalytics(@Query('mallId') mallId?: string) {
    return this.spacesService.getRentAnalytics(mallId);
  }

  @Get('analytics/occupancy-trend')
  @ApiOperation({ summary: 'Historical occupancy trend' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'months', required: false, description: 'Number of months (default 12)' })
  getOccupancyTrend(
    @Query('mallId') mallId?: string,
    @Query('months') months?: string,
  ) {
    return this.spacesService.getOccupancyTrend(mallId, months ? +months : undefined);
  }

  @Get('analytics/availability-calendar')
  @ApiOperation({ summary: 'Unit availability calendar/forecast' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'months', required: false, description: 'Months ahead to forecast (default 6)' })
  getAvailabilityCalendar(
    @Query('mallId') mallId?: string,
    @Query('months') months?: string,
  ) {
    return this.spacesService.getAvailabilityCalendar(mallId, months ? +months : undefined);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Bulk Operations
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('units/bulk-update')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Bulk update multiple units' })
  bulkUpdateUnits(
    @Body() body: { unitIds: string[]; updates: any },
    @CurrentUser() user: any,
  ) {
    return this.spacesService.bulkUpdateUnits(body.unitIds, body.updates, user?.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL MAP — Floor Plan Upload & Unit Positioning
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('floors/:id/map')
  @ApiOperation({ summary: 'Get floor map data: floor plan URL + all units with positions' })
  getFloorMapData(@Param('id') id: string) {
    return this.spacesService.getFloorMapData(id);
  }

  @Post('floors/:id/floor-plan')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Upload floor plan image for a floor (JPG/PNG/WebP)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  uploadFloorPlan(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.spacesService.uploadFloorPlan(id, file);
  }

  @Delete('floors/:id/floor-plan')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Delete floor plan image' })
  deleteFloorPlan(@Param('id') id: string) {
    return this.spacesService.deleteFloorPlan(id);
  }

  @Patch('floors/:id/map-positions')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Batch save unit positions on floor map (% coordinates)' })
  saveMapPositions(
    @Param('id') id: string,
    @Body() body: { positions: Array<{ unitId: string; polygon?: number[][]; x?: number; y?: number; w?: number; h?: number }> },
  ) {
    return this.spacesService.saveMapPositions(id, body.positions);
  }

  @Patch('units/:id/map-position')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Update a single unit map position on floor plan' })
  updateUnitMapPosition(
    @Param('id') id: string,
    @Body() body: { polygon?: number[][] | null; x?: number | null; y?: number | null; w?: number | null; h?: number | null },
  ) {
    return this.spacesService.updateUnitMapPosition(id, body);
  }

  @Delete('units/:id/map-position')
  @Roles(...MODULE_ROLES.spacesManage)
  @ApiOperation({ summary: 'Remove unit from floor map (clear position)' })
  clearUnitMapPosition(@Param('id') id: string) {
    return this.spacesService.clearUnitMapPosition(id);
  }
}
