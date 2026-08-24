import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FitoutIssueService } from './fitout-issue.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateFitoutIssueDto, UpdateFitoutIssueDto } from './dto/fitout-operations.dto';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';
import { MallAccessService } from '../../common/services/mall-access.service';

// CR-101 Phase 3C (C4-02, docs/changes/CR-101-PHASE-3C-C4-COMPLETION.md):
// every route in this controller previously had zero explicit MallAccessService
// calls -- protection rode entirely on MallAccessGuard's incidental heuristic
// (list/create via query.projectId/body.projectId matching `fitoutProjectId`;
// every :id-keyed route via the path containing the substring "fitout-issue",
// matching `fitoutIssueId`). Worked today, but fragile -- any route
// restructuring silently drops protection with no build-time signal. All 9
// routes now call MallAccessService explicitly, reusing the already-registered
// `fitoutProject` (list/create) and `fitoutIssue` (every :id-keyed route)
// resolvers -- no new resolver logic, only new call sites.

@ApiTags('Fitout Issues')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'fitoutIssue' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3C (C4-02) -- now explicitly enforced per-route, not merely via path-substring coincidence' })
@Controller('fitout-issues')
export class FitoutIssueController {
  constructor(
    private readonly issueService: FitoutIssueService,
    private readonly mallAccess: MallAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List issues for a fitout project' })
  async list(
    @Query('projectId') projectId: string,
    @Query('status') status: string | undefined,
    @Query('category') category: string | undefined,
    @Query('assigneeId') assigneeId: string | undefined,
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId: projectId });
    return this.issueService.list(projectId, { status, category, assigneeId });
  }

  @Post()
  @ApiOperation({ summary: 'Create (tạo mới) a fitout issue/defect' })
  async create(@Body() body: CreateFitoutIssueDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId: body.projectId });
    return this.issueService.create(body.projectId, body, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get issue detail' })
  async getOne(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutIssueId: id });
    return this.issueService.getOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update issue fields' })
  async update(@Param('id') id: string, @Body() body: UpdateFitoutIssueDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutIssueId: id });
    return this.issueService.update(id, body);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition issue status' })
  async transition(@Param('id') id: string, @Body('status') status: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutIssueId: id });
    return this.issueService.transition(id, status, user.id, user.role);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'List comments on an issue' })
  async listComments(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutIssueId: id });
    return this.issueService.listComments(id);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to an issue' })
  async addComment(@Param('id') id: string, @Body('body') body: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutIssueId: id });
    return this.issueService.addComment(id, user.id, body);
  }

  @Get(':id/photos')
  @ApiOperation({ summary: 'List photos of an issue' })
  async listPhotos(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutIssueId: id });
    return this.issueService.listPhotos(id);
  }

  @Post(':id/photos')
  @ApiOperation({ summary: 'Upload a photo to an issue' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutIssueId: id });
    return this.issueService.uploadPhoto(id, file, user.id);
  }
}
