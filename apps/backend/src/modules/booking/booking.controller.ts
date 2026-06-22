import {
  Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards,
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

@ApiTags('Bookings')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.booking)
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ─── List & Stats ─────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Danh sách bookings với filter' })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'leadId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiQuery({ name: 'expiringSoon', required: false, type: Boolean, description: 'Sắp hết hạn trong 7 ngày' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query() query: any) {
    return this.bookingService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Thống kê booking (total, active, pending, expiring, converted)' })
  @ApiQuery({ name: 'mallId', required: false })
  getStats(@Query('mallId') mallId?: string) {
    return this.bookingService.getStats(mallId);
  }

  @Get('unit/:unitId/queue')
  @ApiOperation({ summary: 'Queue ưu tiên của một unit — xem ai đang xếp hàng' })
  @ApiParam({ name: 'unitId' })
  getUnitQueue(@Param('unitId') unitId: string) {
    return this.bookingService.getUnitQueue(unitId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết booking + lịch sử hoạt động' })
  findOne(@Param('id') id: string) {
    return this.bookingService.findOne(id);
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Tạo booking mới cho slot',
    description: 'Sale đặt giữ slot cho khách. Nếu unit đã có booking, tự động xếp vào hàng đợi.',
  })
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: any) {
    return this.bookingService.create(dto, user.id);
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin booking' })
  update(@Param('id') id: string, @Body() dto: UpdateBookingDto, @CurrentUser() user: any) {
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
  updatePriority(
    @Param('id') id: string,
    @Body('priority') priority: number,
    @CurrentUser() user: any,
  ) {
    return this.bookingService.updatePriority(id, priority, user.id);
  }

  @Patch(':id/extend')
  @ApiOperation({ summary: 'Gia hạn thời gian giữ slot' })
  extend(@Param('id') id: string, @Body() dto: ExtendBookingDto, @CurrentUser() user: any) {
    return this.bookingService.extend(id, dto, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Hủy booking — tự động promote người tiếp theo trong queue' })
  cancel(@Param('id') id: string, @Body() dto: CancelBookingDto, @CurrentUser() user: any) {
    return this.bookingService.cancel(id, dto, user.id);
  }

  // ─── Convert to Proposal ──────────────────────────────────────────────────

  @Post(':id/convert-to-proposal')
  @ApiOperation({
    summary: 'Chuyển booking thành Proposal chính thức',
    description: 'Tạo proposal từ booking. Booking chuyển sang CONVERTED. Lead status → PROPOSAL.',
  })
  convertToProposal(
    @Param('id') id: string,
    @Body() dto: ConvertToProposalDto,
    @CurrentUser() user: any,
  ) {
    return this.bookingService.convertToProposal(id, dto, user.id);
  }

  // ─── Price Approval ──────────────────────────────────────────────────────

  @Get('price-approval/pending')
  @ApiOperation({ summary: 'Danh sách booking cần phê duyệt giá' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getBookingsPendingPriceApproval(
    @Query('mallId') mallId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.bookingService.getBookingsPendingPriceApproval({ mallId, page, limit });
  }

  @Patch(':id/price/approve')
  @ApiOperation({ summary: 'Phê duyệt giá đề xuất của booking' })
  approvePrice(
    @Param('id') id: string,
    @Body() dto: ApprovePriceDto,
    @CurrentUser() user: any,
  ) {
    return this.bookingService.approvePrice(id, dto, user.id);
  }

  @Patch(':id/price/reject')
  @ApiOperation({ summary: 'Từ chối giá đề xuất của booking' })
  rejectPrice(
    @Param('id') id: string,
    @Body() dto: RejectPriceDto,
    @CurrentUser() user: any,
  ) {
    return this.bookingService.rejectPrice(id, dto, user.id);
  }

  // ─── Admin: expire manual trigger ────────────────────────────────────────

  @Post('admin/expire-overdue')
  @ApiOperation({ summary: '[Admin] Expire các booking quá hạn thủ công' })
  expireOverdue() {
    return this.bookingService.expireOverdueBookings();
  }
}
