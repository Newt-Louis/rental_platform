import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FitoutGanttService } from './fitout-gantt.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CreateGanttTaskDto, UpdateGanttTaskDto } from './dto/fitout-operations.dto';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';
import { MallAccessService } from '../../common/services/mall-access.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// CR-101 Phase 1: descriptive only. list/create are caught by the global
// guard's automatic query.projectId/body.projectId match; update/remove key
// off :id (the task itself), which the guard does not resolve -- confirmed gap.
@ApiTags('Fitout Gantt')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Controller('fitout-tasks')
export class FitoutGanttController {
  constructor(
    private readonly ganttService: FitoutGanttService,
    private readonly mallAccess: MallAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List Gantt tasks for a project' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'query', key: 'projectId', resolver: 'fitoutProject' }, status: EnforcementStatus.ENFORCED })
  list(@Query('projectId') projectId: string) {
    return this.ganttService.listTasks(projectId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a Gantt task' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'body', key: 'projectId', resolver: 'fitoutProject' }, status: EnforcementStatus.ENFORCED })
  create(@Body() body: CreateGanttTaskDto) {
    return this.ganttService.createTask(body.projectId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a Gantt task' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'fitoutGanttTask' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async update(@Param('id') id: string, @Body() body: UpdateGanttTaskDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutGanttTaskId: id });
    return this.ganttService.updateTask(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a Gantt task' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'fitoutGanttTask' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutGanttTaskId: id });
    return this.ganttService.deleteTask(id);
  }
}
