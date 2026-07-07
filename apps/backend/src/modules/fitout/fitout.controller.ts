import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FitoutService } from './fitout.service';
import { FitoutDocumentsService } from './fitout-documents.service';
import { FitoutSlaService } from './fitout-sla.service';
import { FitoutContractorService } from './fitout-contractor.service';
import { FitoutStageConfigService } from './fitout-stage-config.service';
import { FitoutFormTypeService } from './fitout-form-type.service';
import { FitoutIssueService } from './fitout-issue.service';
import { FitoutDashboardService } from './fitout-dashboard.service';
import { StorageService } from '../../storage/storage.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Fitout')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Controller('fitouts')
export class FitoutController {
  constructor(
    private readonly fitoutService: FitoutService,
    private readonly documentsService: FitoutDocumentsService,
    private readonly slaService: FitoutSlaService,
    private readonly contractorService: FitoutContractorService,
    private readonly stageConfigService: FitoutStageConfigService,
    private readonly formTypeService: FitoutFormTypeService,
    private readonly issueService: FitoutIssueService,
    private readonly dashboardService: FitoutDashboardService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List fitout projects' })
  @Roles(...MODULE_ROLES.fitout, Role.TENANT)
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.fitoutService.findAll(query, user);
  }

  // ── Static top-level routes MUST be declared before ':id' — Nest/Express match
  // routes in registration order, so a ':id' route registered first would swallow
  // literal paths like 'gates' or 'progress' as if they were an id. ─────────────

  @Get('gates')
  @ApiOperation({ summary: 'List document gate configurations' })
  listGates() {
    return this.documentsService.listGates();
  }

  @Post('gates')
  @ApiOperation({ summary: 'Upsert document gate' })
  upsertGate(@Body() body: {
    stage: string;
    documentType: string;
    isRequired?: boolean;
    description?: string;
    order?: number;
  }) {
    return this.documentsService.upsertGate(body);
  }

  @Get('sla/policies')
  @ApiOperation({ summary: 'List fitout SLA policies' })
  listSlaPolicies() {
    return this.slaService.listPolicies();
  }

  @Post('sla/policies')
  @ApiOperation({ summary: 'Upsert fitout SLA policy' })
  upsertSlaPolicy(@Body() body: {
    stage: string;
    targetDays: number;
    warningDays: number;
    escalateToRole?: Role;
  }) {
    return this.slaService.upsertPolicy(body);
  }

  @Get('progress')
  @ApiOperation({ summary: 'Get fitout progress report' })
  getProgress() {
    return this.slaService.getFitoutProgress();
  }

  @Get('stage-configs')
  @ApiOperation({ summary: 'List fitout stage pipeline configuration' })
  listStageConfigs() {
    return this.stageConfigService.list();
  }

  @Post('stage-configs')
  @ApiOperation({ summary: 'Upsert a fitout stage config' })
  upsertStageConfig(@Body() body: any) {
    return this.stageConfigService.upsert(body);
  }

  @Delete('stage-configs/:code')
  @ApiOperation({ summary: 'Deactivate a fitout stage config' })
  deactivateStageConfig(@Param('code') code: string) {
    return this.stageConfigService.deactivate(code);
  }

  @Get('form-types')
  @ApiOperation({ summary: 'List fitout form/document type configuration' })
  listFormTypes() {
    return this.formTypeService.list();
  }

  @Post('form-types')
  @ApiOperation({ summary: 'Upsert a fitout form type' })
  upsertFormType(@Body() body: any) {
    return this.formTypeService.upsert(body);
  }

  @Delete('form-types/:code')
  @ApiOperation({ summary: 'Deactivate a fitout form type' })
  deactivateFormType(@Param('code') code: string) {
    return this.formTypeService.deactivate(code);
  }

  @Get('dashboard/overview')
  @ApiOperation({ summary: 'Get fitout dashboard overview across all active projects' })
  getDashboardOverview() {
    return this.dashboardService.getOverview();
  }

  // ── ':id/*' routes ───────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get fitout project details' })
  @Roles(...MODULE_ROLES.fitout, Role.TENANT)
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.fitoutService.findOne(id, user);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Advance fitout status' })
  advanceStatus(
    @Param('id') id: string,
    @Body() body: { status: string; override?: boolean; overrideReason?: string },
    @CurrentUser() user: any,
  ) {
    return this.fitoutService.advanceStatus(id, body.status, {
      userId: user?.id,
      override: body.override,
      overrideReason: body.overrideReason,
    });
  }

  @Get(':id/checklists')
  @ApiOperation({ summary: 'Get fitout checklists' })
  getChecklists(@Param('id') id: string) {
    return this.fitoutService.getChecklists(id);
  }

  @Post(':id/checklists')
  @ApiOperation({ summary: 'Create checklist item' })
  createChecklist(@Param('id') id: string, @Body() body: { title: string; description?: string }) {
    return this.fitoutService.createChecklist(id, body);
  }

  @Patch(':id/checklists/:checklistId')
  @ApiOperation({ summary: 'Update checklist item (toggle complete)' })
  updateChecklist(
    @Param('id') id: string,
    @Param('checklistId') checklistId: string,
    @Body('isCompleted') isCompleted: boolean,
    @CurrentUser() user: any,
  ) {
    return this.fitoutService.updateChecklist(id, checklistId, isCompleted, user.id);
  }

  @Delete(':id/checklists/:checklistId')
  @ApiOperation({ summary: 'Delete checklist item' })
  deleteChecklist(@Param('id') id: string, @Param('checklistId') checklistId: string) {
    return this.fitoutService.deleteChecklist(id, checklistId);
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign operation manager' })
  assign(@Param('id') id: string, @Body('operationManagerId') operationManagerId: string) {
    return this.fitoutService.assign(id, operationManagerId);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List fitout documents' })
  listDocuments(@Param('id') id: string) {
    return this.documentsService.listDocuments(id);
  }

  @Post(':id/documents')
  @ApiOperation({ summary: 'Upload fitout document' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        documentType: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: string,
    @CurrentUser() user: any,
  ) {
    const saved = await this.storageService.saveFile(file, `fitout/${id}`);
    return this.documentsService.uploadDocument({
      projectId: id,
      documentType,
      fileName: saved.fileName,
      filePath: saved.filePath,
      fileSizeKb: file ? Math.round(file.size / 1024) : 0,
      uploadedById: user?.id,
    });
  }

  @Put(':id/documents/:docId/review')
  @ApiOperation({ summary: 'Review fitout document' })
  reviewDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; note?: string },
    @CurrentUser() user: any,
  ) {
    return this.documentsService.reviewDocument(docId, body.decision, body.note, user?.id);
  }

  @Get(':id/gate-check/:targetStatus')
  @ApiOperation({ summary: 'Check gate requirements before advancing' })
  checkGate(@Param('id') id: string, @Param('targetStatus') targetStatus: string) {
    return this.documentsService.checkGateRequirements(id, targetStatus);
  }

  @Get(':id/milestones')
  @ApiOperation({ summary: 'Get fitout milestones with SLA status' })
  getMilestones(@Param('id') id: string) {
    return this.slaService.getProjectMilestones(id);
  }

  @Get(':id/dmap')
  @ApiOperation({ summary: 'Get D-Map data (unit floor plan + open issue pins)' })
  getDMap(@Param('id') id: string) {
    return this.issueService.getDMap(id);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Get aggregated dashboard for a single fitout project' })
  getProjectDashboard(@Param('id') id: string) {
    return this.dashboardService.getProjectDashboard(id);
  }

  // ── Contractors ─────────────────────────────────────────────────────────────
  @Get(':id/contractors')
  @ApiOperation({ summary: 'List contractors for a fitout project' })
  listContractors(@Param('id') id: string) {
    return this.contractorService.listContractors(id);
  }

  @Post(':id/contractors')
  @ApiOperation({ summary: 'Add contractor to a fitout project' })
  createContractor(@Param('id') id: string, @Body() dto: any) {
    return this.contractorService.createContractor(id, dto);
  }

  @Patch(':id/contractors/:contractorId')
  @ApiOperation({ summary: 'Update contractor' })
  updateContractor(@Param('contractorId') contractorId: string, @Body() dto: any) {
    return this.contractorService.updateContractor(contractorId, dto);
  }

  @Delete(':id/contractors/:contractorId')
  @ApiOperation({ summary: 'Deactivate contractor' })
  deleteContractor(@Param('contractorId') contractorId: string) {
    return this.contractorService.deleteContractor(contractorId);
  }

  // ── Worker Access Logs ───────────────────────────────────────────────────────
  @Get(':id/workers')
  @ApiOperation({ summary: 'List worker access logs for a fitout project' })
  listWorkerLogs(@Param('id') id: string) {
    return this.contractorService.listWorkerLogs(id);
  }

  @Post(':id/workers')
  @ApiOperation({ summary: 'Log worker entry' })
  logWorkerEntry(@Param('id') id: string, @Body() dto: any) {
    return this.contractorService.logWorkerEntry(id, dto);
  }

  @Patch(':id/workers/:logId/exit')
  @ApiOperation({ summary: 'Log worker exit' })
  logWorkerExit(@Param('logId') logId: string) {
    return this.contractorService.logWorkerExit(logId);
  }
}
