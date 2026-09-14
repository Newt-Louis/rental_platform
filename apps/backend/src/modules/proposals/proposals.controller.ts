import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, Res, HttpCode, HttpStatus, Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { ProposalsService } from './proposals.service';
import { ProposalPdfService } from './proposal-pdf.service';
import { ProposalScenarioService } from './proposal-scenario.service';
import { ProposalDocumentService } from './document/proposal-document.service';
import { SaveProposalDocumentContentDto, SendProposalDocumentDto, SubmitProposalDto } from './dto/proposal-document-content.dto';
import { ProposalDocumentDeliveryService } from './document/proposal-document-delivery.service';
import { CreateProposalDto, RejectProposalDto, UpdateProposalDto } from './dto/create-proposal.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ModuleRoles } from '../../common/decorators/module-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProposalStatus, Role } from '@prisma/client';
import { MallAccessService } from '../../common/services/mall-access.service';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 1: descriptive only.

const PROPOSAL_EDIT_ROLES = [Role.ADMIN, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR];
const PROPOSAL_CONVERT_ROLES = [Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR];

@ApiTags('Proposals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@ModuleRoles('proposals')
@Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'proposal' }, status: EnforcementStatus.ENFORCED })
@Controller('proposals')
export class ProposalsController {
  constructor(
    private readonly proposalsService: ProposalsService,
    private readonly pdfService: ProposalPdfService,
    private readonly scenarioService: ProposalScenarioService,
    private readonly mallAccess: MallAccessService,
    private readonly documents: ProposalDocumentService,
    private readonly delivery: ProposalDocumentDeliveryService,
  ) {}

  private async validateProposal(user: any, proposalId: string) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { proposalId });
  }

  private async scopedQuery(user: any, query: any) {
    const mallId: string | undefined = query.mallId ?? user.activeMallId ?? undefined;
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId ? undefined : (await this.mallAccess.getAccessibleMallIds(user.id, user.role)) ?? undefined;
    return { ...query, mallId, mallIds };
  }

  @Get()
  @ApiOperation({ summary: 'List proposals' })
  @ApiQuery({ name: 'status', required: false, enum: ProposalStatus })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'floorId', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.proposalsService.findAll(await this.scopedQuery(user, query));
  }

  @Get('stats/overview')
  @ApiOperation({ summary: 'Proposal KPI by status' })
  async stats(@CurrentUser() user: any, @Query('mallId') requestedMallId?: string, @Query('leaseTermType') leaseTermType?: string) {
    const mallId: string | undefined = requestedMallId ?? user.activeMallId ?? undefined;
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId
      ? [mallId]
      : (await this.mallAccess.getAccessibleMallIds(user.id, user.role)) ?? undefined;
    return this.proposalsService.getStats(mallIds, leaseTermType);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get proposal details' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.proposalsService.findOne(id);
  }

  @Post()
  @Roles(...PROPOSAL_EDIT_ROLES)
  @ApiOperation({ summary: 'Create new proposal' })
  async create(@Body() dto: CreateProposalDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: dto.unitId });
    return this.proposalsService.create(dto, user.id);
  }

  @Put(':id')
  @Roles(...PROPOSAL_EDIT_ROLES)
  @ApiOperation({ summary: 'Update proposal (DRAFT only)' })
  async update(@Param('id') id: string, @Body() dto: UpdateProposalDto, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    if (dto.unitId) await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: dto.unitId });
    return this.proposalsService.update(id, dto, user.id);
  }

  @Post(':id/submit')
  @Roles(...PROPOSAL_EDIT_ROLES)
  @ApiOperation({ summary: 'Submit proposal for approval' })
  async submit(@Param('id') id: string, @Body() dto: SubmitProposalDto, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.proposalsService.submit(id, user.id, dto?.reviewedFingerprint ?? null);
  }

  @Post(':id/convert')
  @Roles(...PROPOSAL_CONVERT_ROLES)
  @ApiOperation({ summary: 'Convert approved proposal to contract' })
  async convert(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.proposalsService.convertToContract(id, user.id, body?.tenant);
  }

  @Delete(':id')
  @Roles(...PROPOSAL_EDIT_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a DRAFT proposal' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.proposalsService.remove(id);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR)
  @ApiOperation({ summary: 'Reject a submitted/under-review proposal' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectProposalDto,
    @CurrentUser() user: any,
  ) {
    await this.validateProposal(user, id);
    return this.proposalsService.reject(id, dto.rejectionReason, user.id);
  }

  /**
   * CR-PROPOSAL-DOCUMENT-SOURCE-001 — the canonical Tờ trình: current business
   * facts, the author's saved wording, approval evidence and stale metadata.
   */
  @Get(':id/document')
  @ApiOperation({ summary: 'Canonical proposal document model (editor, PDF and approval screen share it)' })
  async getDocument(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.documents.getDocument(id);
  }

  /** Editorial content only; business facts are not writable here. */
  @Patch(':id/document-content')
  @Roles(...PROPOSAL_EDIT_ROLES)
  @ApiOperation({ summary: 'Save editable proposal document content (optimistic concurrency)' })
  async saveDocumentContent(
    @Param('id') id: string,
    @Body() dto: SaveProposalDocumentContentDto,
    @CurrentUser() user: any,
  ) {
    await this.validateProposal(user, id);
    return this.documents.saveContent(id, dto, user.id);
  }

  /**
   * The official Tờ trình a reader should see now: the live draft for a DRAFT,
   * otherwise the submitted version bound to the current workflow.
   */
  @Get(':id/pdf')
  @ApiOperation({ summary: 'Export the current official proposal document as PDF' })
  async exportPdf(@Param('id') id: string, @Res() res: Response, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    await this.sendPdf(res, await this.documents.getDocument(id));
  }

  @Get(':id/document-versions')
  @ApiOperation({ summary: 'List submitted, immutable document versions' })
  async listDocumentVersions(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.documents.listVersions(id);
  }

  @Get(':id/document-versions/:versionId')
  @ApiOperation({ summary: 'One submitted document version, with its own approval evidence' })
  async getDocumentVersion(@Param('id') id: string, @Param('versionId') versionId: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.documents.getVersionDocument(id, versionId);
  }

  /** Exact-version PDF. The approval screen always asks for its workflow's version. */
  @Get(':id/document-versions/:versionId/pdf')
  @ApiOperation({ summary: 'PDF of one submitted document version' })
  async exportVersionPdf(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    await this.validateProposal(user, id);
    await this.sendPdf(res, await this.documents.getVersionDocument(id, versionId));
  }

  /** Starts a new document cycle for a rejected Proposal; old evidence stays with its version. */
  @Post(':id/revise')
  @Roles(...PROPOSAL_EDIT_ROLES)
  @ApiOperation({ summary: 'Create a new document revision for a rejected proposal' })
  async revise(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.documents.startRevision(id, user.id);
  }

  @Get(':id/send-context')
  @ApiOperation({ summary: 'Approved versions and suggested recipients for an external send' })
  async sendContext(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.delivery.sendContext(id, user);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send an approved document version outside the company (requires Idempotency-Key)' })
  async sendExternal(
    @Param('id') id: string,
    @Body() dto: SendProposalDocumentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: any,
  ) {
    await this.validateProposal(user, id);
    return this.delivery.sendExternal(id, dto, user, idempotencyKey);
  }

  @Get(':id/sends')
  @ApiOperation({ summary: 'External send history of a proposal' })
  async listSends(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.delivery.listSends(id);
  }

  private async sendPdf(res: Response, document: Awaited<ReturnType<ProposalDocumentService['getDocument']>>) {
    const buffer = await this.pdfService.render(document);
    const suffix = document.version ? `-v${document.version.versionNumber}` : '-draft';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="proposal-${document.proposalNumber}${suffix}.pdf"`,
      'Content-Length': buffer.length,
      'X-Proposal-Document-Fingerprint': document.sync.sourceFingerprint,
      'X-Proposal-Document-Stale': String(document.sync.documentStale),
      ...(document.version
        ? {
            'X-Proposal-Document-Version-Id': document.version.id,
            'X-Proposal-Document-Version': String(document.version.versionNumber),
            'X-Proposal-Live-Differs': String(document.version.liveDiffers),
          }
        : {}),
    });
    res.end(buffer);
  }


  @Patch(':id/doc-fields')
  @Roles(...PROPOSAL_EDIT_ROLES)
  @ApiOperation({ summary: 'Update supplementary doc fields (fees, hours, deposit) — editable regardless of status' })
  async updateDocFields(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.proposalsService.updateDocFields(id, body);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List proposal versions' })
  async listVersions(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.proposalsService.listVersions(id);
  }

  @Get(':id/versions/compare')
  @ApiOperation({ summary: 'Compare two proposal versions' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  async compareVersions(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string, @CurrentUser() user: any,
  ) {
    await this.validateProposal(user, id);
    return this.proposalsService.compareVersions(id, +from, +to);
  }

  @Get(':id/versions/:version')
  @ApiOperation({ summary: 'Get proposal version snapshot' })
  async getVersion(@Param('id') id: string, @Param('version') version: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.proposalsService.getVersion(id, +version);
  }

  // ── Scenarios ──────────────────────────────────────────────────────────────
  @Get(':id/scenarios')
  @ApiOperation({ summary: 'List financial scenarios for a proposal' })
  async listScenarios(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.scenarioService.listScenarios(id);
  }

  @Post(':id/scenarios')
  @Roles(...PROPOSAL_EDIT_ROLES)
  @ApiOperation({ summary: 'Add a financial scenario to a proposal' })
  async createScenario(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.scenarioService.createScenario(id, dto);
  }

  @Patch(':id/scenarios/:scenarioId')
  @Roles(...PROPOSAL_EDIT_ROLES)
  @ApiOperation({ summary: 'Update a scenario' })
  async updateScenario(@Param('id') id: string, @Param('scenarioId') scenarioId: string, @Body() dto: any, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.scenarioService.updateScenario(id, scenarioId, dto);
  }

  @Delete(':id/scenarios/:scenarioId')
  @Roles(...PROPOSAL_EDIT_ROLES)
  @ApiOperation({ summary: 'Delete a scenario' })
  async deleteScenario(@Param('id') id: string, @Param('scenarioId') scenarioId: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.scenarioService.deleteScenario(id, scenarioId);
  }

  @Post(':id/scenarios/:scenarioId/select')
  @Roles(...PROPOSAL_EDIT_ROLES)
  @ApiOperation({ summary: 'Select a scenario as the preferred one' })
  async selectScenario(@Param('id') id: string, @Param('scenarioId') scenarioId: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.scenarioService.selectScenario(id, scenarioId);
  }
}
