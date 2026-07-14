import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SlotsService } from './slots.service';
import {
  CreateUnitSlotDto, UpdateUnitSlotDto,
  CreateSlotBookingDto, CreateSlotPricingRuleDto, CreateSlotGridDto,
  SlotBookingType,
} from './dto/slots.dto';

@ApiTags('Slots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.slots)
@Controller('slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  // ── Unit Slots ──────────────────────────────────────────────────────────

  @Get('units/:unitId')
  listSlots(@Param('unitId') unitId: string) {
    return this.slotsService.listSlots(unitId);
  }

  @Post('units/:unitId')
  createSlot(@Param('unitId') unitId: string, @Body() dto: CreateUnitSlotDto) {
    return this.slotsService.createSlot(unitId, dto);
  }

  @Post('units/:unitId/grid')
  createSlotGrid(@Param('unitId') unitId: string, @Body() dto: CreateSlotGridDto) {
    return this.slotsService.createSlotGrid(unitId, dto);
  }

  @Get('summaries')
  getSlotSummaries(@Query('unitIds') unitIds: string) {
    const ids = unitIds.split(',').map((id) => id.trim()).filter(Boolean);
    return this.slotsService.getSlotSummaries(ids);
  }

  @Patch(':id')
  updateSlot(@Param('id') id: string, @Body() dto: UpdateUnitSlotDto) {
    return this.slotsService.updateSlot(id, dto);
  }

  @Delete(':id')
  deleteSlot(@Param('id') id: string) {
    return this.slotsService.deleteSlot(id);
  }

  // ── Pricing Rules ───────────────────────────────────────────────────────

  @Post(':id/pricing-rules')
  addPricingRule(@Param('id') id: string, @Body() dto: CreateSlotPricingRuleDto) {
    return this.slotsService.addPricingRule(id, dto);
  }

  @Delete('pricing-rules/:ruleId')
  deletePricingRule(@Param('ruleId') ruleId: string) {
    return this.slotsService.deletePricingRule(ruleId);
  }

  // ── Availability ────────────────────────────────────────────────────────

  @Get(':id/availability')
  getAvailability(
    @Param('id') id: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    return this.slotsService.getAvailability(id, y, m);
  }

  // ── Price calculation ───────────────────────────────────────────────────

  @Get(':id/price')
  calculatePrice(
    @Param('id') id: string,
    @Query('type') type: SlotBookingType,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    return this.slotsService.calculatePrice(id, type, new Date(start), new Date(end));
  }

  // ── Slot Bookings ───────────────────────────────────────────────────────

  @Post(':id/bookings')
  createBooking(
    @Param('id') id: string,
    @Body() dto: CreateSlotBookingDto,
    @CurrentUser() user: any,
  ) {
    return this.slotsService.createBooking(id, dto, user?.sub);
  }

  @Get(':id/bookings')
  listBookings(
    @Param('id') id: string,
    @Query('status') status?: string,
  ) {
    return this.slotsService.listBookings(id, status);
  }

  @Patch('bookings/:bookingId/confirm')
  confirmBooking(@Param('bookingId') bookingId: string) {
    return this.slotsService.confirmBooking(bookingId);
  }

  @Patch('bookings/:bookingId/cancel')
  cancelBooking(
    @Param('bookingId') bookingId: string,
    @Body() body: { reason?: string },
  ) {
    return this.slotsService.cancelBooking(bookingId, body?.reason);
  }

  @Delete('bookings/:bookingId')
  deleteSlotBooking(@Param('bookingId') bookingId: string) {
    return this.slotsService.deleteSlotBooking(bookingId);
  }

  // ── All bookings (manager view) ─────────────────────────────────────────

  @Get('bookings/all')
  listAllBookings(
    @Query('unitId') unitId?: string,
    @Query('mallId') mallId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.slotsService.listAllBookings({ unitId, mallId, status, type, from, to });
  }
}
