import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { TicketSlaService } from './ticket-sla.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TicketStatus, TicketPriority, TicketType, Role } from '@prisma/client';
import { MallAccessService } from '../../common/services/mall-access.service';

@ApiTags('Tickets')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.tickets)
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly slaService: TicketSlaService,
    private readonly mallAccess: MallAccessService,
  ) {}

  private validateTicket(user: any, ticketId: string) {
    return this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { ticketId });
  }

  @Get()
  @ApiOperation({ summary: 'List operation tickets' })
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus })
  @ApiQuery({ name: 'priority', required: false, enum: TicketPriority })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'queue', required: false, enum: ['open', 'unassigned', 'overdue', 'mine'] })
  async findAll(@Query() query: any, @CurrentUser() user: any) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const mallIds = query.mallId ? [query.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.ticketsService.findAll({ ...query, mallIds: mallIds ?? undefined }, user);
  }

  @Get('my-units')
  @Roles(Role.TENANT)
  @ApiOperation({ summary: 'List occupied units of the authenticated tenant' })
  listMyUnits(@CurrentUser() user: any) {
    return this.ticketsService.listMyUnits(user);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get ticket statistics' })
  @ApiQuery({ name: 'mallId', required: false })
  async getStats(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId ? [mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.ticketsService.getStats(mallIds ?? undefined, user);
  }

  // Route đơn segment ('maintenance') PHẢI khai báo trước ':id' — nếu không Nest/Express sẽ khớp
  // ':id' trước (coi 'maintenance' là một ticket id) và route thật bên dưới không bao giờ được gọi tới.
  @Get('maintenance')
  @ApiOperation({ summary: 'List maintenance schedules' })
  @ApiQuery({ name: 'mallId', required: false })
  async listMaintenance(@Query() query: any, @CurrentUser() user: any) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const mallIds = query.mallId ? [query.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.ticketsService.listMaintenance({ ...query, mallIds: mallIds ?? undefined });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket details' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateTicket(user, id);
    return this.ticketsService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create ticket (staff tạo phiếu kiểm tra, hoặc tenant tự gửi yêu cầu)' })
  async create(@Body() dto: CreateTicketDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { unitId: dto.unitId });
    return this.ticketsService.create(dto, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update ticket fields (không đổi status — dùng PATCH :id/status)' })
  async update(@Param('id') id: string, @Body() data: any, @CurrentUser() user: any) {
    await this.validateTicket(user, id);
    return this.ticketsService.update(id, data, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition ticket status theo state machine' })
  async transition(@Param('id') id: string, @Body('status') status: TicketStatus, @CurrentUser() user: any) {
    await this.validateTicket(user, id);
    return this.ticketsService.transition(id, status, user);
  }

  @Put(':id/assign')
  @ApiOperation({ summary: 'Assign ticket to user' })
  async assign(@Param('id') id: string, @Body('userId') userId: string, @CurrentUser() user: any) {
    await this.validateTicket(user, id);
    return this.ticketsService.assign(id, userId, user);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add comment to ticket' })
  async addComment(
    @Param('id') id: string,
    @Body('text') text: string,
    @Body('isInternal') isInternal: boolean,
    @CurrentUser() user: any,
  ) {
    await this.validateTicket(user, id);
    return this.ticketsService.addComment(id, user.id, text, isInternal, user);
  }

  @Get(':id/photos')
  @ApiOperation({ summary: 'List inspection photos of a ticket' })
  async listPhotos(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateTicket(user, id);
    return this.ticketsService.listPhotos(id, user);
  }

  @Post(':id/photos')
  @ApiOperation({ summary: 'Upload an inspection photo to a ticket' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    await this.validateTicket(user, id);
    return this.ticketsService.uploadPhoto(id, file, user.id, user);
  }

  @Get('sla/policies')
  @ApiOperation({ summary: 'List SLA policies' })
  listSlaPolicies() {
    return this.slaService.listPolicies();
  }

  @Post('sla/policies')
  @ApiOperation({ summary: 'Upsert SLA policy' })
  upsertSlaPolicy(@Body() body: {
    ticketType: TicketType;
    priority: TicketPriority;
    responseHours: number;
    resolutionHours: number;
    escalateToRole?: Role;
  }) {
    return this.slaService.upsertPolicy(body);
  }

  @Get('sla/stats')
  @ApiOperation({ summary: 'Get SLA compliance stats' })
  getSlaStats() {
    return this.slaService.getStats();
  }

  @Get(':id/escalations')
  @ApiOperation({ summary: 'Get ticket escalation history' })
  getEscalations(@Param('id') id: string) {
    return this.ticketsService.getEscalations(id);
  }

  @Post(':id/rate')
  @ApiOperation({ summary: 'Submit CSAT rating for closed ticket' })
  rateTicket(@Param('id') id: string, @Body() body: { rating: number; comment?: string }) {
    return this.ticketsService.rateTicket(id, body.rating, body.comment);
  }

  @Get(':id/rating')
  @ApiOperation({ summary: 'Get ticket rating' })
  getTicketRating(@Param('id') id: string) {
    return this.ticketsService.getTicketRating(id);
  }

  @Get('ratings/summary')
  @ApiOperation({ summary: 'CSAT summary stats' })
  getCsatSummary() {
    return this.ticketsService.getCsatSummary();
  }

  // ── Maintenance ──────────────────────────────────────────────────────────────

  @Post('maintenance')
  @ApiOperation({ summary: 'Create maintenance schedule' })
  async createMaintenance(@Body() dto: any, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { mallId: dto.mallId, unitId: dto.unitId });
    return this.ticketsService.createMaintenance(dto, user.id);
  }

  @Put('maintenance/:id')
  @ApiOperation({ summary: 'Update maintenance schedule' })
  async updateMaintenance(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { maintenanceScheduleId: id });
    return this.ticketsService.updateMaintenance(id, dto);
  }

  @Put('maintenance/:id/execute')
  @ApiOperation({ summary: 'Legacy route: start maintenance execution' })
  async executeMaintenance(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { maintenanceScheduleId: id });
    return this.ticketsService.startMaintenance(id, user.id);
  }

  @Post('maintenance/:id/start')
  @ApiOperation({ summary: 'Start current maintenance cycle' })
  async startMaintenance(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { maintenanceScheduleId: id });
    return this.ticketsService.startMaintenance(id, user.id);
  }

  @Post('maintenance/:id/complete')
  @UseInterceptors(FilesInterceptor('evidence', 10, { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Complete current maintenance cycle with evidence' })
  async completeMaintenance(@Param('id') id: string, @Body() body: any, @UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { maintenanceScheduleId: id });
    const checklistResult = body.checklistResult ? JSON.parse(body.checklistResult) : undefined;
    return this.ticketsService.completeMaintenance(id, user.id, { notes: body.notes, checklistResult }, files);
  }

  @Post('maintenance/reminders/run')
  @Roles(Role.ADMIN, Role.OPERATION, Role.MALL_DIRECTOR)
  @ApiOperation({ summary: 'Send due maintenance reminders' })
  sendMaintenanceReminders() {
    return this.ticketsService.sendMaintenanceReminders();
  }
}
