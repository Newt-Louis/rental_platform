import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CreateFitoutChangeOrderDto,
  CreateFitoutRiskDto,
  DecideFitoutChangeOrderDto,
  UpdateFitoutRiskDto,
} from './dto/fitout-controls.dto';
import { FitoutControlsService } from './fitout-controls.service';

@ApiTags('Fitout Controls')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Controller('fitouts/:projectId/controls')
export class FitoutControlsController {
  constructor(private readonly service: FitoutControlsService) {}

  @Get('summary') @ApiOperation({ summary: 'Risk and change cost dashboard summary' })
  summary(@Param('projectId') projectId: string) { return this.service.getSummary(projectId); }

  @Get('risks')
  listRisks(@Param('projectId') projectId: string, @Query('status') status?: string) {
    return this.service.listRisks(projectId, status);
  }

  @Post('risks')
  createRisk(@Param('projectId') projectId: string, @Body() dto: CreateFitoutRiskDto, @CurrentUser() user: any) {
    return this.service.createRisk(projectId, dto, user.id);
  }

  @Patch('risks/:riskId')
  updateRisk(@Param('projectId') projectId: string, @Param('riskId') riskId: string, @Body() dto: UpdateFitoutRiskDto) {
    return this.service.updateRisk(projectId, riskId, dto);
  }

  @Get('change-orders')
  listChanges(@Param('projectId') projectId: string, @Query('status') status?: string) {
    return this.service.listChangeOrders(projectId, status);
  }

  @Post('change-orders')
  createChange(@Param('projectId') projectId: string, @Body() dto: CreateFitoutChangeOrderDto, @CurrentUser() user: any) {
    return this.service.createChangeOrder(projectId, dto, user.id);
  }

  @Patch('change-orders/:changeId/decision')
  decide(
    @Param('projectId') projectId: string,
    @Param('changeId') changeId: string,
    @Body() dto: DecideFitoutChangeOrderDto,
    @CurrentUser() user: any,
  ) {
    return this.service.decideChangeOrder(projectId, changeId, dto, user);
  }
}
