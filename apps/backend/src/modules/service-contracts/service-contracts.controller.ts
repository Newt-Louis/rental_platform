import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MallAccessService } from '../../common/services/mall-access.service';
import {
  CreateChecklistItemDto,
  CreateMilestoneDto,
  CreateRecurringPaymentsDto,
  CreateServiceContractDto,
  CreateServiceContractPaymentDto,
  RenewServiceContractDto,
  UpdateChecklistItemDto,
  UpdateMilestoneDto,
  UpdateServiceContractDto,
  UpdateServiceContractPaymentDto,
  UpdateServiceContractStatusDto,
} from './dto/service-contract.dto';
import { ServiceContractsService } from './service-contracts.service';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 1: descriptive only.

const VIEW_ROLES = [Role.ADMIN, Role.CEO, Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.FINANCE, Role.LEGAL, Role.OPERATION];
const EDIT_ROLES = [Role.ADMIN, Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.LEGAL, Role.OPERATION];

@ApiTags('Service Contracts')
@ApiBearerAuth('JWT-auth')
@Roles(...VIEW_ROLES)
@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED })
@Controller('service-contracts')
export class ServiceContractsController {
  constructor(private service: ServiceContractsService, private mallAccess: MallAccessService) {}

  private async assertItemAccess(id: string, user: any) {
    const item = await this.service.findOne(id);
    await this.mallAccess.assertMallAccess(user.id, user.role, item.mallId);
    return item;
  }

  @Get()
  async list(@Query() query: any, @CurrentUser() user: any) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const mallIds = query.mallId ? [query.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.service.findAll(query, mallIds ?? undefined);
  }

  @Get('export')
  async exportExcel(@Query() query: any, @CurrentUser() user: any, @Res() res: Response) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const mallIds = query.mallId ? [query.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    const buffer = await this.service.exportExcel(query, mallIds ?? undefined);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ServiceContracts_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  }

  @Get('summary/stats')
  async stats(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId ? [mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.service.stats(mallIds ?? undefined);
  }

  @Get('summary/alerts')
  async alerts(@Query('days') days: string, @Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId ? [mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.service.alerts(mallIds ?? undefined, Number(days) || 30);
  }

  @Get(':id')
  async detail(@Param('id') id: string, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.findOne(id); }

  @Post()
  @Roles(...EDIT_ROLES)
  async create(@Body() dto: CreateServiceContractDto, @CurrentUser() user: any) { await this.mallAccess.assertMallAccess(user.id, user.role, dto.mallId); return this.service.create(dto, user.id); }

  @Patch(':id')
  @Roles(...EDIT_ROLES)
  async update(@Param('id') id: string, @Body() dto: UpdateServiceContractDto, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.update(id, dto, user.id); }

  @Patch(':id/status')
  @Roles(...EDIT_ROLES)
  async status(@Param('id') id: string, @Body() dto: UpdateServiceContractStatusDto, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.updateStatus(id, dto.status, dto.description, user.id); }

  @Post(':id/documents')
  @Roles(...EDIT_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'].includes(file.mimetype)) }))
  async upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body('documentType') documentType: string, @Body('paymentId') paymentId: string, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.uploadDocument(id, file, documentType || 'CONTRACT', user.id, paymentId || undefined); }

  @Delete(':id/documents/:documentId')
  @Roles(...EDIT_ROLES)
  async deleteDocument(@Param('id') id: string, @Param('documentId') documentId: string, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.deleteDocument(id, documentId); }

  @Delete(':id')
  @Roles(...EDIT_ROLES)
  async remove(@Param('id') id: string, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.remove(id, user.id); }

  @Post(':id/renew') @Roles(...EDIT_ROLES)
  async renew(@Param('id') id: string, @Body() body: RenewServiceContractDto, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.renew(id, body, user.id); }

  @Post(':id/payments') @Roles(...EDIT_ROLES)
  async createPayment(@Param('id') id: string, @Body() body: CreateServiceContractPaymentDto, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.createPayment(id, body); }
  @Post(':id/payments/recurring') @Roles(...EDIT_ROLES)
  async recurring(@Param('id') id: string, @Body() body: CreateRecurringPaymentsDto, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.recurringPayments(id, body); }
  @Post(':id/payments/:itemId/transfer-to-billing') @Roles(...EDIT_ROLES, Role.FINANCE)
  async transferToBilling(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.transferPaymentToBilling(id, itemId, user.id); }
  @Patch(':id/payments/:itemId') @Roles(...EDIT_ROLES)
  async updatePayment(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: UpdateServiceContractPaymentDto, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.updatePayment(id, itemId, body); }
  @Delete(':id/payments/:itemId') @Roles(...EDIT_ROLES)
  async deletePayment(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.deletePayment(id, itemId); }

  @Post(':id/checklist') @Roles(...EDIT_ROLES)
  async createChecklist(@Param('id') id: string, @Body() body: CreateChecklistItemDto, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.createChecklist(id, body); }
  @Patch(':id/checklist/:itemId') @Roles(...EDIT_ROLES)
  async updateChecklist(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: UpdateChecklistItemDto, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.updateChecklist(id, itemId, body, user.id); }
  @Delete(':id/checklist/:itemId') @Roles(...EDIT_ROLES)
  async deleteChecklist(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.deleteChecklist(id, itemId); }

  @Post(':id/milestones') @Roles(...EDIT_ROLES)
  async createMilestone(@Param('id') id: string, @Body() body: CreateMilestoneDto, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.createMilestone(id, body); }
  @Patch(':id/milestones/:itemId') @Roles(...EDIT_ROLES)
  async updateMilestone(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: UpdateMilestoneDto, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.updateMilestone(id, itemId, body, user.id); }
  @Delete(':id/milestones/:itemId') @Roles(...EDIT_ROLES)
  async deleteMilestone(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: any) { await this.assertItemAccess(id, user); return this.service.deleteMilestone(id, itemId); }
}
