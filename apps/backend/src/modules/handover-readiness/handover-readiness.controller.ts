import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { EnforcementStatus, ScopeType } from '../../common/constants/scope.types';
import { HandoverReadinessService } from './handover-readiness.service';
import { HANDOVER_POLICY } from './handover-readiness.policy';
import {
  AddHandoverFollowerDto,
  AddHandoverRiskDto,
  ChangeHandoverTargetDateDto,
  ConfirmHandoverReadyDto,
  HandoverReasonDto,
  ResolveHandoverRiskDto,
  StartHandoverTrackingDto,
} from './dto/handover-readiness.dto';

/**
 * CR-UNIT-HANDOVER-READINESS. No @Roles/@ModuleRoles on purpose: authority is
 * the action-permission matrix (`handover-readiness-*`), enforced per request
 * in HandoverReadinessService via HandoverReadinessAccessService against the
 * record's OWN Mall. A Project user granted `handover-readiness-manage` must not
 * be blocked by an unrelated module gate, and no route here trusts a
 * client-supplied mallId for a mutation.
 */
const SERVICE_ENFORCED = 'CR-UNIT-HANDOVER-READINESS -- service-level: Mall resolved from UnitHandoverReadiness.mallId (or Unit.mallId) + handover-readiness-* action permission';

@ApiTags('Handover Readiness')
@ApiBearerAuth('JWT-auth')
@Controller()
export class HandoverReadinessController {
  constructor(private readonly service: HandoverReadinessService) {}

  // ─── Unit-scoped ───────────────────────────────────────────────────────────

  @Get('spaces/units/:unitId/handover-readiness')
  @ApiOperation({ summary: 'Theo dõi bàn giao MB hiện tại của mặt bằng (kèm quyền của người xem)' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'unitId', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  getForUnit(@Param('unitId') unitId: string, @CurrentUser() user: any) {
    return this.service.getForUnit(user, unitId);
  }

  @Post('spaces/units/:unitId/handover-readiness')
  @ApiOperation({ summary: 'Bắt đầu theo dõi đủ điều kiện bàn giao MB' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'unitId', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  start(@Param('unitId') unitId: string, @Body() dto: StartHandoverTrackingDto, @CurrentUser() user: any) {
    return this.service.start(user, unitId, dto);
  }

  @Get('spaces/units/:unitId/handover-readiness/candidates')
  @ApiOperation({ summary: 'Người dùng hợp lệ (cùng Mall) cho người theo dõi / đầu mối / phụ trách rủi ro' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'unitId', resolver: 'unit' }, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  candidates(@Param('unitId') unitId: string, @CurrentUser() user: any) {
    return this.service.candidates(user, unitId);
  }

  // ─── Mall analytics ────────────────────────────────────────────────────────

  @Get('handover-readiness')
  @ApiOperation({ summary: 'Danh sách + KPI theo dõi bàn giao MB (Mall-scoped)' })
  @ApiQuery({ name: 'mallId', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  list(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    return this.service.list(user, mallId);
  }

  // ─── Readiness-scoped ──────────────────────────────────────────────────────

  @Get('handover-readiness/:id')
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  detail(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.detail(user, id);
  }

  @Get('handover-readiness/:id/timeline')
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  timeline(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.timeline(user, id);
  }

  @Patch('handover-readiness/:id/target-date')
  @ApiOperation({ summary: 'Đổi ngày dự kiến bàn giao (bắt buộc lý do; ngày ban đầu không đổi)' })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  changeTargetDate(@Param('id') id: string, @Body() dto: ChangeHandoverTargetDateDto, @CurrentUser() user: any) {
    return this.service.changeTargetDate(user, id, dto);
  }

  @Post('handover-readiness/:id/risks')
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  addRisk(@Param('id') id: string, @Body() dto: AddHandoverRiskDto, @CurrentUser() user: any) {
    return this.service.addRisk(user, id, dto);
  }

  @Post('handover-readiness/:id/risks/:riskId/resolve')
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  resolveRisk(@Param('id') id: string, @Param('riskId') riskId: string, @Body() dto: ResolveHandoverRiskDto, @CurrentUser() user: any) {
    return this.service.resolveRisk(user, id, riskId, dto.resolutionNote);
  }

  @Post('handover-readiness/:id/followers')
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  follow(@Param('id') id: string, @Body() dto: AddHandoverFollowerDto, @CurrentUser() user: any) {
    return this.service.follow(user, id, dto.userId);
  }

  @Delete('handover-readiness/:id/followers/:userId')
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  unfollow(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: any) {
    return this.service.unfollow(user, id, userId);
  }

  @Post('handover-readiness/:id/evidence')
  @ApiOperation({ summary: 'Tải ảnh xác nhận đủ điều kiện (JPG/PNG/WEBP, lưu trữ riêng tư)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HANDOVER_POLICY.maxEvidenceBytes } }))
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  uploadEvidence(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { caption?: string },
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException({ code: 'HANDOVER_EVIDENCE_INVALID', message: 'Vui lòng chọn ảnh.' });
    return this.service.uploadEvidence(user, id, file, typeof body?.caption === 'string' ? body.caption.slice(0, 500) : undefined);
  }

  @Delete('handover-readiness/:id/evidence/:evidenceId')
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  removeEvidence(@Param('id') id: string, @Param('evidenceId') evidenceId: string, @CurrentUser() user: any) {
    return this.service.removeEvidence(user, id, evidenceId);
  }

  @Get('handover-readiness/:id/evidence/:evidenceId/file')
  @ApiOperation({ summary: 'Tải ảnh xác nhận (có kiểm tra quyền + Mall)' })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  async evidenceFile(
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.service.evidenceFile(user, id, evidenceId);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(file.stream);
  }

  @Post('handover-readiness/:id/confirm')
  @ApiOperation({ summary: 'Vận hành xác nhận mặt bằng đủ điều kiện bàn giao (≥3 ảnh + ghi chú, SoD)' })
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  confirm(@Param('id') id: string, @Body() dto: ConfirmHandoverReadyDto, @CurrentUser() user: any) {
    return this.service.confirm(user, id, dto);
  }

  @Post('handover-readiness/:id/reopen')
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  reopen(@Param('id') id: string, @Body() dto: HandoverReasonDto, @CurrentUser() user: any) {
    return this.service.reopen(user, id, dto.reason);
  }

  @Post('handover-readiness/:id/cancel')
  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  cancel(@Param('id') id: string, @Body() dto: HandoverReasonDto, @CurrentUser() user: any) {
    return this.service.cancel(user, id, dto.reason);
  }
}
