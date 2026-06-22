import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DealScoringService } from './deal-scoring.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';

@ApiTags('Deal Scoring')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.proposals)
@Controller('deal-scoring')
export class DealScoringController {
  constructor(private readonly dealScoringService: DealScoringService) {}

  @Get('criteria')
  @ApiOperation({ summary: 'List deal scoring criteria' })
  listCriteria() {
    return this.dealScoringService.listCriteria();
  }

  @Post('criteria')
  @ApiOperation({ summary: 'Create or update scoring criterion' })
  upsertCriterion(@Body() body: any) {
    return this.dealScoringService.upsertCriterion(body);
  }

  @Post('proposals/:id')
  @ApiOperation({ summary: 'Calculate and store deal score for proposal' })
  scoreProposal(@Param('id') id: string) {
    return this.dealScoringService.scoreProposal(id);
  }
}
