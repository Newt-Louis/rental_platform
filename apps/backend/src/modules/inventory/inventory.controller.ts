import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MallAccessService } from '../../common/services/mall-access.service';
import { CreateInventoryCategoryDto, CreateInventoryItemDto, CreateInventoryTransactionDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

const VIEW = [Role.ADMIN, Role.CEO, Role.MALL_DIRECTOR, Role.FINANCE, Role.OPERATION];
const EDIT = [Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION];

@ApiTags('Inventory') @ApiBearerAuth('JWT-auth') @Roles(...VIEW) @Controller('inventory')
export class InventoryController {
  constructor(private service: InventoryService, private mallAccess: MallAccessService) {}
  private async mallIds(user: any, mallId?: string) { if (mallId) { await this.mallAccess.assertMallAccess(user.id, user.role, mallId); return [mallId]; } return (await this.mallAccess.getAccessibleMallIds(user.id, user.role)) ?? undefined; }

  @Get('categories') async categories(@Query() query: any, @CurrentUser() user: any) { return this.service.listCategories(await this.mallIds(user, query.mallId), query); }
  @Post('categories') @Roles(...EDIT) async createCategory(@Body() dto: CreateInventoryCategoryDto, @CurrentUser() user: any) { await this.mallAccess.assertMallAccess(user.id, user.role, dto.mallId); return this.service.createCategory(dto); }
  @Patch('categories/:id') @Roles(...EDIT) async updateCategory(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) { await this.mallAccess.assertMallAccess(user.id, user.role, await this.service.mallIdForCategory(id)); return this.service.updateCategory(id, body); }
  @Get('items') async items(@Query() query: any, @CurrentUser() user: any) { return this.service.listItems(await this.mallIds(user, query.mallId), query); }
  @Post('items') @Roles(...EDIT) async createItem(@Body() dto: CreateInventoryItemDto, @CurrentUser() user: any) { await this.mallAccess.assertMallAccess(user.id, user.role, dto.mallId); return this.service.createItem(dto); }
  @Patch('items/:id') @Roles(...EDIT) async updateItem(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) { await this.mallAccess.assertMallAccess(user.id, user.role, await this.service.mallIdForItem(id)); return this.service.updateItem(id, body); }
  @Get('transactions') async transactions(@Query() query: any, @CurrentUser() user: any) { return this.service.listTransactions(await this.mallIds(user, query.mallId), query); }
  @Post('transactions') @Roles(...EDIT) async createTransaction(@Body() dto: CreateInventoryTransactionDto, @CurrentUser() user: any) { await this.mallAccess.assertMallAccess(user.id, user.role, await this.service.mallIdForItem(dto.itemId)); return this.service.createTransaction(dto, user.id); }
  @Get('summary') async summary(@Query('mallId') mallId: string, @CurrentUser() user: any) { return this.service.summary(await this.mallIds(user, mallId), mallId); }
}
