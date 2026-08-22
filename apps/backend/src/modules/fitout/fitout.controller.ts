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
import { MallAccessService } from '../../common/services/mall-access.service';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 1: descriptive only.

@ApiTags('Fitout')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'fitoutProject' }, status: EnforcementStatus.ENFORCED })
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
    private readonly mallAccess: MallAccessService,
  ) {}

  private validateProject(user: any, fitoutProjectId: string) {
    return this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId });
  }

  @Get()
  @ApiOperation({ summary: 'List fitout projects' })
  @Roles(...MODULE_ROLES.fitout, Role.TENANT)
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  async findAll(@Query() query: any, @CurrentUser() user: any) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const mallIds = query.mallId ? [query.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.fitoutService.findAll({ ...query, mallIds: mallIds ?? undefined }, user);
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
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.fitoutService.findOne(id, user);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Advance fitout status' })
  async advanceStatus(
    @Param('id') id: string,
    @Body() body: { status: string; override?: boolean; overrideReason?: string },
    @CurrentUser() user: any,
  ) {
    await this.validateProject(user, id);
    return this.fitoutService.advanceStatus(id, body.status, {
      userId: user?.id,
      override: body.override,
      overrideReason: body.overrideReason,
    });
  }

  @Get(':id/checklists')
  @ApiOperation({ summary: 'Get fitout checklists' })
  async getChecklists(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.fitoutService.getChecklists(id);
  }

  @Post(':id/checklists')
  @ApiOperation({ summary: 'Create checklist item' })
  async createChecklist(@Param('id') id: string, @Body() body: { title: string; description?: string }, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.fitoutService.createChecklist(id, body);
  }

  @Patch(':id/checklists/:checklistId')
  @ApiOperation({ summary: 'Update checklist item (toggle complete)' })
  async updateChecklist(
    @Param('id') id: string,
    @Param('checklistId') checklistId: string,
    @Body('isCompleted') isCompleted: boolean,
    @CurrentUser() user: any,
  ) {
    await this.validateProject(user, id);
    return this.fitoutService.updateChecklist(id, checklistId, isCompleted, user.id);
  }

  @Delete(':id/checklists/:checklistId')
  @ApiOperation({ summary: 'Delete checklist item' })
  async deleteChecklist(@Param('id') id: string, @Param('checklistId') checklistId: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.fitoutService.deleteChecklist(id, checklistId);
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign operation manager' })
  async assign(@Param('id') id: string, @Body('operationManagerId') operationManagerId: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.fitoutService.assign(id, operationManagerId);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List fitout documents' })
  async listDocuments(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
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
    await this.validateProject(user, id);
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
  async reviewDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; note?: string },
    @CurrentUser() user: any,
  ) {
    await this.validateProject(user, id);
    // File-first / parent-child integrity (CR-101 Phase 3C C4-01): the document
    // must be verified to actually belong to `id` (the already-authorized
    // project), not merely fetched by its own `docId` -- see
    // fitout-documents.service.ts's reviewDocument for the full fix.
    return this.documentsService.reviewDocument(docId, id, body.decision, body.note, user?.id);
  }

  @Get(':id/gate-check/:targetStatus')
  @ApiOperation({ summary: 'Check gate requirements before advancing' })
  async checkGate(@Param('id') id: string, @Param('targetStatus') targetStatus: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.documentsService.checkGateRequirements(id, targetStatus);
  }

  @Get(':id/milestones')
  @ApiOperation({ summary: 'Get fitout milestones with SLA status' })
  async getMilestones(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.slaService.getProjectMilestones(id);
  }

  @Get(':id/dmap')
  @ApiOperation({ summary: 'Get D-Map data (unit floor plan + open issue pins)' })
  async getDMap(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.issueService.getDMap(id);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Get aggregated dashboard for a single fitout project' })
  async getProjectDashboard(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.dashboardService.getProjectDashboard(id);
  }

  // ── Contractors ─────────────────────────────────────────────────────────────
  @Get(':id/contractors')
  @ApiOperation({ summary: 'List contractors for a fitout project' })
  async listContractors(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.contractorService.listContractors(id);
  }

  @Post(':id/contractors')
  @ApiOperation({ summary: 'Add contractor to a fitout project' })
  async createContractor(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.contractorService.createContractor(id, dto);
  }

  @Patch(':id/contractors/:contractorId')
  @ApiOperation({ summary: 'Update contractor' })
  async updateContractor(@Param('id') id: string, @Param('contractorId') contractorId: string, @Body() dto: any, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.contractorService.updateContractor(contractorId, dto);
  }

  @Delete(':id/contractors/:contractorId')
  @ApiOperation({ summary: 'Deactivate contractor' })
  async deleteContractor(@Param('id') id: string, @Param('contractorId') contractorId: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.contractorService.deleteContractor(contractorId);
  }

  // ── Worker Access Logs ───────────────────────────────────────────────────────
  @Get(':id/workers')
  @ApiOperation({ summary: 'List worker access logs for a fitout project' })
  async listWorkerLogs(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.contractorService.listWorkerLogs(id);
  }

  @Post(':id/workers')
  @ApiOperation({ summary: 'Log worker entry' })
  async logWorkerEntry(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.contractorService.logWorkerEntry(id, dto);
  }

  @Patch(':id/workers/:logId/exit')
  @ApiOperation({ summary: 'Log worker exit' })
  async logWorkerExit(@Param('id') id: string, @Param('logId') logId: string, @CurrentUser() user: any) {
    await this.validateProject(user, id);
    return this.contractorService.logWorkerExit(logId);
  }
}
