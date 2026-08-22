import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SlotsService } from './slots.service';
import { MallAccessService } from '../../common/services/mall-access.service';
import {
  CreateUnitSlotDto, UpdateUnitSlotDto,
  CreateSlotBookingDto, CreateSlotPricingRuleDto, CreateSlotGridDto,
  SlotBookingType,
} from './dto/slots.dto';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 1: descriptive only.
@ApiTags('Slots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.slots)
@Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'slot' }, status: EnforcementStatus.ENFORCED })
@Controller('slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService, private readonly mallAccess: MallAccessService) {}

  private check(user: any, sources: Parameters<MallAccessService['extractAndValidateMallAccess']>[2]) {
    return this.mallAccess.extractAndValidateMallAccess(user.id, user.role, sources);
  }

  // ── Unit Slots ──────────────────────────────────────────────────────────

  @Get('units/:unitId')
  async listSlots(@Param('unitId') unitId: string, @CurrentUser() user: any) {
    await this.check(user, { unitId });
    return this.slotsService.listSlots(unitId);
  }

  @Post('units/:unitId')
  async createSlot(@Param('unitId') unitId: string, @Body() dto: CreateUnitSlotDto, @CurrentUser() user: any) {
    await this.check(user, { unitId });
    return this.slotsService.createSlot(unitId, dto);
  }

  @Post('units/:unitId/grid')
  async createSlotGrid(@Param('unitId') unitId: string, @Body() dto: CreateSlotGridDto, @CurrentUser() user: any) {
    await this.check(user, { unitId });
    return this.slotsService.createSlotGrid(unitId, dto);
  }

  @Get('summaries')
  async getSlotSummaries(@Query('unitIds') unitIds: string, @CurrentUser() user: any) {
    const ids = unitIds.split(',').map((id) => id.trim()).filter(Boolean);
    await Promise.all(ids.map((unitId) => this.check(user, { unitId })));
    return this.slotsService.getSlotSummaries(ids);
  }

  @Patch(':id')
  async updateSlot(@Param('id') id: string, @Body() dto: UpdateUnitSlotDto, @CurrentUser() user: any) {
    await this.check(user, { slotId: id });
    return this.slotsService.updateSlot(id, dto);
  }

  @Delete(':id')
  async deleteSlot(@Param('id') id: string, @CurrentUser() user: any) {
    await this.check(user, { slotId: id });
    return this.slotsService.deleteSlot(id);
  }

  // ── Pricing Rules ───────────────────────────────────────────────────────

  @Post(':id/pricing-rules')
  async addPricingRule(@Param('id') id: string, @Body() dto: CreateSlotPricingRuleDto, @CurrentUser() user: any) {
    await this.check(user, { slotId: id });
    return this.slotsService.addPricingRule(id, dto);
  }

  @Delete('pricing-rules/:ruleId')
  async deletePricingRule(@Param('ruleId') ruleId: string, @CurrentUser() user: any) {
    await this.check(user, { slotPricingRuleId: ruleId });
    return this.slotsService.deletePricingRule(ruleId);
  }

  // ── Availability ────────────────────────────────────────────────────────

  @Get(':id/availability')
  async getAvailability(
    @Param('id') id: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: any,
  ) {
    await this.check(user, { slotId: id });
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    return this.slotsService.getAvailability(id, y, m);
  }

  // ── Price calculation ───────────────────────────────────────────────────

  @Get(':id/price')
  async calculatePrice(
    @Param('id') id: string,
    @Query('type') type: SlotBookingType,
    @Query('start') start: string,
    @Query('end') end: string,
    @CurrentUser() user: any,
  ) {
    await this.check(user, { slotId: id });
    return this.slotsService.calculatePrice(id, type, new Date(start), new Date(end));
  }

  // ── Slot Bookings ───────────────────────────────────────────────────────

  @Post(':id/bookings')
  async createBooking(
    @Param('id') id: string,
    @Body() dto: CreateSlotBookingDto,
    @CurrentUser() user: any,
  ) {
    await this.check(user, { slotId: id });
    return this.slotsService.createBooking(id, dto, user.id);
  }

  @Get(':id/bookings')
  async listBookings(
    @Param('id') id: string,
    @Query('status') status?: string,
    @CurrentUser() user?: any,
  ) {
    await this.check(user, { slotId: id });
    return this.slotsService.listBookings(id, status);
  }

  @Patch('bookings/:bookingId/confirm')
  async confirmBooking(@Param('bookingId') bookingId: string, @CurrentUser() user: any) {
    await this.check(user, { slotBookingId: bookingId });
    return this.slotsService.confirmBooking(bookingId);
  }

  @Patch('bookings/:bookingId/cancel')
  async cancelBooking(
    @Param('bookingId') bookingId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: any,
  ) {
    await this.check(user, { slotBookingId: bookingId });
    return this.slotsService.cancelBooking(bookingId, body?.reason);
  }

  @Patch('bookings/:bookingId')
  async updateSlotBooking(
    @Param('bookingId') bookingId: string,
    @Body() body: {
      installationStartDatetime?: string;
      installationEndDatetime?: string;
      startDatetime?: string;
      endDatetime?: string;
      dismantlingStartDatetime?: string;
      dismantlingEndDatetime?: string;
      discountPct?: number;
      notes?: string;
    },
    @CurrentUser() user: any,
  ) {
    await this.check(user, { slotBookingId: bookingId });
    return this.slotsService.updateSlotBooking(bookingId, body);
  }

  @Delete('bookings/:bookingId')
  async deleteSlotBooking(@Param('bookingId') bookingId: string, @CurrentUser() user: any) {
    await this.check(user, { slotBookingId: bookingId });
    return this.slotsService.deleteSlotBooking(bookingId);
  }

  // ── All bookings (manager view) ─────────────────────────────────────────

  @Get('bookings/all')
  async listAllBookings(
    @Query('unitId') unitId?: string,
    @Query('mallId') mallId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @CurrentUser() user?: any,
  ) {
    if (unitId) await this.check(user, { unitId });
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId ? [mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.slotsService.listAllBookings({ unitId, mallIds: mallIds ?? undefined, status, type, from, to });
  }
}
