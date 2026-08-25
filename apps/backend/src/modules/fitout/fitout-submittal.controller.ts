import { Controller, Get, Post, Param, Body, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FitoutSubmittalService } from './fitout-submittal.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MallAccessService } from '../../common/services/mall-access.service';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';
import { Role } from '@prisma/client';
import { FitoutAccessPolicyService } from './fitout-access-policy.service';

// CR-101 Phase 1: descriptive only.

@ApiTags('Fitout Submittals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'fitoutSubmittal' }, status: EnforcementStatus.ENFORCED })
@Controller('fitout-submittals')
export class FitoutSubmittalController {
  constructor(
    private readonly submittalService: FitoutSubmittalService,
    private readonly mallAccess: MallAccessService,
    private readonly accessPolicy: FitoutAccessPolicyService,
  ) {}

  // Phase 5 (docs/program/RELIABILITY_BACKLOG.md): this controller had no mall-access
  // enforcement at all — unlike FitoutController's validateProject, every route here ran
  // with only the class-level role guard. Every route below now resolves its target
  // project (directly, from the query, or via the submittal id) and validates mall access
  // the same way FitoutController already does.
  private async validateProjectAccess(user: any, fitoutProjectId: string) {
    if (user.role === Role.TENANT) {
      await this.accessPolicy.assertTenantProject(fitoutProjectId, user);
      return;
    }
    return this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId });
  }

  private async validateSubmittalAccess(user: any, submittalId: string, requireSubmittedBy = false) {
    if (user.role === Role.TENANT) {
      await this.accessPolicy.assertTenantSubmittal(submittalId, user, requireSubmittedBy);
      return;
    }
    const projectId = await this.submittalService.getProjectId(submittalId);
    await this.validateProjectAccess(user, projectId);
  }

  @Get()
  @Roles(...MODULE_ROLES.fitout, Role.TENANT)
  @ApiOperation({ summary: 'List submittals for a fitout project' })
  async list(
    @Query('projectId') projectId: string,
    @Query('formTypeId') formTypeId: string | undefined,
    @Query('status') status: string | undefined,
    @CurrentUser() user: any,
  ) {
    await this.validateProjectAccess(user, projectId);
    return this.submittalService.list(projectId, { formTypeId, status });
  }

  @Post()
  @Roles(...MODULE_ROLES.fitout, Role.TENANT)
  @ApiOperation({ summary: 'Create (nộp) a new submittal' })
  async create(@Body() body: { projectId: string; formTypeId: string; title: string; dueDate?: string }, @CurrentUser() user: any) {
    await this.validateProjectAccess(user, body.projectId);
    return this.submittalService.create(body.projectId, body, user.id);
  }

  @Get(':id')
  @Roles(...MODULE_ROLES.fitout, Role.TENANT)
  @ApiOperation({ summary: 'Get submittal detail' })
  async getOne(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateSubmittalAccess(user, id);
    return this.submittalService.getOne(id);
  }

  @Post(':id/resubmit')
  @Roles(...MODULE_ROLES.fitout, Role.TENANT)
  @ApiOperation({ summary: 'Resubmit (nộp lại) a rejected submittal' })
  async resubmit(@Param('id') id: string, @Body() body: { title?: string; dueDate?: string }, @CurrentUser() user: any) {
    await this.validateSubmittalAccess(user, id, user.role === Role.TENANT);
    return this.submittalService.resubmit(id, body, user.id);
  }

  @Post(':id/submit-for-review')
  @Roles(...MODULE_ROLES.fitout, Role.TENANT)
  @ApiOperation({ summary: 'Gửi duyệt (bắt buộc đã đính kèm ít nhất 1 tệp) — chuyển hồ sơ nháp sang hàng chờ duyệt' })
  async submitForReview(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateSubmittalAccess(user, id, user.role === Role.TENANT);
    return this.submittalService.submitForReview(id);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish an approved submittal for reference' })
  async publish(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateSubmittalAccess(user, id);
    return this.submittalService.publish(id);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'List comments on a submittal' })
  async listComments(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateSubmittalAccess(user, id);
    return this.submittalService.listComments(id);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to a submittal' })
  async addComment(@Param('id') id: string, @Body('body') body: string, @CurrentUser() user: any) {
    await this.validateSubmittalAccess(user, id);
    return this.submittalService.addComment(id, user.id, body);
  }

  @Get(':id/distribution')
  @ApiOperation({ summary: 'List distribution list of a submittal' })
  async listDistribution(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateSubmittalAccess(user, id);
    return this.submittalService.listDistribution(id);
  }

  @Post(':id/distribution')
  @ApiOperation({ summary: 'Add a user to submittal distribution list' })
  async addDistribution(@Param('id') id: string, @Body('userId') userId: string, @CurrentUser() user: any) {
    await this.validateSubmittalAccess(user, id);
    return this.submittalService.addDistribution(id, userId);
  }

  @Get(':id/attachments')
  @Roles(...MODULE_ROLES.fitout, Role.TENANT)
  @ApiOperation({ summary: 'List file attachments of a submittal' })
  async listAttachments(@Param('id') id: string, @CurrentUser() user: any) {
    await this.validateSubmittalAccess(user, id);
    return this.submittalService.listAttachments(id);
  }

  @Post(':id/attachments')
  @Roles(...MODULE_ROLES.fitout, Role.TENANT)
  @ApiOperation({ summary: 'Upload a file attachment to a submittal' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    await this.validateSubmittalAccess(user, id, user.role === Role.TENANT);
    return this.submittalService.uploadAttachment(id, file, user.id);
  }
}
