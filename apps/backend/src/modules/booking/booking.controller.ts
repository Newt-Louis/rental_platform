import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiBody, ApiParam,
} from '@nestjs/swagger';
import { BookingService } from './booking.service';
import {
  CreateBookingDto,
  UpdateBookingDto,
  ExtendBookingDto,
  CancelBookingDto,
  ConvertToProposalDto,
  ApprovePriceDto,
  RejectPriceDto,
} from './dto/create-booking.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BookingStatus } from '@prisma/client';
import { MallAccessService } from '../../common/services/mall-access.service';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 1: descriptive only.

@ApiTags('Bookings')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.booking)
@Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'booking' }, status: EnforcementStatus.ENFORCED })
@Controller('bookings')
export class BookingController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly mallAccess: MallAccessService,
  ) {}

  private async scopedQuery(query: any, user: any) {
    if (query.mallId) {
      await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
      return query;
    }
    const mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return mallIds === null ? query : { ...query, mallIds };
  }

  private checkBooking(user: any, bookingId: string) {
    return this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { bookingId });
  }

  // ─── List & Stats ─────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Danh sách bookings với filter' })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'floorId', required: false })
  @ApiQuery({ name: 'leadId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiQuery({ name: 'expiringSoon', required: false, type: Boolean, description: 'Sắp hết hạn trong 7 ngày' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.bookingService.findAll(await this.scopedQuery(query, user));
  }

  @Get('stats')
  @ApiOperation({ summary: 'Thống kê booking (total, active, pending, expiring, converted)' })
  @ApiQuery({ name: 'mallId', required: false })
  async getStats(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    const scope = await this.scopedQuery({ mallId }, user);
    return this.bookingService.getStats(scope.mallId, scope.mallIds);
  }

  @Get('unit/:unitId/queue')
  @ApiOperation({ summary: 'Queue ưu tiên của một unit — xem ai đang xếp hàng' })
  @ApiParam({ name: 'unitId' })
  async getUnitQueue(@Param('unitId') unitId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId });
    return this.bookingService.getUnitQueue(unitId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết booking + lịch sử hoạt động' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    await this.checkBooking(user, id);
    return this.bookingService.findOne(id);
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Tạo booking mới cho slot',
    description: 'Sale đặt giữ slot cho khách. Nếu unit đã có booking, tự động xếp vào hàng đợi.',
  })
  async create(@Body() dto: CreateBookingDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: dto.unitId });
    return this.bookingService.create(dto, user.id);
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin booking' })
  async update(@Param('id') id: string, @Body() dto: UpdateBookingDto, @CurrentUser() user: any) {
    await this.checkBooking(user, id);
    if (dto.unitId) await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: dto.unitId });
    return this.bookingService.update(id, dto, user.id);
  }

  @Patch(':id/priority')
  @ApiOperation({ summary: 'Thay đổi thứ tự ưu tiên trong queue' })
  @ApiBody({
    schema: {
      properties: { priority: { type: 'number', minimum: 1, description: 'Vị trí ưu tiên mới' } },
      required: ['priority'],
    },
  })
  async updatePriority(
    @Param('id') id: string,
    @Body('priority') priority: number,
    @CurrentUser() user: any,
  ) {
    await this.checkBooking(user, id);
    return this.bookingService.updatePriority(id, priority, user.id);
  }

  @Patch(':id/extend')
  @ApiOperation({ summary: 'Gia hạn thời gian giữ slot' })
  async extend(@Param('id') id: string, @Body() dto: ExtendBookingDto, @CurrentUser() user: any) {
    await this.checkBooking(user, id);
    return this.bookingService.extend(id, dto, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Hủy booking — tự động promote người tiếp theo trong queue' })
  async cancel(@Param('id') id: string, @Body() dto: CancelBookingDto, @CurrentUser() user: any) {
    await this.checkBooking(user, id);
    return this.bookingService.cancel(id, dto, user.id);
  }

  @Patch(':id/reinstate')
  @ApiOperation({ summary: 'Khôi phục booking đã hủy — đưa vào cuối queue của unit' })
  async reinstate(@Param('id') id: string, @CurrentUser() user: any) {
    await this.checkBooking(user, id);
    return this.bookingService.reinstate(id, user.id);
  }

  // ─── Convert to Proposal ──────────────────────────────────────────────────

  @Post(':id/convert-to-proposal')
  @ApiOperation({
    summary: 'Chuyển booking thành Proposal chính thức',
    description: 'Tạo proposal từ booking. Booking chuyển sang CONVERTED. Lead status → PROPOSAL.',
  })
  async convertToProposal(
    @Param('id') id: string,
    @Body() dto: ConvertToProposalDto,
    @CurrentUser() user: any,
  ) {
    await this.checkBooking(user, id);
    return this.bookingService.convertToProposal(id, dto, user.id);
  }

  // ─── Price Approval ──────────────────────────────────────────────────────

  @Get('price-approval/pending')
  @ApiOperation({ summary: 'Danh sách booking cần phê duyệt giá' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Roles('ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR')
  async getBookingsPendingPriceApproval(
    @Query('mallId') mallId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('leaseTermType') leaseTermType?: string,
    @CurrentUser() user?: any,
  ) {
    const scope = await this.scopedQuery({ mallId, page, limit, leaseTermType }, user);
    return this.bookingService.getBookingsPendingPriceApproval(scope);
  }

  @Patch(':id/price/approve')
  @ApiOperation({ summary: 'Phê duyệt giá đề xuất của booking' })
  async approvePrice(
    @Param('id') id: string,
    @Body() dto: ApprovePriceDto,
    @CurrentUser() user: any,
  ) {
    await this.checkBooking(user, id);
    return this.bookingService.approvePrice(id, dto, user.id);
  }

  @Patch(':id/price/reject')
  @ApiOperation({ summary: 'Từ chối giá đề xuất của booking' })
  async rejectPrice(
    @Param('id') id: string,
    @Body() dto: RejectPriceDto,
    @CurrentUser() user: any,
  ) {
    await this.checkBooking(user, id);
    return this.bookingService.rejectPrice(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xóa mềm booking (Admin có thể xóa bất kỳ, người khác chỉ xóa CANCELLED/EXPIRED)' })
  async softDelete(@Param('id') id: string, @CurrentUser() user: any) {
    await this.checkBooking(user, id);
    return this.bookingService.softDelete(id, user);
  }

  // ─── Admin: expire manual trigger ────────────────────────────────────────

  @Post('admin/expire-overdue')
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Expire các booking quá hạn thủ công' })
  expireOverdue() {
    return this.bookingService.expireOverdueBookings();
  }
}
