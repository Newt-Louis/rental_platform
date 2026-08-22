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
import { Scope, SystemInternalScope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';

// CR-101 Phase 1: descriptive only. This controller is genuinely mixed --
// syncInvoice already validates correctly; syncCustomer has an identical
// resolver available (`tenant`) but doesn't call it (a clear, newly-found gap,
// not a BC question). The list/stats/mapping routes have no obvious
// single-entity Mall to resolve and no documented policy on whether FINANCE's
// SAP visibility should be Mall-restricted or intentionally platform-wide --
// flagged PENDING_BUSINESS_CONFIRMATION rather than guessed. See
// docs/architecture-review/15-CR-101-ROUTE-COVERAGE.md group B.
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
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.PENDING_BUSINESS_CONFIRMATION, trackedAs: 'FINANCE cross-mall SAP visibility policy unclear' })
  getLogs(@Query() query: any) {
    return this.sapService.getLogs(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get SAP sync statistics' })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.PENDING_BUSINESS_CONFIRMATION, trackedAs: 'FINANCE cross-mall SAP visibility policy unclear' })
  getStats() {
    return this.sapService.getStats();
  }

  @Post('sync/customer')
  @ApiOperation({ summary: 'Sync tenant to SAP as customer' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'body', key: 'tenantId', resolver: 'tenant' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async syncCustomer(@Body('tenantId') tenantId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { tenantId });
    return this.sapService.syncCustomer(tenantId);
  }

  @Post('sync/invoice')
  @ApiOperation({ summary: 'Sync invoice to SAP FI' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'body', key: 'invoiceId', resolver: 'invoice' }, status: EnforcementStatus.ENFORCED })
  async syncInvoice(@Body('invoiceId') invoiceId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId });
    return this.sapService.syncInvoice(invoiceId);
  }

  @Get('reconciliation')
  @ApiOperation({ summary: 'List SAP reconciliation records' })
  @ApiQuery({ name: 'status', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.PENDING_BUSINESS_CONFIRMATION, trackedAs: 'FINANCE cross-mall SAP visibility policy unclear' })
  listReconciliation(@Query() query: any) {
    return this.reconciliationService.listRecords(query);
  }

  @Post('reconciliation/run')
  @ApiOperation({ summary: 'Run SAP reconciliation with idempotency' })
  @SystemInternalScope('Manual trigger for what is otherwise a system-wide reconciliation batch job (see docs/system-truth/09-EVENT-CATALOG.md); not a single-Mall operation')
  runReconciliation() {
    return this.reconciliationService.reconcilePending();
  }

  // ── Entity Mapping ─────────────────────────────────────────────────────────
  @Get('mappings')
  @ApiOperation({ summary: 'List SAP entity mappings' })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'syncStatus', required: false })
  @ApiQuery({ name: 'page', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.PENDING_BUSINESS_CONFIRMATION, trackedAs: 'FINANCE cross-mall SAP visibility policy unclear' })
  listMappings(@Query() query: any) {
    return this.mappingService.listMappings(query);
  }

  @Get('mappings/summary')
  @ApiOperation({ summary: 'Summary of mapping sync status by entity type' })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.PENDING_BUSINESS_CONFIRMATION, trackedAs: 'FINANCE cross-mall SAP visibility policy unclear' })
  getMappingSummary() {
    return this.mappingService.getSummary();
  }

  @Get('mappings/:entityType/:entityId')
  @ApiOperation({ summary: 'Get SAP mapping for a specific entity' })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.PENDING_BUSINESS_CONFIRMATION, trackedAs: 'entity-based resolver technically possible (dispatch by entityType) but blocked on the same FINANCE visibility policy question' })
  getMapping(@Param('entityType') entityType: any, @Param('entityId') entityId: string) {
    return this.mappingService.getMapping(entityType, entityId);
  }

  @Post('mappings')
  @ApiOperation({ summary: 'Upsert SAP entity mapping' })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.PENDING_BUSINESS_CONFIRMATION, trackedAs: 'FINANCE cross-mall SAP visibility policy unclear' })
  upsertMapping(@Body() dto: any) {
    return this.mappingService.upsertMapping(dto);
  }

  @Post('mappings/sync-pending')
  @ApiOperation({ summary: 'Retry all pending/failed mappings' })
  @SystemInternalScope('Batch retry across all pending/failed mappings platform-wide; not a single-Mall operation')
  syncPending() {
    return this.mappingService.syncPending(this.sapService);
  }
}
