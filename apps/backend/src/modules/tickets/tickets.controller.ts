import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { TicketSlaService } from './ticket-sla.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TicketStatus, TicketPriority, TicketType, Role } from '@prisma/client';

@ApiTags('Tickets')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.tickets)
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly slaService: TicketSlaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List operation tickets' })
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus })
  @ApiQuery({ name: 'priority', required: false, enum: TicketPriority })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.ticketsService.findAll(query, user);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get ticket statistics' })
  getStats() {
    return this.ticketsService.getStats();
  }

  // Route đơn segment ('maintenance') PHẢI khai báo trước ':id' — nếu không Nest/Express sẽ khớp
  // ':id' trước (coi 'maintenance' là một ticket id) và route thật bên dưới không bao giờ được gọi tới.
  @Get('maintenance')
  @ApiOperation({ summary: 'List maintenance schedules' })
  @ApiQuery({ name: 'mallId', required: false })
  listMaintenance(@Query() query: any) {
    return this.ticketsService.listMaintenance(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket details' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create ticket (staff tạo phiếu kiểm tra, hoặc tenant tự gửi yêu cầu)' })
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.create(dto, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update ticket fields (không đổi status — dùng PATCH :id/status)' })
  update(@Param('id') id: string, @Body() data: any, @CurrentUser() user: any) {
    return this.ticketsService.update(id, data, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition ticket status theo state machine' })
  transition(@Param('id') id: string, @Body('status') status: TicketStatus, @CurrentUser() user: any) {
    return this.ticketsService.transition(id, status, user);
  }

  @Put(':id/assign')
  @ApiOperation({ summary: 'Assign ticket to user' })
  assign(@Param('id') id: string, @Body('userId') userId: string, @CurrentUser() user: any) {
    return this.ticketsService.assign(id, userId, user);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add comment to ticket' })
  addComment(
    @Param('id') id: string,
    @Body('text') text: string,
    @Body('isInternal') isInternal: boolean,
    @CurrentUser() user: any,
  ) {
    return this.ticketsService.addComment(id, user.id, text, isInternal, user);
  }

  @Get(':id/photos')
  @ApiOperation({ summary: 'List inspection photos of a ticket' })
  listPhotos(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.listPhotos(id, user);
  }

  @Post(':id/photos')
  @ApiOperation({ summary: 'Upload an inspection photo to a ticket' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
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
  createMaintenance(@Body() dto: any, @CurrentUser() user: any) {
    return this.ticketsService.createMaintenance(dto, user.id);
  }

  @Put('maintenance/:id')
  @ApiOperation({ summary: 'Update maintenance schedule' })
  updateMaintenance(@Param('id') id: string, @Body() dto: any) {
    return this.ticketsService.updateMaintenance(id, dto);
  }

  @Put('maintenance/:id/execute')
  @ApiOperation({ summary: 'Mark maintenance as executed (updates nextDueDate)' })
  executeMaintenance(@Param('id') id: string) {
    return this.ticketsService.executeMaintenance(id);
  }
}
