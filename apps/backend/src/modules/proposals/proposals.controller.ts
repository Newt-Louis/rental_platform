import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { ProposalsService } from './proposals.service';
import { ProposalPdfService } from './proposal-pdf.service';
import { ProposalScenarioService } from './proposal-scenario.service';
import { CreateProposalDto, RejectProposalDto, UpdateProposalDto } from './dto/create-proposal.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProposalStatus, Role } from '@prisma/client';
import { MallAccessService } from '../../common/services/mall-access.service';

const PROPOSAL_EDIT_ROLES = [Role.ADMIN, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR];
const PROPOSAL_CONVERT_ROLES = [Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR];

@ApiTags('Proposals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.proposals)
@Controller('proposals')
export class ProposalsController {
  constructor(
    private readonly proposalsService: ProposalsService,
    private readonly pdfService: ProposalPdfService,
    private readonly scenarioService: ProposalScenarioService,
    private readonly mallAccess: MallAccessService,
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
  async stats(@CurrentUser() user: any, @Query('mallId') requestedMallId?: string) {
    const mallId: string | undefined = requestedMallId ?? user.activeMallId ?? undefined;
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId
      ? [mallId]
      : (await this.mallAccess.getAccessibleMallIds(user.id, user.role)) ?? undefined;
    return this.proposalsService.getStats(mallIds);
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
  async submit(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.proposalsService.submit(id);
  }

  @Post(':id/convert')
  @Roles(...PROPOSAL_CONVERT_ROLES)
  @ApiOperation({ summary: 'Convert approved proposal to contract' })
  async convert(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.proposalsService.convertToContract(id, user.id);
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

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Export proposal as PDF' })
  async exportPdf(@Param('id') id: string, @Res() res: Response, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    const proposal = await this.proposalsService.findOne(id);
    const buffer = await this.pdfService.generateProposalPdf(proposal);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="proposal-${proposal.proposalNumber}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Patch(':id/editor-content')
  @Roles(...PROPOSAL_EDIT_ROLES)
  @ApiOperation({ summary: 'Save proposal editor content (logo, font, item overrides, signatories)' })
  async saveEditorContent(@Param('id') id: string, @Body() body: { editorContent: any }, @CurrentUser() user: any) {
    await this.validateProposal(user, id);
    return this.proposalsService.saveEditorContent(id, body.editorContent);
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
