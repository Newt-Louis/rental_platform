import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FitoutIssueService } from './fitout-issue.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateFitoutIssueDto, UpdateFitoutIssueDto } from './dto/fitout-operations.dto';

@ApiTags('Fitout Issues')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Controller('fitout-issues')
export class FitoutIssueController {
  constructor(private readonly issueService: FitoutIssueService) {}

  @Get()
  @ApiOperation({ summary: 'List issues for a fitout project' })
  list(
    @Query('projectId') projectId: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('assigneeId') assigneeId?: string,
  ) {
    return this.issueService.list(projectId, { status, category, assigneeId });
  }

  @Post()
  @ApiOperation({ summary: 'Create (tạo mới) a fitout issue/defect' })
  create(@Body() body: CreateFitoutIssueDto, @CurrentUser() user: any) {
    return this.issueService.create(body.projectId, body, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get issue detail' })
  getOne(@Param('id') id: string) {
    return this.issueService.getOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update issue fields' })
  update(@Param('id') id: string, @Body() body: UpdateFitoutIssueDto) {
    return this.issueService.update(id, body);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition issue status' })
  transition(@Param('id') id: string, @Body('status') status: string, @CurrentUser() user: any) {
    return this.issueService.transition(id, status, user.id, user.role);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'List comments on an issue' })
  listComments(@Param('id') id: string) {
    return this.issueService.listComments(id);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to an issue' })
  addComment(@Param('id') id: string, @Body('body') body: string, @CurrentUser() user: any) {
    return this.issueService.addComment(id, user.id, body);
  }

  @Get(':id/photos')
  @ApiOperation({ summary: 'List photos of an issue' })
  listPhotos(@Param('id') id: string) {
    return this.issueService.listPhotos(id);
  }

  @Post(':id/photos')
  @ApiOperation({ summary: 'Upload a photo to an issue' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    return this.issueService.uploadPhoto(id, file, user.id);
  }
}
