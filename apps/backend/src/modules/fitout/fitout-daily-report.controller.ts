import { Controller, Get, Post, Param, Body, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FitoutDailyReportService } from './fitout-daily-report.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Fitout Daily Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Controller('fitout-daily-reports')
export class FitoutDailyReportController {
  constructor(private readonly dailyReportService: FitoutDailyReportService) {}

  @Get('merged')
  @ApiOperation({ summary: 'Get merged daily report view for a specific date' })
  getMergedView(@Query('projectId') projectId: string, @Query('date') date: string) {
    return this.dailyReportService.getMergedView(projectId, date);
  }

  @Get()
  @ApiOperation({ summary: 'List daily report entries for a project' })
  list(@Query('projectId') projectId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.dailyReportService.list(projectId, { from, to });
  }

  @Post()
  @ApiOperation({ summary: 'Create a daily report entry' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.dailyReportService.create(body.projectId, body, user.id);
  }

  @Get(':entryId/photos')
  @ApiOperation({ summary: 'List photos of a daily report entry' })
  listPhotos(@Param('entryId') entryId: string) {
    return this.dailyReportService.listPhotos(entryId);
  }

  @Post(':entryId/photos')
  @ApiOperation({ summary: 'Upload a photo to a daily report entry' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  uploadPhoto(@Param('entryId') entryId: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    return this.dailyReportService.uploadPhoto(entryId, file, user.id);
  }
}
