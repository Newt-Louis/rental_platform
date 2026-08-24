import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ServiceCatalogService, CreateCatalogItemDto, UpdateCatalogItemDto, ProposalServiceLineDto } from './service-catalog.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';
import { MallAccessService } from '../../common/services/mall-access.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// CR-101 Phase 1: descriptive only. Resolved group B (service-catalog) of the
// investigation this session -- see docs/architecture-review/15-CR-101-ROUTE-COVERAGE.md.
// Two distinct new gaps found: :id mutate/delete routes (item's own id, not the
// guard-recognized `mallId`), and the proposal/:proposalId routes.
@ApiTags('Service Catalog')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('service-catalog')
export class ServiceCatalogController {
  constructor(
    private readonly svc: ServiceCatalogService,
    private readonly mallAccess: MallAccessService,
  ) {}

  // ─── Catalog ──────────────────────────────────────────────────────────────

  @Get('mall/:mallId')
  @ApiOperation({ summary: 'Lấy danh mục dịch vụ theo mall' })
  @ApiQuery({ name: 'onlyActive', required: false, type: Boolean })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'param', key: 'mallId' }, status: EnforcementStatus.ENFORCED })
  getCatalog(
    @Param('mallId') mallId: string,
    @Query('onlyActive') onlyActive?: string,
  ) {
    return this.svc.getCatalog(mallId, onlyActive === 'true');
  }

  @Post('mall/:mallId')
  @ApiOperation({ summary: 'Tạo mục dịch vụ mới' })
  @Roles('ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR')
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'param', key: 'mallId' }, status: EnforcementStatus.ENFORCED })
  createItem(@Param('mallId') mallId: string, @Body() dto: CreateCatalogItemDto) {
    return this.svc.createCatalogItem(mallId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật mục dịch vụ' })
  @Roles('ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR')
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'servicePriceCatalog' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async updateItem(@Param('id') id: string, @Body() dto: UpdateCatalogItemDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { servicePriceCatalogId: id });
    return this.svc.updateCatalogItem(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Vô hiệu hoá mục dịch vụ' })
  @Roles('ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR')
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'servicePriceCatalog' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async deactivateItem(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { servicePriceCatalogId: id });
    return this.svc.deactivateCatalogItem(id);
  }

  // ─── Proposal Services ────────────────────────────────────────────────────

  @Get('proposal/:proposalId/services')
  @ApiOperation({ summary: 'Lấy danh sách dịch vụ của proposal' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'proposalId', resolver: 'serviceCatalogProposal' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async getProposalServices(@Param('proposalId') proposalId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { proposalId });
    return this.svc.getProposalServices(proposalId);
  }

  @Post('proposal/:proposalId/services/sync')
  @ApiOperation({ summary: 'Đồng bộ danh sách dịch vụ (replace toàn bộ)' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'proposalId', resolver: 'serviceCatalogProposal' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async syncProposalServices(
    @Param('proposalId') proposalId: string,
    @Body() body: { services: ProposalServiceLineDto[] },
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { proposalId });
    return this.svc.syncProposalServices(proposalId, body.services);
  }
}
