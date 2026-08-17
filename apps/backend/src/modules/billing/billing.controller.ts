import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Res, Headers, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { BillingScheduleService } from './billing-schedule.service';
import { ArDunningService } from './ar-dunning.service';
import { PenaltyInterestService } from './penalty-interest.service';
import { CollectionKpiService } from './collection-kpi.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InvoiceAdjustmentType, InvoiceStatus, Role } from '@prisma/client';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { AddInvoiceLineDto, CreateInvoiceDto, UpdateInvoiceLineDto } from './dto/invoice.dto';
import { MallAccessService } from '../../common/services/mall-access.service';

@ApiTags('Billing & AR')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.billing)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly billingScheduleService: BillingScheduleService,
    private readonly arDunningService: ArDunningService,
    private readonly penaltyService: PenaltyInterestService,
    private readonly collectionKpiService: CollectionKpiService,
    private readonly mallAccess: MallAccessService,
  ) {}

  @Get('invoices')
  @ApiOperation({ summary: 'List invoices' })
  @ApiQuery({ name: 'status', required: false, enum: InvoiceStatus })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: any, @CurrentUser() user: any) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const mallIds = query.mallId ? [query.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.billingService.findAllInvoices(query, user, mallIds ?? undefined);
  }

  @Get('receivables/pending')
  @ApiOperation({ summary: 'List contract receivables waiting for invoice creation' })
  @Roles(...MODULE_ROLES.billingStaff)
  async getPendingReceivables(@Query() query: any, @CurrentUser() user: any) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const mallIds = query.mallId ? [query.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.billingService.getPendingReceivables(query, mallIds ?? undefined);
  }

  @Post('receivables/pending/:sourceType/:id/create-invoice')
  @ApiOperation({ summary: 'Create a draft invoice from a pending contract receivable' })
  @Roles(...MODULE_ROLES.billingStaff)
  async createInvoiceFromPending(
    @Param('sourceType') sourceType: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    const mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.billingService.createInvoiceFromPending(sourceType, id, user.id, mallIds ?? undefined);
  }

  @Post('receivables/pending/create-due-invoices')
  @ApiOperation({ summary: 'Create draft invoices for due contract receivables in the current filter' })
  @Roles(...MODULE_ROLES.billingStaff)
  async createDueInvoicesFromPending(@Body() body: any, @CurrentUser() user: any) {
    if (body.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, body.mallId);
    const mallIds = body.mallId ? [body.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.billingService.createDueInvoicesFromPending(body, user.id, mallIds ?? undefined);
  }

  @Get('invoices/export')
  @ApiOperation({ summary: 'Export invoices as CSV' })
  @Roles(...MODULE_ROLES.billingStaff)
  @ApiQuery({ name: 'status', required: false, enum: InvoiceStatus })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'search', required: false })
  async exportExcel(@Query() query: any, @CurrentUser() user: any, @Res() res: Response) {
    if (query.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    const mallIds = query.mallId ? [query.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    const workbook = await this.billingService.exportInvoicesExcel(query, mallIds ?? undefined);
    const filename = `invoices_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(workbook));
  }

  @Get('ar-aging')
  @ApiOperation({ summary: 'Get AR aging report' })
  @Roles(...MODULE_ROLES.billingStaff)
  async getArAging(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId ? [mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.billingService.getArAging(mallIds ?? undefined);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice details' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.findOneInvoice(id, user);
  }

  @Post('invoices')
  @ApiOperation({ summary: 'Create invoice' })
  @Roles(...MODULE_ROLES.billingStaff)
  async create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { contractId: dto.contractId });
    return this.billingService.createInvoice(dto);
  }

  @Post('invoices/:id/issue')
  @ApiOperation({ summary: 'Issue invoice (DRAFT → ISSUED)' })
  @Roles(...MODULE_ROLES.billingStaff)
  async issue(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.issueInvoice(id);
  }

  // ── Invoice Line Management (Operations adds variable costs) ──────────────

  @Post('invoices/:id/lines')
  @ApiOperation({ summary: 'Add variable cost line to DRAFT invoice (electricity, water, services)' })
  @Roles(...MODULE_ROLES.billingStaff)
  async addLine(@Param('id') id: string, @Body() dto: AddInvoiceLineDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.addInvoiceLine(id, dto);
  }

  @Patch('invoices/:id/lines/:lineId')
  @ApiOperation({ summary: 'Update an invoice line (qty, price, description)' })
  @Roles(...MODULE_ROLES.billingStaff)
  async updateLine(@Param('id') id: string, @Param('lineId') lineId: string, @Body() dto: UpdateInvoiceLineDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.updateInvoiceLine(id, lineId, dto);
  }

  @Delete('invoices/:id/lines/:lineId')
  @ApiOperation({ summary: 'Remove a variable cost line from DRAFT invoice' })
  @Roles(...MODULE_ROLES.billingStaff)
  async removeLine(@Param('id') id: string, @Param('lineId') lineId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.removeInvoiceLine(id, lineId);
  }

  @Get('invoices/:id/summary')
  @ApiOperation({ summary: 'Get invoice with payment summary (balance, totalPaid)' })
  async getSummary(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.getInvoiceSummary(id, user);
  }

  @Post('invoices/:id/payment')
  @ApiOperation({ summary: 'Record payment for invoice' })
  @Roles(...MODULE_ROLES.billingStaff)
  async recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.recordPayment(id, {
      ...dto,
      idempotencyKey: idempotencyKey || dto.idempotencyKey,
    }, user);
  }

  @Post('invoices/:id/void')
  @ApiOperation({ summary: 'Void/cancel an invoice (requires no active payments; reason mandatory)' })
  @Roles(...MODULE_ROLES.billingStaff)
  async voidInvoice(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.voidInvoice(id, reason, user.id);
  }

  @Post('payments/:id/reverse')
  @ApiOperation({ summary: 'Reverse a payment entry (reason mandatory) — recomputes invoice status' })
  @Roles(...MODULE_ROLES.billingStaff)
  async reversePayment(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { paymentId: id });
    return this.billingService.reversePayment(id, reason, user.id);
  }

  @Get('invoices/:id/documents')
  @ApiOperation({ summary: 'List invoice source documents and legal e-invoice files' })
  async listDocuments(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.listInvoiceDocuments(id);
  }

  @Post('invoices/:id/documents')
  @ApiOperation({ summary: 'Upload supporting document for invoice' })
  @ApiConsumes('multipart/form-data')
  @Roles(...MODULE_ROLES.billingStaff)
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body('documentType') documentType: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.uploadInvoiceDocument(id, file, user.id, documentType);
  }

  @Post('invoices/:id/e-invoice/request')
  @ApiOperation({ summary: 'Queue an issued invoice for electronic invoicing' })
  @Roles(...MODULE_ROLES.billingStaff)
  async requestElectronicInvoice(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.requestElectronicInvoice(id);
  }

  @Post('invoices/:id/e-invoice/complete')
  @ApiOperation({ summary: 'Record electronic invoice provider result' })
  @Roles(Role.ADMIN, Role.FINANCE)
  async completeElectronicInvoice(@Param('id') id: string, @Body() body: { success: boolean; reference?: string; legalInvoiceNumber?: string; error?: string }, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.completeElectronicInvoice(id, body);
  }

  @Post('invoices/:id/adjustments')
  @ApiOperation({ summary: 'Create credit/debit note, write-off or refund adjustment' })
  @Roles(...MODULE_ROLES.billingStaff)
  async createAdjustment(
    @Param('id') id: string,
    @Body() body: { type: InvoiceAdjustmentType; amount: number; reason: string; reference?: string },
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: id });
    return this.billingService.createInvoiceAdjustment(id, body, user.id);
  }

  @Post('adjustments/:id/cancel')
  @ApiOperation({ summary: 'Cancel an approved invoice adjustment' })
  @Roles(...MODULE_ROLES.billingStaff)
  async cancelAdjustment(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceAdjustmentId: id });
    return this.billingService.cancelInvoiceAdjustment(id, reason, user.id);
  }

  @Get('schedule/:contractId')
  @ApiOperation({ summary: 'Get billing schedule for contract' })
  @Roles(...MODULE_ROLES.billingStaff)
  async getSchedule(@Param('contractId') contractId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { contractId });
    return this.billingScheduleService.getSchedule(contractId);
  }

  @Post('schedule/:contractId/build')
  @ApiOperation({ summary: 'Build or refresh billing schedule from contract' })
  @Roles(...MODULE_ROLES.billingStaff)
  async buildSchedule(@Param('contractId') contractId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { contractId });
    return this.billingScheduleService.buildScheduleForContract(contractId);
  }

  @Post('schedule/generate-due')
  @ApiOperation({ summary: 'Generate draft invoices for due billing periods' })
  @Roles(...MODULE_ROLES.billingStaff)
  async generateDueInvoices(@CurrentUser() user: any) {
    const mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.billingScheduleService.generateDueInvoices(new Date(), mallIds ?? undefined);
  }

  @Get('dunning/policies')
  @ApiOperation({ summary: 'List AR dunning policies' })
  @Roles(...MODULE_ROLES.billingStaff)
  listDunningPolicies() {
    return this.arDunningService.listPolicies();
  }

  @Post('dunning/run')
  @ApiOperation({ summary: 'Run AR dunning process manually' })
  @Roles(...MODULE_ROLES.billingStaff)
  async runDunning(@CurrentUser() user: any) {
    const mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.arDunningService.runDunning(new Date(), mallIds ?? undefined);
  }

  @Get('collection-kpi')
  @ApiOperation({ summary: 'Collection KPI dashboard data' })
  @Roles(...MODULE_ROLES.billingStaff)
  async getCollectionKpi(@Query('months') months: number | undefined, @Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
    const mallIds = mallId ? [mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.collectionKpiService.getKpis(months ? +months : 6, mallIds ?? undefined);
  }

  @Get('penalty/policies')
  @ApiOperation({ summary: 'List penalty interest policies' })
  @Roles(...MODULE_ROLES.billingStaff)
  listPenaltyPolicies() {
    return this.penaltyService.listPolicies();
  }

  @Post('penalty/run')
  @ApiOperation({ summary: 'Calculate and create penalty invoices' })
  @Roles(...MODULE_ROLES.billingStaff)
  async runPenalty(@CurrentUser() user: any) {
    const mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.penaltyService.runPenaltyCalculation(new Date(), mallIds ?? undefined);
  }

  @Post('revenue-share/calculate')
  @ApiOperation({ summary: 'Calculate and create revenue share invoices for a period' })
  @Roles(...MODULE_ROLES.billingStaff)
  async calculateRevenueShare(@Body() body: { period: string; mallId?: string }, @CurrentUser() user: any) {
    if (body.mallId) await this.mallAccess.assertMallAccess(user.id, user.role, body.mallId);
    const mallIds = body.mallId ? [body.mallId] : await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    return this.billingService.calculateRevenueShare(body.period, mallIds ?? undefined);
  }

  @Get('config')
  @ApiOperation({ summary: 'Get billing configuration' })
  @Roles(...MODULE_ROLES.billingStaff)
  getBillingConfig() {
    return this.billingScheduleService.getConfig();
  }

  @Post('config')
  @ApiOperation({ summary: 'Update billing configuration' })
  @Roles(Role.ADMIN)
  updateBillingConfig(@Body() body: { autoIssueInvoices?: boolean; notifyTenantOnIssue?: boolean }) {
    return this.billingScheduleService.updateConfig(body);
  }

  @Get('dunning/logs/:invoiceId')
  @ApiOperation({ summary: 'Dunning log history for invoice' })
  @Roles(...MODULE_ROLES.billingStaff)
  async getDunningLogs(@Param('invoiceId') invoiceId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId });
    return this.arDunningService.getLogsForInvoice(invoiceId);
  }
}
