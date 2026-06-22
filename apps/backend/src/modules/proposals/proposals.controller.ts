import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { ProposalsService } from './proposals.service';
import { ProposalPdfService } from './proposal-pdf.service';
import { ProposalScenarioService } from './proposal-scenario.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProposalStatus } from '@prisma/client';

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
  ) {}

  @Get()
  @ApiOperation({ summary: 'List proposals' })
  @ApiQuery({ name: 'status', required: false, enum: ProposalStatus })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any) {
    return this.proposalsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get proposal details' })
  findOne(@Param('id') id: string) {
    return this.proposalsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new proposal' })
  create(@Body() dto: CreateProposalDto, @CurrentUser() user: any) {
    return this.proposalsService.create(dto, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update proposal (DRAFT only)' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateProposalDto>) {
    return this.proposalsService.update(id, dto);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit proposal for approval' })
  submit(@Param('id') id: string) {
    return this.proposalsService.submit(id);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Convert approved proposal to contract' })
  convert(@Param('id') id: string) {
    return this.proposalsService.convertToContract(id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a submitted/under-review proposal' })
  reject(
    @Param('id') id: string,
    @Body('rejectionReason') rejectionReason: string,
    @CurrentUser() user: any,
  ) {
    return this.proposalsService.reject(id, rejectionReason, user.id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Export proposal as PDF' })
  async exportPdf(@Param('id') id: string, @Res() res: Response) {
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
  @ApiOperation({ summary: 'Save proposal editor content (logo, font, item overrides, signatories)' })
  saveEditorContent(@Param('id') id: string, @Body() body: { editorContent: any }) {
    return this.proposalsService.saveEditorContent(id, body.editorContent);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List proposal versions' })
  listVersions(@Param('id') id: string) {
    return this.proposalsService.listVersions(id);
  }

  @Get(':id/versions/compare')
  @ApiOperation({ summary: 'Compare two proposal versions' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  compareVersions(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.proposalsService.compareVersions(id, +from, +to);
  }

  @Get(':id/versions/:version')
  @ApiOperation({ summary: 'Get proposal version snapshot' })
  getVersion(@Param('id') id: string, @Param('version') version: string) {
    return this.proposalsService.getVersion(id, +version);
  }

  // ── Scenarios ──────────────────────────────────────────────────────────────
  @Get(':id/scenarios')
  @ApiOperation({ summary: 'List financial scenarios for a proposal' })
  listScenarios(@Param('id') id: string) {
    return this.scenarioService.listScenarios(id);
  }

  @Post(':id/scenarios')
  @ApiOperation({ summary: 'Add a financial scenario to a proposal' })
  createScenario(@Param('id') id: string, @Body() dto: any) {
    return this.scenarioService.createScenario(id, dto);
  }

  @Patch(':id/scenarios/:scenarioId')
  @ApiOperation({ summary: 'Update a scenario' })
  updateScenario(@Param('scenarioId') scenarioId: string, @Body() dto: any) {
    return this.scenarioService.updateScenario(scenarioId, dto);
  }

  @Delete(':id/scenarios/:scenarioId')
  @ApiOperation({ summary: 'Delete a scenario' })
  deleteScenario(@Param('scenarioId') scenarioId: string) {
    return this.scenarioService.deleteScenario(scenarioId);
  }

  @Post(':id/scenarios/:scenarioId/select')
  @ApiOperation({ summary: 'Select a scenario as the preferred one' })
  selectScenario(@Param('id') id: string, @Param('scenarioId') scenarioId: string) {
    return this.scenarioService.selectScenario(id, scenarioId);
  }
}
