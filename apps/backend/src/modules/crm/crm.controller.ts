import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { CrmService } from './crm.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LeadStatus } from '@prisma/client';

@ApiTags('CRM')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.crm)
@Controller('crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('leads')
  @ApiOperation({ summary: 'List leads with filters and pagination' })
  @ApiQuery({ name: 'status', required: false, enum: LeadStatus })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any) {
    return this.crmService.findAll(query);
  }

  @Get('pipeline')
  @ApiOperation({ summary: 'Get leads grouped by status (Kanban)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max leads per column (default 100)' })
  getPipeline(@Query('limit') limit?: string) {
    return this.crmService.getPipeline(limit ? +limit : 100);
  }

  @Get('deals')
  @ApiOperation({ summary: 'Unified deal pipeline with stage and next action' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'stage', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getUnifiedDeals(@Query() query: any) {
    return this.crmService.getUnifiedDeals(query);
  }

  @Put('leads/:id/move')
  @ApiOperation({ summary: 'Move lead to new status/position (drag & drop)' })
  @ApiBody({ schema: { properties: { status: { type: 'string', enum: Object.values(LeadStatus) }, position: { type: 'number' } } } })
  moveLead(
    @Param('id') id: string,
    @Body() body: { status: LeadStatus; position: number },
    @CurrentUser() user: any,
  ) {
    return this.crmService.moveLead(id, body.status, body.position, user?.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get CRM statistics' })
  getStats() {
    return this.crmService.getStats();
  }

  @Get('leads/:id/timeline')
  @ApiOperation({ summary: 'Deal timeline: lead → booking → proposal → approval → contract' })
  getLeadTimeline(@Param('id') id: string) {
    return this.crmService.getLeadTimeline(id);
  }

  @Get('leads/:id')
  @ApiOperation({ summary: 'Get lead details' })
  findOne(@Param('id') id: string) {
    return this.crmService.findOne(id);
  }

  @Post('leads')
  @ApiOperation({ summary: 'Create new lead' })
  create(@Body() dto: CreateLeadDto) {
    return this.crmService.create(dto);
  }

  @Put('leads/:id')
  @ApiOperation({ summary: 'Update lead' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateLeadDto>, @CurrentUser() user: any) {
    return this.crmService.update(id, dto, user?.id);
  }

  @Delete('leads/:id')
  @ApiOperation({ summary: 'Delete lead' })
  remove(@Param('id') id: string) {
    return this.crmService.remove(id);
  }

  @Post('leads/:id/activities')
  @ApiOperation({ summary: 'Add activity to lead' })
  addActivity(
    @Param('id') id: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: any,
  ) {
    return this.crmService.addActivity(id, dto, user.id);
  }

  // ── Follow-ups ───────────────────────────────────────────────────────────────

  @Get('follow-ups')
  @ApiOperation({ summary: 'List follow-ups — for current user by default, or all on a lead when leadId is given' })
  @ApiQuery({ name: 'leadId', required: false })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'isDone', required: false })
  @ApiQuery({ name: 'daysAhead', required: false })
  listFollowUps(@Query() query: any, @CurrentUser() user: any) {
    const assignedToId = query.assignedToId ?? (query.leadId ? undefined : user.id);
    return this.crmService.listFollowUps({ ...query, assignedToId });
  }

  @Post('follow-ups')
  @ApiOperation({ summary: 'Create follow-up reminder' })
  createFollowUp(@Body() dto: any, @CurrentUser() user: any) {
    return this.crmService.createFollowUp(dto, user.id);
  }

  @Put('follow-ups/:id/complete')
  @ApiOperation({ summary: 'Mark follow-up as done' })
  completeFollowUp(@Param('id') id: string) {
    return this.crmService.completeFollowUp(id);
  }

  @Delete('follow-ups/:id')
  @ApiOperation({ summary: 'Delete follow-up' })
  deleteFollowUp(@Param('id') id: string) {
    return this.crmService.deleteFollowUp(id);
  }

  // ── Bulk Actions ───────────────────────────────────────────────────────────────

  @Post('leads/bulk')
  @ApiOperation({ summary: 'Perform bulk action on multiple leads' })
  @ApiBody({
    schema: {
      properties: {
        action: { type: 'string', enum: ['assign', 'changeStatus', 'changePriority', 'delete'] },
        leadIds: { type: 'array', items: { type: 'string' } },
        data: {
          type: 'object',
          properties: {
            assignedToId: { type: 'string' },
            status: { type: 'string', enum: Object.values(LeadStatus) },
            priority: { type: 'string', enum: ['HOT', 'WARM', 'COLD'] },
          },
        },
      },
    },
  })
  bulkAction(@Body() dto: any, @CurrentUser() user: any) {
    return this.crmService.bulkAction(dto, user.id);
  }

  // ── Pipeline Analytics ─────────────────────────────────────────────────────────

  @Get('pipeline/stats')
  @ApiOperation({ summary: 'Get pipeline analytics (conversion rates, win/loss, etc.)' })
  getPipelineStats() {
    return this.crmService.getPipelineStats();
  }

  // ── Stale Leads ────────────────────────────────────────────────────────────────

  @Get('leads/stale')
  @ApiOperation({ summary: 'Get stale leads (no activity for X days)' })
  @ApiQuery({ name: 'days', required: false, description: 'Days without activity (default 14)' })
  getStaleLeads(@Query('days') days?: string) {
    return this.crmService.getStaleLeads(days ? +days : 14);
  }

  // ── Auto Actions ───────────────────────────────────────────────────────────────

  @Post('leads/auto-move-stale')
  @ApiOperation({ summary: 'Auto-move stale leads to LOST status' })
  @ApiQuery({ name: 'days', required: false, description: 'Days threshold (default 60)' })
  autoMoveStaleToLost(@Query('days') days?: string) {
    return this.crmService.autoMoveStaleToLost(days ? +days : 60);
  }

  @Get('auto-assign-rules')
  @ApiOperation({ summary: 'Get auto-assign rules configuration' })
  getAutoAssignRules() {
    return this.crmService.getAutoAssignRules();
  }

  @Post('leads/:id/auto-assign')
  @ApiOperation({ summary: 'Auto-assign lead based on category rules' })
  autoAssignLead(@Param('id') id: string) {
    return this.crmService.autoAssignLead(id);
  }

  @Post('leads/:id/auto-followup')
  @ApiOperation({ summary: 'Create auto follow-up reminder for lead' })
  @ApiQuery({ name: 'daysFromNow', required: false, description: 'Days from now (default 7)' })
  createAutoFollowUp(
    @Param('id') id: string,
    @Query('daysFromNow') daysFromNow?: string,
    @Body() body?: { note?: string },
  ) {
    return this.crmService.createAutoFollowUp(id, daysFromNow ? +daysFromNow : 7, body?.note);
  }
}
