import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SapService } from './sap.service';
import { SapReconciliationService } from './sap-reconciliation.service';
import { SapEntityMappingService } from './sap-entity-mapping.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { SapStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MallAccessService } from '../../common/services/mall-access.service';

@ApiTags('SAP Integration')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.sap)
@Controller('sap')
export class SapController {
  constructor(
    private readonly sapService: SapService,
    private readonly reconciliationService: SapReconciliationService,
    private readonly mappingService: SapEntityMappingService,
    private readonly mallAccess: MallAccessService,
  ) {}

  @Get('logs')
  @ApiOperation({ summary: 'Get SAP integration logs' })
  @ApiQuery({ name: 'status', required: false, enum: SapStatus })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getLogs(@Query() query: any) {
    return this.sapService.getLogs(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get SAP sync statistics' })
  getStats() {
    return this.sapService.getStats();
  }

  @Post('sync/customer')
  @ApiOperation({ summary: 'Sync tenant to SAP as customer' })
  syncCustomer(@Body('tenantId') tenantId: string) {
    return this.sapService.syncCustomer(tenantId);
  }

  @Post('sync/invoice')
  @ApiOperation({ summary: 'Sync invoice to SAP FI' })
  async syncInvoice(@Body('invoiceId') invoiceId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId });
    return this.sapService.syncInvoice(invoiceId);
  }

  @Get('reconciliation')
  @ApiOperation({ summary: 'List SAP reconciliation records' })
  @ApiQuery({ name: 'status', required: false })
  listReconciliation(@Query() query: any) {
    return this.reconciliationService.listRecords(query);
  }

  @Post('reconciliation/run')
  @ApiOperation({ summary: 'Run SAP reconciliation with idempotency' })
  runReconciliation() {
    return this.reconciliationService.reconcilePending();
  }

  // ── Entity Mapping ─────────────────────────────────────────────────────────
  @Get('mappings')
  @ApiOperation({ summary: 'List SAP entity mappings' })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'syncStatus', required: false })
  @ApiQuery({ name: 'page', required: false })
  listMappings(@Query() query: any) {
    return this.mappingService.listMappings(query);
  }

  @Get('mappings/summary')
  @ApiOperation({ summary: 'Summary of mapping sync status by entity type' })
  getMappingSummary() {
    return this.mappingService.getSummary();
  }

  @Get('mappings/:entityType/:entityId')
  @ApiOperation({ summary: 'Get SAP mapping for a specific entity' })
  getMapping(@Param('entityType') entityType: any, @Param('entityId') entityId: string) {
    return this.mappingService.getMapping(entityType, entityId);
  }

  @Post('mappings')
  @ApiOperation({ summary: 'Upsert SAP entity mapping' })
  upsertMapping(@Body() dto: any) {
    return this.mappingService.upsertMapping(dto);
  }

  @Post('mappings/sync-pending')
  @ApiOperation({ summary: 'Retry all pending/failed mappings' })
  syncPending() {
    return this.mappingService.syncPending(this.sapService);
  }
}
