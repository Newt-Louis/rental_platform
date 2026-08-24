import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MallAccessService } from '../../common/services/mall-access.service';
import { BillingAddInService } from './billing-addin.service';
import { CreateRateConfigDto, ListPeriodicChargesDto, ListRateConfigsDto, SaveDraftDto } from './dto/billing-addin.dto';

@ApiTags('Billing Add-in')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.billingAddIn)
@Controller('billing/addin')
export class BillingAddInController {
  constructor(
    private readonly service: BillingAddInService,
    private readonly mallAccess: MallAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Worklist vận hành: danh sách kỳ add-in theo mall/loại phí/trạng thái' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'chargeType', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'search', required: false })
  async list(@Query() query: ListPeriodicChargesDto, @CurrentUser() user: any) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const mallIds = query.mallId ? [query.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.service.list(query, mallIds ?? undefined);
  }

  // Đặt trước "@Get(':id')" — nếu không "rates" sẽ bị Nest hiểu nhầm thành :id.
  @Get('rates')
  @ApiOperation({ summary: 'Danh sách đơn giá Billing Add-in đã cấu hình theo mall/loại phí' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'chargeType', required: false })
  async listRates(@Query() query: ListRateConfigsDto, @CurrentUser() user: any) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    return this.service.listRates(query.mallId, query.chargeType);
  }

  @Post('rates')
  @ApiOperation({ summary: 'Thiết lập đơn giá mới cho 1 mall + loại phí (ADMIN)' })
  @Roles(Role.ADMIN)
  async createRate(@Body() body: CreateRateConfigDto, @CurrentUser() user: any) {
    await this.mallAccess.assertMallAccess(user.id, user.role, body.mallId);
    return this.service.createRate(body);
  }

  @Post('rates/:id/deactivate')
  @ApiOperation({ summary: 'Vô hiệu hoá một đơn giá đã cấu hình (ADMIN)' })
  @Roles(Role.ADMIN)
  async deactivateRate(@Param('id') id: string) {
    return this.service.deactivateRate(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một kỳ add-in' })
  async getOne(@Param('id') id: string, @CurrentUser() user: any) {
    const mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.service.getOne(id, mallIds ?? undefined);
  }

  @Post(':id/draft')
  @ApiOperation({ summary: 'Vận hành nhập/lưu nháp số liệu kỳ này' })
  @Roles(...MODULE_ROLES.billingAddInWrite)
  async saveDraft(@Param('id') id: string, @Body() body: SaveDraftDto, @CurrentUser() user: any) {
    const mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.service.saveDraft(id, body.inputData, body.notes, user.id, mallIds ?? undefined);
  }

  @Post(':id/no-charge')
  @ApiOperation({ summary: 'Vận hành xác nhận kỳ này không phát sinh phí' })
  @Roles(...MODULE_ROLES.billingAddInWrite)
  async confirmNoCharge(@Param('id') id: string, @CurrentUser() user: any) {
    const mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.service.confirmNoCharge(id, user.id, mallIds ?? undefined);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Vận hành chốt số liệu kỳ — khoá sửa, sẵn sàng cho Kế toán lập hoá đơn' })
  @Roles(...MODULE_ROLES.billingAddInWrite)
  async confirm(@Param('id') id: string, @CurrentUser() user: any) {
    const mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.service.confirm(id, user.id, mallIds ?? undefined);
  }

  @Post(':id/reopen')
  @ApiOperation({ summary: 'Mở lại kỳ đã chốt để sửa (trước khi lập hoá đơn) — giới hạn Admin/Giám đốc Mall' })
  @Roles(Role.ADMIN, Role.MALL_DIRECTOR)
  async reopen(@Param('id') id: string, @CurrentUser() user: any) {
    const mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.service.reopen(id, user.id, mallIds ?? undefined);
  }
}
