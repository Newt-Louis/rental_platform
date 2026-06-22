import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FitoutService } from './fitout.service';
import { FitoutDocumentsService } from './fitout-documents.service';
import { FitoutSlaService } from './fitout-sla.service';
import { FitoutContractorService } from './fitout-contractor.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FitoutStatus, FitoutDocumentType, Role } from '@prisma/client';

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
  ) {}

  @Get()
  @ApiOperation({ summary: 'List fitout projects' })
  @ApiQuery({ name: 'status', required: false, enum: FitoutStatus })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any) {
    return this.fitoutService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get fitout project details' })
  findOne(@Param('id') id: string) {
    return this.fitoutService.findOne(id);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Advance fitout status' })
  advanceStatus(@Param('id') id: string, @Body('status') status: FitoutStatus) {
    return this.fitoutService.advanceStatus(id, status);
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
        documentType: { type: 'string', enum: Object.values(FitoutDocumentType) },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: FitoutDocumentType,
    @CurrentUser() user: any,
  ) {
    const filePath = `/uploads/fitout/${id}/${Date.now()}_${file?.originalname ?? 'document'}`;
    return this.documentsService.uploadDocument({
      projectId: id,
      documentType,
      fileName: file?.originalname ?? 'document',
      filePath,
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
  checkGate(@Param('id') id: string, @Param('targetStatus') targetStatus: FitoutStatus) {
    return this.documentsService.checkGateRequirements(id, targetStatus);
  }

  @Get(':id/milestones')
  @ApiOperation({ summary: 'Get fitout milestones with SLA status' })
  getMilestones(@Param('id') id: string) {
    return this.slaService.getProjectMilestones(id);
  }

  @Get('gates')
  @ApiOperation({ summary: 'List document gate configurations' })
  listGates() {
    return this.documentsService.listGates();
  }

  @Post('gates')
  @ApiOperation({ summary: 'Upsert document gate' })
  upsertGate(@Body() body: {
    stage: FitoutStatus;
    documentType: FitoutDocumentType;
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
    stage: FitoutStatus;
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
