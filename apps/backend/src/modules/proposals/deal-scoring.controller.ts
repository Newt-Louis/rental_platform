import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DealScoringService } from './deal-scoring.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { Scope, GlobalScope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';
import { MallAccessService } from '../../common/services/mall-access.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// CR-101 Phase 1: descriptive only. Resolved group A of the 3 UNKNOWN route
// groups this session -- see docs/architecture-review/15-CR-101-ROUTE-COVERAGE.md.
@ApiTags('Deal Scoring')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.proposals)
@Controller('deal-scoring')
export class DealScoringController {
  constructor(
    private readonly dealScoringService: DealScoringService,
    private readonly mallAccess: MallAccessService,
  ) {}

  @Get('criteria')
  @ApiOperation({ summary: 'List deal scoring criteria' })
  @GlobalScope('Platform-wide scoring configuration table, no mallId on the model (verified: deal-scoring.service.ts)')
  listCriteria() {
    return this.dealScoringService.listCriteria();
  }

  @Post('criteria')
  @ApiOperation({ summary: 'Create or update scoring criterion' })
  @GlobalScope('Platform-wide scoring configuration table, no mallId on the model (verified: deal-scoring.service.ts)')
  upsertCriterion(@Body() body: any) {
    return this.dealScoringService.upsertCriterion(body);
  }

  @Post('proposals/:id')
  @ApiOperation({ summary: 'Calculate and store deal score for proposal' })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'id', resolver: 'proposal' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A' })
  async scoreProposal(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { proposalId: id });
    return this.dealScoringService.scoreProposal(id);
  }
}
