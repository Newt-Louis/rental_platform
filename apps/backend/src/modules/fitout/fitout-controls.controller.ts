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
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';
import { MallAccessService } from '../../common/services/mall-access.service';

// CR-101 Phase 3A: enforced via the existing `fitoutProject` resolver, keyed
// off the shared :projectId base-path param on every route in this controller.
@ApiTags('Fitout Controls')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.fitout)
@Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'projectId', resolver: 'fitoutProject' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
@Controller('fitouts/:projectId/controls')
export class FitoutControlsController {
  constructor(
    private readonly service: FitoutControlsService,
    private readonly mallAccess: MallAccessService,
  ) {}

  @Get('summary') @ApiOperation({ summary: 'Risk and change cost dashboard summary' })
  async summary(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId: projectId });
    return this.service.getSummary(projectId);
  }

  @Get('risks')
  async listRisks(@Param('projectId') projectId: string, @Query('status') status: string | undefined, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId: projectId });
    return this.service.listRisks(projectId, status);
  }

  @Post('risks')
  async createRisk(@Param('projectId') projectId: string, @Body() dto: CreateFitoutRiskDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId: projectId });
    return this.service.createRisk(projectId, dto, user.id);
  }

  @Patch('risks/:riskId')
  async updateRisk(@Param('projectId') projectId: string, @Param('riskId') riskId: string, @Body() dto: UpdateFitoutRiskDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId: projectId });
    return this.service.updateRisk(projectId, riskId, dto);
  }

  @Get('change-orders')
  async listChanges(@Param('projectId') projectId: string, @Query('status') status: string | undefined, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId: projectId });
    return this.service.listChangeOrders(projectId, status);
  }

  @Post('change-orders')
  async createChange(@Param('projectId') projectId: string, @Body() dto: CreateFitoutChangeOrderDto, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId: projectId });
    return this.service.createChangeOrder(projectId, dto, user.id);
  }

  @Patch('change-orders/:changeId/decision')
  async decide(
    @Param('projectId') projectId: string,
    @Param('changeId') changeId: string,
    @Body() dto: DecideFitoutChangeOrderDto,
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId: projectId });
    return this.service.decideChangeOrder(projectId, changeId, dto, user);
  }
}
