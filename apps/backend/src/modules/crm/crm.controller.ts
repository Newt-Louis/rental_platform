import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Logger, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { CrmService } from './crm.service';
import { CreateLeadDto, UpdateLeadDto } from './dto/create-lead.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LeadStatus, Role } from '@prisma/client';
import { MallAccessService } from '../../common/services/mall-access.service';

@ApiTags('CRM')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.crm)
@Controller('crm')
export class CrmController {
  private readonly logger = new Logger(CrmController.name);
  constructor(private readonly crmService: CrmService, private readonly mallAccess: MallAccessService) {}

  private async scope(user: any, mallId?: string) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId ? [mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return { userId: user.id, role: user.role, mallIds: mallIds ?? undefined };
  }

  @Get('leads')
  @ApiOperation({ summary: 'List leads with filters and pagination' })
  @ApiQuery({ name: 'status', required: false, enum: LeadStatus })
  @ApiQuery({ name: 'statuses', required: false, description: 'Danh sách trạng thái phân tách bằng dấu phẩy' })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  async findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.crmService.findAll({ ...query, scope: await this.scope(user, query.mallId) });
  }

  @Get('pipeline')
  @ApiOperation({ summary: 'Get leads grouped by status (Kanban)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max leads per column (default 100)' })
  @ApiQuery({ name: 'mallId', required: false })
  async getPipeline(@Query('limit') limit: string | undefined, @Query('mallId') mallId: string | undefined, @Query('leaseTermType') leaseTermType: any, @CurrentUser() user: any) {
    return this.crmService.getPipeline(limit ? +limit : 100, await this.scope(user, mallId), leaseTermType);
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
  async moveLead(
    @Param('id') id: string,
    @Body() body: { status: LeadStatus; position: number },
    @CurrentUser() user: any,
  ) {
    await this.crmService.assertLeadAccess(id, await this.scope(user));
    return this.crmService.moveLead(id, body.status, body.position, user?.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get CRM statistics' })
  async getStats(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    return this.crmService.getStats(await this.scope(user, mallId));
  }

  @Get('leads/:id/timeline')
  @ApiOperation({ summary: 'Deal timeline: lead → booking → proposal → approval → contract' })
  async getLeadTimeline(@Param('id') id: string, @CurrentUser() user: any) {
    await this.crmService.assertLeadAccess(id, await this.scope(user));
    return this.crmService.getLeadTimeline(id);
  }

  @Get('leads/:id')
  @ApiOperation({ summary: 'Get lead details' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    await this.crmService.assertLeadAccess(id, await this.scope(user));
    return this.crmService.findOne(id);
  }

  @Post('leads')
  @ApiOperation({ summary: 'Create new lead' })
  async create(@Body() dto: CreateLeadDto, @CurrentUser() user: any) {
    if (dto.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, dto.mallId);
    const payload = user.role === Role.LEASING_EXECUTIVE ? { ...dto, assignedToId: user.id } : dto;
    return this.crmService.create(payload);
  }

  @Put('leads/:id')
  @ApiOperation({ summary: 'Update lead' })
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: any) {
    await this.crmService.assertLeadAccess(id, await this.scope(user));
    return this.crmService.update(id, dto, user?.id);
  }

  @Delete('leads/:id')
  @Roles(Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR)
  @ApiOperation({ summary: 'Delete lead' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.crmService.assertLeadAccess(id, await this.scope(user));
    return this.crmService.remove(id);
  }

  @Post('leads/:id/activities')
  @ApiOperation({ summary: 'Add activity to lead' })
  async addActivity(
    @Param('id') id: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: any,
  ) {
    await this.crmService.assertLeadAccess(id, await this.scope(user));
    return this.crmService.addActivity(id, dto, user.id);
  }

  @Post('leads/:id/customer-profile')
  @ApiOperation({ summary: 'Create a customer profile from a lead, or return the linked profile' })
  async createCustomerProfile(@Param('id') id: string, @CurrentUser() user: any) {
    await this.crmService.assertLeadAccess(id, await this.scope(user));
    return this.crmService.createCustomerProfile(id, user.id);
  }

  @Post('leads/:id/sync-customer')
  @ApiOperation({ summary: 'Link a lead and copy its information to a customer profile' })
  async syncLeadToCustomer(
    @Param('id') id: string,
    @Body('customerId') customerId: string,
    @CurrentUser() user: any,
  ) {
    await this.crmService.assertLeadAccess(id, await this.scope(user));
    return this.crmService.syncLeadToCustomer(id, customerId);
  }

  // ── Follow-ups ───────────────────────────────────────────────────────────────

  @Get('follow-ups')
  @ApiOperation({ summary: 'List follow-ups — for current user by default, or all on a lead when leadId is given' })
  @ApiQuery({ name: 'leadId', required: false })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'isDone', required: false })
  @ApiQuery({ name: 'daysAhead', required: false })
  @ApiQuery({ name: 'scope', required: false, enum: ['mine', 'team'] })
  @ApiQuery({ name: 'mallId', required: false })
  async listFollowUps(@Query() query: any, @CurrentUser() user: any) {
    const canViewTeam = [Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR].includes(user.role);
    const teamScope = query.scope === 'team' && canViewTeam;
    const assignedToId = query.assignedToId ?? (query.leadId || teamScope ? undefined : user.id);
    return this.crmService.listFollowUps({ ...query, assignedToId, scope: await this.scope(user, query.mallId) });
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
  async bulkAction(@Body() dto: any, @CurrentUser() user: any) {
    const scope = await this.scope(user);
    await Promise.all((dto.leadIds ?? []).map((id: string) => this.crmService.assertLeadAccess(id, scope)));
    if (['assign', 'delete'].includes(dto.action) && ![Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR].includes(user.role)) {
      throw new ForbiddenException('Only CRM managers can assign or delete leads in bulk');
    }
    return this.crmService.bulkAction(dto, user.id);
  }

  // ── Pipeline Analytics ─────────────────────────────────────────────────────────

  @Get('pipeline/stats')
  @ApiOperation({ summary: 'Get pipeline analytics (conversion rates, win/loss, etc.)' })
  @ApiQuery({ name: 'mallId', required: false })
  async getPipelineStats(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId ? [mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.crmService.getPipelineStats({ userId: user.id, role: user.role, mallIds: mallIds ?? undefined });
  }

  // ── Stale Leads ────────────────────────────────────────────────────────────────

  @Get('stale-leads')
  @ApiOperation({ summary: 'Get stale leads (no activity for X days)' })
  @ApiQuery({ name: 'days', required: false, description: 'Days without activity (default 14)' })
  @ApiQuery({ name: 'mallId', required: false })
  async getStaleLeads(@Query('days') days: string | undefined, @Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    return this.crmService.getStaleLeads(days ? +days : 14, await this.scope(user, mallId));
  }

  // ── Auto Actions ───────────────────────────────────────────────────────────────

  @Post('leads/auto-move-stale')
  @Roles(Role.ADMIN, Role.LEASING_MANAGER)
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
