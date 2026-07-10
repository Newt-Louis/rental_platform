import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ServiceCatalogService, CreateCatalogItemDto, UpdateCatalogItemDto, ProposalServiceLineDto } from './service-catalog.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Service Catalog')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('service-catalog')
export class ServiceCatalogController {
  constructor(private readonly svc: ServiceCatalogService) {}

  // ─── Catalog ──────────────────────────────────────────────────────────────

  @Get('mall/:mallId')
  @ApiOperation({ summary: 'Lấy danh mục dịch vụ theo mall' })
  @ApiQuery({ name: 'onlyActive', required: false, type: Boolean })
  getCatalog(
    @Param('mallId') mallId: string,
    @Query('onlyActive') onlyActive?: string,
  ) {
    return this.svc.getCatalog(mallId, onlyActive === 'true');
  }

  @Post('mall/:mallId')
  @ApiOperation({ summary: 'Tạo mục dịch vụ mới' })
  @Roles('ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR')
  createItem(@Param('mallId') mallId: string, @Body() dto: CreateCatalogItemDto) {
    return this.svc.createCatalogItem(mallId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật mục dịch vụ' })
  @Roles('ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR')
  updateItem(@Param('id') id: string, @Body() dto: UpdateCatalogItemDto) {
    return this.svc.updateCatalogItem(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Vô hiệu hoá mục dịch vụ' })
  @Roles('ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR')
  deactivateItem(@Param('id') id: string) {
    return this.svc.deactivateCatalogItem(id);
  }

  // ─── Proposal Services ────────────────────────────────────────────────────

  @Get('proposal/:proposalId/services')
  @ApiOperation({ summary: 'Lấy danh sách dịch vụ của proposal' })
  getProposalServices(@Param('proposalId') proposalId: string) {
    return this.svc.getProposalServices(proposalId);
  }

  @Post('proposal/:proposalId/services/sync')
  @ApiOperation({ summary: 'Đồng bộ danh sách dịch vụ (replace toàn bộ)' })
  syncProposalServices(
    @Param('proposalId') proposalId: string,
    @Body() body: { services: ProposalServiceLineDto[] },
  ) {
    return this.svc.syncProposalServices(proposalId, body.services);
  }
}
