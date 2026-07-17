import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Res, Headers } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { BillingScheduleService } from './billing-schedule.service';
import { ArDunningService } from './ar-dunning.service';
import { PenaltyInterestService } from './penalty-interest.service';
import { CollectionKpiService } from './collection-kpi.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InvoiceStatus } from '@prisma/client';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { AddInvoiceLineDto, CreateInvoiceDto, UpdateInvoiceLineDto } from './dto/invoice.dto';

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
  ) {}

  @Get('invoices')
  @ApiOperation({ summary: 'List invoices' })
  @ApiQuery({ name: 'status', required: false, enum: InvoiceStatus })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.billingService.findAllInvoices(query, user);
  }

  @Get('invoices/export')
  @ApiOperation({ summary: 'Export invoices as CSV' })
  @Roles(...MODULE_ROLES.billingStaff)
  @ApiQuery({ name: 'status', required: false, enum: InvoiceStatus })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'search', required: false })
  async exportCsv(@Query() query: any, @Res() res: Response) {
    const csv = await this.billingService.exportInvoicesCsv(query);
    const filename = `invoices_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv);
  }

  @Get('ar-aging')
  @ApiOperation({ summary: 'Get AR aging report' })
  @Roles(...MODULE_ROLES.billingStaff)
  getArAging() {
    return this.billingService.getArAging();
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice details' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.billingService.findOneInvoice(id, user);
  }

  @Post('invoices')
  @ApiOperation({ summary: 'Create invoice' })
  @Roles(...MODULE_ROLES.billingStaff)
  create(@Body() dto: CreateInvoiceDto) {
    return this.billingService.createInvoice(dto);
  }

  @Post('invoices/:id/issue')
  @ApiOperation({ summary: 'Issue invoice (DRAFT → ISSUED)' })
  @Roles(...MODULE_ROLES.billingStaff)
  issue(@Param('id') id: string) {
    return this.billingService.issueInvoice(id);
  }

  // ── Invoice Line Management (Operations adds variable costs) ──────────────

  @Post('invoices/:id/lines')
  @ApiOperation({ summary: 'Add variable cost line to DRAFT invoice (electricity, water, services)' })
  @Roles(...MODULE_ROLES.billingStaff)
  addLine(@Param('id') id: string, @Body() dto: AddInvoiceLineDto) {
    return this.billingService.addInvoiceLine(id, dto);
  }

  @Patch('invoices/:id/lines/:lineId')
  @ApiOperation({ summary: 'Update an invoice line (qty, price, description)' })
  @Roles(...MODULE_ROLES.billingStaff)
  updateLine(@Param('id') id: string, @Param('lineId') lineId: string, @Body() dto: UpdateInvoiceLineDto) {
    return this.billingService.updateInvoiceLine(id, lineId, dto);
  }

  @Delete('invoices/:id/lines/:lineId')
  @ApiOperation({ summary: 'Remove a variable cost line from DRAFT invoice' })
  @Roles(...MODULE_ROLES.billingStaff)
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.billingService.removeInvoiceLine(id, lineId);
  }

  @Get('invoices/:id/summary')
  @ApiOperation({ summary: 'Get invoice with payment summary (balance, totalPaid)' })
  @Roles(...MODULE_ROLES.billingStaff)
  getSummary(@Param('id') id: string) {
    return this.billingService.getInvoiceSummary(id);
  }

  @Post('invoices/:id/payment')
  @ApiOperation({ summary: 'Record payment for invoice' })
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.billingService.recordPayment(id, {
      ...dto,
      idempotencyKey: idempotencyKey || dto.idempotencyKey,
    }, user);
  }

  @Post('invoices/:id/void')
  @ApiOperation({ summary: 'Void/cancel an invoice (requires no active payments; reason mandatory)' })
  @Roles(...MODULE_ROLES.billingStaff)
  voidInvoice(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: any) {
    return this.billingService.voidInvoice(id, reason, user.id);
  }

  @Post('payments/:id/reverse')
  @ApiOperation({ summary: 'Reverse a payment entry (reason mandatory) — recomputes invoice status' })
  @Roles(...MODULE_ROLES.billingStaff)
  reversePayment(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: any) {
    return this.billingService.reversePayment(id, reason, user.id);
  }

  @Get('schedule/:contractId')
  @ApiOperation({ summary: 'Get billing schedule for contract' })
  @Roles(...MODULE_ROLES.billingStaff)
  getSchedule(@Param('contractId') contractId: string) {
    return this.billingScheduleService.getSchedule(contractId);
  }

  @Post('schedule/:contractId/build')
  @ApiOperation({ summary: 'Build or refresh billing schedule from contract' })
  @Roles(...MODULE_ROLES.billingStaff)
  buildSchedule(@Param('contractId') contractId: string) {
    return this.billingScheduleService.buildScheduleForContract(contractId);
  }

  @Post('schedule/generate-due')
  @ApiOperation({ summary: 'Generate draft invoices for due billing periods' })
  @Roles(...MODULE_ROLES.billingStaff)
  generateDueInvoices() {
    return this.billingScheduleService.generateDueInvoices(new Date());
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
  runDunning() {
    return this.arDunningService.runDunning(new Date());
  }

  @Get('collection-kpi')
  @ApiOperation({ summary: 'Collection KPI dashboard data' })
  @Roles(...MODULE_ROLES.billingStaff)
  getCollectionKpi(@Query('months') months?: number) {
    return this.collectionKpiService.getKpis(months ? +months : 6);
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
  runPenalty() {
    return this.penaltyService.runPenaltyCalculation(new Date());
  }

  @Post('revenue-share/calculate')
  @ApiOperation({ summary: 'Calculate and create revenue share invoices for a period' })
  @Roles(...MODULE_ROLES.billingStaff)
  calculateRevenueShare(@Body() body: { period: string; mallId?: string }) {
    return this.billingService.calculateRevenueShare(body.period, body.mallId);
  }

  @Get('config')
  @ApiOperation({ summary: 'Get billing configuration' })
  @Roles(...MODULE_ROLES.billingStaff)
  getBillingConfig() {
    return this.billingScheduleService.getConfig();
  }

  @Post('config')
  @ApiOperation({ summary: 'Update billing configuration' })
  @Roles(...MODULE_ROLES.billingStaff)
  updateBillingConfig(@Body() body: { autoIssueInvoices?: boolean; notifyTenantOnIssue?: boolean }) {
    return this.billingScheduleService.updateConfig(body);
  }

  @Get('dunning/logs/:invoiceId')
  @ApiOperation({ summary: 'Dunning log history for invoice' })
  @Roles(...MODULE_ROLES.billingStaff)
  getDunningLogs(@Param('invoiceId') invoiceId: string) {
    return this.arDunningService.getLogsForInvoice(invoiceId);
  }
}
