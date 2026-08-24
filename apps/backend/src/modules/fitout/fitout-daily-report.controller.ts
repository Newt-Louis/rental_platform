import { Controller, Get, Post, Param, Body, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FitoutDailyReportService } from './fitout-daily-report.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateDailyReportDto } from './dto/fitout-operations.dto';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';
import { MallAccessService } from '../../common/services/mall-access.service';

// CR-101 Phase 1: descriptive only. merged/list/create are caught by the
// global guard's automatic query.projectId/body.projectId match; the
// :entryId/photos routes are not -- confirmed gap.
@ApiTags('Fitout Daily Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Controller('fitout-daily-reports')
export class FitoutDailyReportController {
  constructor(
    private readonly dailyReportService: FitoutDailyReportService,
    private readonly mallAccess: MallAccessService,
  ) {}

  @Get('merged')
  @ApiOperation({ summary: 'Get merged daily report view for a specific date' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'query', key: 'projectId', resolver: 'fitoutProject' }, status: EnforcementStatus.ENFORCED })
  getMergedView(@Query('projectId') projectId: string, @Query('date') date: string) {
    return this.dailyReportService.getMergedView(projectId, date);
  }

  @Get()
  @ApiOperation({ summary: 'List daily report entries for a project' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'query', key: 'projectId', resolver: 'fitoutProject' }, status: EnforcementStatus.ENFORCED })
  list(@Query('projectId') projectId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.dailyReportService.list(projectId, { from, to });
  }

  @Post()
  @ApiOperation({ summary: 'Create a daily report entry' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'body', key: 'projectId', resolver: 'fitoutProject' }, status: EnforcementStatus.ENFORCED })
  create(@Body() body: CreateDailyReportDto, @CurrentUser() user: any) {
    return this.dailyReportService.create(body.projectId, body, user.id);
  }

  @Get(':entryId/photos')
  @ApiOperation({ summary: 'List photos of a daily report entry' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'entryId', resolver: 'fitoutDailyReportEntry' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async listPhotos(@Param('entryId') entryId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutDailyReportEntryId: entryId });
    return this.dailyReportService.listPhotos(entryId);
  }

  @Post(':entryId/photos')
  @ApiOperation({ summary: 'Upload a photo to a daily report entry' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'entryId', resolver: 'fitoutDailyReportEntry' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async uploadPhoto(@Param('entryId') entryId: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutDailyReportEntryId: entryId });
    return this.dailyReportService.uploadPhoto(entryId, file, user.id);
  }
}
