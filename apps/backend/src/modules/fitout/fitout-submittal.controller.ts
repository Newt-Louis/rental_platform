import { Controller, Get, Post, Param, Body, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FitoutSubmittalService } from './fitout-submittal.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Fitout Submittals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Controller('fitout-submittals')
export class FitoutSubmittalController {
  constructor(private readonly submittalService: FitoutSubmittalService) {}

  @Get()
  @ApiOperation({ summary: 'List submittals for a fitout project' })
  list(@Query('projectId') projectId: string, @Query('formTypeId') formTypeId?: string, @Query('status') status?: string) {
    return this.submittalService.list(projectId, { formTypeId, status });
  }

  @Post()
  @ApiOperation({ summary: 'Create (nộp) a new submittal' })
  create(@Body() body: { projectId: string; formTypeId: string; title: string; dueDate?: string }, @CurrentUser() user: any) {
    return this.submittalService.create(body.projectId, body, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get submittal detail' })
  getOne(@Param('id') id: string) {
    return this.submittalService.getOne(id);
  }

  @Post(':id/resubmit')
  @ApiOperation({ summary: 'Resubmit (nộp lại) a rejected submittal' })
  resubmit(@Param('id') id: string, @Body() body: { title?: string; dueDate?: string }, @CurrentUser() user: any) {
    return this.submittalService.resubmit(id, body, user.id);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish an approved submittal for reference' })
  publish(@Param('id') id: string) {
    return this.submittalService.publish(id);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'List comments on a submittal' })
  listComments(@Param('id') id: string) {
    return this.submittalService.listComments(id);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to a submittal' })
  addComment(@Param('id') id: string, @Body('body') body: string, @CurrentUser() user: any) {
    return this.submittalService.addComment(id, user.id, body);
  }

  @Get(':id/distribution')
  @ApiOperation({ summary: 'List distribution list of a submittal' })
  listDistribution(@Param('id') id: string) {
    return this.submittalService.listDistribution(id);
  }

  @Post(':id/distribution')
  @ApiOperation({ summary: 'Add a user to submittal distribution list' })
  addDistribution(@Param('id') id: string, @Body('userId') userId: string) {
    return this.submittalService.addDistribution(id, userId);
  }

  @Get(':id/attachments')
  @ApiOperation({ summary: 'List file attachments of a submittal' })
  listAttachments(@Param('id') id: string) {
    return this.submittalService.listAttachments(id);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Upload a file attachment to a submittal' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  uploadAttachment(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    return this.submittalService.uploadAttachment(id, file, user.id);
  }
}
