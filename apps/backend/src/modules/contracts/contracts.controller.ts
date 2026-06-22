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
import { AmendmentType, ContractStatus } from '@prisma/client';

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
  ) {}

  @Get('templates')
  @ApiOperation({ summary: 'List contract templates' })
  listTemplates() {
    return this.templatesService.listTemplates();
  }

  @Post('templates')
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
  @ApiQuery({ name: 'status', required: false, enum: ContractStatus })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any) {
    return this.contractsService.findAll(query);
  }

  @Get('expiring')
  @ApiOperation({ summary: 'Get contracts expiring soon' })
  @ApiQuery({ name: 'days', required: false })
  getExpiring(@Query('days') days?: number) {
    return this.contractsService.getExpiring(days ? +days : 90);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Contract event timeline with audit diff' })
  getEvents(@Param('id') id: string) {
    return this.eventsService.getTimeline(id);
  }

  @Get(':id/amendments')
  @ApiOperation({ summary: 'List contract amendments' })
  listAmendments(@Param('id') id: string) {
    return this.amendmentsService.list(id);
  }

  @Post(':id/amendments')
  @ApiOperation({ summary: 'Create contract amendment' })
  createAmendment(
    @Param('id') id: string,
    @Body() body: { type: AmendmentType; effectiveDate: string; changes: Record<string, unknown>; reason?: string },
    @CurrentUser() user: any,
  ) {
    return this.amendmentsService.create(id, { ...body, createdById: user.id });
  }

  @Post(':id/amendments/:amendmentId/submit')
  @ApiOperation({ summary: 'Submit amendment for approval' })
  submitAmendment(@Param('amendmentId') amendmentId: string) {
    return this.amendmentsService.submit(amendmentId);
  }

  @Post(':id/amendments/:amendmentId/approve')
  @ApiOperation({ summary: 'Approve and apply amendment' })
  approveAmendment(@Param('amendmentId') amendmentId: string, @CurrentUser() user: any) {
    return this.amendmentsService.approve(amendmentId, user.id);
  }

  @Post(':id/render-template')
  @ApiOperation({ summary: 'Render contract document from template' })
  renderTemplate(@Param('id') id: string, @Body('templateId') templateId: string) {
    return this.templatesService.renderForContract(id, templateId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contract details' })
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create contract' })
  create(@Body() dto: CreateContractDto, @CurrentUser() user: any) {
    return this.contractsService.create(dto, user?.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contract' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateContractDto>, @CurrentUser() user: any) {
    return this.contractsService.update(id, dto, user?.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update contract status' })
  updateStatus(@Param('id') id: string, @Body('status') status: ContractStatus, @CurrentUser() user: any) {
    return this.contractsService.updateStatus(id, status, user?.id);
  }

  // ── Contract Files (scan upload, delete) ────────────────────────────────────

  @Get(':id/files')
  @ApiOperation({ summary: 'List uploaded files for a contract' })
  listFiles(@Param('id') id: string) {
    return this.contractsService.listFiles(id);
  }

  @Post(':id/files')
  @ApiOperation({ summary: 'Upload a scanned/signed contract document' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }))
  uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.contractsService.uploadFile(id, file, user?.id);
  }

  @Delete(':id/files/:fileId')
  @ApiOperation({ summary: 'Delete a contract file' })
  deleteFile(@Param('id') id: string, @Param('fileId') fileId: string) {
    return this.contractsService.deleteFile(id, fileId);
  }

  // ── E-Signature ─────────────────────────────────────────────────────────────

  @Post(':id/files/:fileId/sign')
  @ApiOperation({ summary: 'E-sign a contract file — stores SHA-256 hash + verify code' })
  signFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Body() body: { signerName: string; signerRole: string },
    @CurrentUser() user: any,
  ) {
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
  getTermination(@Param('id') id: string) {
    return this.terminationService.getByContract(id);
  }

  @Post(':id/termination')
  @ApiOperation({ summary: 'Initiate contract termination' })
  initiate(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.terminationService.initiate(id, dto, user.id);
  }

  @Patch(':id/termination')
  @ApiOperation({ summary: 'Update termination details (handover checklist)' })
  updateTermination(@Param('id') id: string, @Body() dto: any) {
    return this.terminationService.update(id, dto);
  }

  @Post(':id/termination/complete')
  @ApiOperation({ summary: 'Complete termination — sets contract to TERMINATED and unit to AVAILABLE' })
  completeTermination(@Param('id') id: string) {
    return this.terminationService.complete(id);
  }

  @Post(':id/termination/cancel')
  @ApiOperation({ summary: 'Cancel termination — restores contract to ACTIVE' })
  cancelTermination(@Param('id') id: string) {
    return this.terminationService.cancel(id);
  }
}
