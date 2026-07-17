import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FitoutGanttService } from './fitout-gantt.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CreateGanttTaskDto, UpdateGanttTaskDto } from './dto/fitout-operations.dto';

@ApiTags('Fitout Gantt')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Controller('fitout-tasks')
export class FitoutGanttController {
  constructor(private readonly ganttService: FitoutGanttService) {}

  @Get()
  @ApiOperation({ summary: 'List Gantt tasks for a project' })
  list(@Query('projectId') projectId: string) {
    return this.ganttService.listTasks(projectId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a Gantt task' })
  create(@Body() body: CreateGanttTaskDto) {
    return this.ganttService.createTask(body.projectId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a Gantt task' })
  update(@Param('id') id: string, @Body() body: UpdateGanttTaskDto) {
    return this.ganttService.updateTask(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a Gantt task' })
  remove(@Param('id') id: string) {
    return this.ganttService.deleteTask(id);
  }
}
