import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ContractsService } from './contracts.service';
import { ContractEventsService } from './contract-events.service';
import { ContractTemplatesService, ContractAmendmentsService } from './contract-templates.service';
import { ContractTerminationService } from './contract-termination.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AmendmentType, ContractStatus, Role } from '@prisma/client';
import { MallAccessService } from '../../common/services/mall-access.service';

const CONTRACT_EDIT_ROLES = [Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR, Role.LEGAL];
const CONTRACT_STATUS_ROLES = [Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR];

@ApiTags('Contracts')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.contracts)
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly eventsService: ContractEventsService,
    private readonly templatesService: ContractTemplatesService,
    private readonly amendmentsService: ContractAmendmentsService,
    private readonly terminationService: ContractTerminationService,
    private readonly mallAccess: MallAccessService,
  ) {}

  private validateContract(user: any, contractId: string) {
    return this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { contractId });
  }

  @Get('templates')
  @ApiOperation({ summary: 'List contract templates' })
  listTemplates() {
    return this.templatesService.listTemplates();
  }

  @Post('templates')
  @Roles(Role.ADMIN, Role.LEGAL)
  @ApiOperation({ summary: 'Create contract template' })
  createTemplate(@Body() body: any) {
    return this.templatesService.createTemplate(body);
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get contract template' })
  getTemplate(@Param('id') id: string) {
    return this.templatesService.findTemplate(id);
  }

  @Get()
  @ApiOperation({ summary: 'List contracts' })
  @Roles(...MODULE_ROLES.contracts, Role.TENANT)
  @ApiQuery({ name: 'status', required: false, enum: ContractStatus })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'startDateFrom', required: false })
  @ApiQuery({ name: 'startDateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: any, @CurrentUser() user: any) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const mallIds = query.mallId ? [query.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.contractsService.findAll({ ...query, mallIds: mallIds ?? undefined }, user);
  }

  @Get('expiring')
  @ApiOperation({ summary: 'Get contracts expiring soon' })
  @ApiQuery({ name: 'days', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  async getExpiring(@Query('days') days: number | undefined, @Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId ? [mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.contractsService.getExpiring(days ? +days : 90, mallIds ?? undefined);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Contract event timeline with audit diff' })
  async getEvents(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.eventsService.getTimeline(id);
  }

  @Get(':id/amendments')
  @ApiOperation({ summary: 'List contract amendments' })
  async listAmendments(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.amendmentsService.list(id);
  }

  @Post(':id/amendments')
  @Roles(...CONTRACT_EDIT_ROLES)
  @ApiOperation({ summary: 'Create contract amendment' })
  async createAmendment(
    @Param('id') id: string,
    @Body() body: { type: AmendmentType; effectiveDate: string; changes: Record<string, unknown>; reason?: string },
    @CurrentUser() user: any,
  ) {
    await this.validateContract(user, id);
    return this.amendmentsService.create(id, { ...body, createdById: user.id });
  }

  @Post(':id/amendments/:amendmentId/submit')
  @Roles(...CONTRACT_EDIT_ROLES)
  @ApiOperation({ summary: 'Submit amendment for approval' })
  async submitAmendment(@Param('id') id: string, @Param('amendmentId') amendmentId: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.amendmentsService.submit(amendmentId);
  }

  @Post(':id/amendments/:amendmentId/approve')
  @Roles(...CONTRACT_STATUS_ROLES)
  @ApiOperation({ summary: 'Approve and apply amendment' })
  async approveAmendment(@Param('id') id: string, @Param('amendmentId') amendmentId: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.amendmentsService.approve(amendmentId, user.id);
  }

  @Post(':id/render-template')
  @Roles(...CONTRACT_EDIT_ROLES)
  @ApiOperation({ summary: 'Render contract document from template' })
  async renderTemplate(@Param('id') id: string, @Body('templateId') templateId: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.templatesService.renderForContract(id, templateId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contract details' })
  @Roles(...MODULE_ROLES.contracts, Role.TENANT)
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.contractsService.findOne(id, user);
  }

  @Post()
  @Roles(...CONTRACT_EDIT_ROLES)
  @ApiOperation({ summary: 'Create contract' })
  async create(@Body() dto: CreateContractDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: dto.unitId });
    return this.contractsService.create(dto, user?.id);
  }

  @Patch(':id')
  @Roles(...CONTRACT_EDIT_ROLES)
  @ApiOperation({ summary: 'Update contract' })
  async update(@Param('id') id: string, @Body() dto: Partial<CreateContractDto>, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    if (dto.unitId) await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: dto.unitId });
    return this.contractsService.update(id, dto, user?.id);
  }

  @Patch(':id/status')
  @Roles(...CONTRACT_STATUS_ROLES)
  @ApiOperation({ summary: 'Update contract status' })
  async updateStatus(@Param('id') id: string, @Body('status') status: ContractStatus, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.contractsService.updateStatus(id, status, user?.id);
  }

  @Get(':id/activation-readiness')
  @ApiOperation({ summary: 'Check prerequisites before activating a contract' })
  async activationReadiness(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.contractsService.getActivationReadiness(id);
  }

  // ── Contract Files (scan upload, delete) ────────────────────────────────────

  @Get(':id/files')
  @ApiOperation({ summary: 'List uploaded files for a contract' })
  async listFiles(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.contractsService.listFiles(id);
  }

  @Post(':id/files')
  @Roles(...CONTRACT_EDIT_ROLES)
  @ApiOperation({ summary: 'Upload a scanned/signed contract document' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }))
  async uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    await this.validateContract(user, id);
    return this.contractsService.uploadFile(id, file, user?.id);
  }

  @Delete(':id/files/:fileId')
  @Roles(...CONTRACT_EDIT_ROLES)
  @ApiOperation({ summary: 'Delete a contract file' })
  async deleteFile(@Param('id') id: string, @Param('fileId') fileId: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.contractsService.deleteFile(id, fileId);
  }

  // ── E-Signature ─────────────────────────────────────────────────────────────

  @Post(':id/files/:fileId/sign')
  @Roles(...CONTRACT_EDIT_ROLES)
  @ApiOperation({ summary: 'E-sign a contract file — stores SHA-256 hash + verify code' })
  async signFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Body() body: { signerName: string; signerRole: string },
    @CurrentUser() user: any,
  ) {
    await this.validateContract(user, id);
    return this.contractsService.signFile(id, fileId, body.signerName, body.signerRole, user.id);
  }

  @Get('verify/:verifyCode')
  @ApiOperation({ summary: 'Verify e-signed contract file by code' })
  verifyFile(@Param('verifyCode') verifyCode: string) {
    return this.contractsService.verifySignature(verifyCode);
  }

  // ── Termination ─────────────────────────────────────────────────────────────

  @Get(':id/termination')
  @ApiOperation({ summary: 'Get termination details for a contract' })
  async getTermination(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.terminationService.getByContract(id);
  }

  @Post(':id/termination')
  @Roles(...CONTRACT_STATUS_ROLES)
  @ApiOperation({ summary: 'Initiate contract termination' })
  async initiate(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.terminationService.initiate(id, dto, user.id);
  }

  @Patch(':id/termination')
  @Roles(...CONTRACT_STATUS_ROLES)
  @ApiOperation({ summary: 'Update termination details (handover checklist)' })
  async updateTermination(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.terminationService.update(id, dto);
  }

  @Post(':id/termination/complete')
  @Roles(...CONTRACT_STATUS_ROLES)
  @ApiOperation({ summary: 'Complete termination — sets contract to TERMINATED and unit to AVAILABLE' })
  async completeTermination(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.terminationService.complete(id);
  }

  @Post(':id/termination/cancel')
  @Roles(...CONTRACT_STATUS_ROLES)
  @ApiOperation({ summary: 'Cancel termination — restores contract to ACTIVE' })
  async cancelTermination(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateContract(user, id);
    return this.terminationService.cancel(id);
  }
}
