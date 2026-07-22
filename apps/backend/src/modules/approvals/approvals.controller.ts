import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, WorkflowStatus } from '@prisma/client';
import { CreateApprovalPolicyRuleDto } from './dto/create-approval-policy-rule.dto';
import { UpdateApprovalPolicyRuleDto } from './dto/update-approval-policy-rule.dto';
import { ApproveDecisionDto, RejectDecisionDto } from './dto/approval-decision.dto';
import { MallAccessService } from '../../common/services/mall-access.service';

@ApiTags('Approvals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.approvals)
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService, private readonly mallAccess: MallAccessService) {}

  private async mallIds(user: any, requestedMallId?: string): Promise<string[] | undefined> {
    const mallId: string | undefined = requestedMallId ?? user.activeMallId ?? undefined;
    if (mallId) {
      await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
      return [mallId];
    }
    return (await this.mallAccess.getAccessibleMallIds(user.id, user.role)) ?? undefined;
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get pending approval steps for current user' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getPending(@CurrentUser() user: any, @Query() query: any) {
    return this.approvalsService.getPending(user.id, user.role, query, await this.mallIds(user, query.mallId));
  }

  @Get('history')
  @ApiOperation({ summary: 'Get decided approval steps (approved/rejected) for current user' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['APPROVED', 'REJECTED'] })
  async getHistory(@CurrentUser() user: any, @Query() query: any) {
    return this.approvalsService.getHistory(user.id, user.role, query, await this.mallIds(user, query.mallId));
  }

  @Get()
  @ApiOperation({ summary: 'Get all approval workflows' })
  @ApiQuery({ name: 'status', required: false, enum: WorkflowStatus })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getAll(@Query() query: any, @CurrentUser() user: any) {
    return this.approvalsService.getAllWorkflows(query, await this.mallIds(user, query.mallId));
  }

  @Get('policy/rules')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List approval policy rules' })
  getPolicyRules() {
    return this.approvalsService.listPolicyRules();
  }

  @Post('policy/rules')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create approval policy rule' })
  createPolicyRule(@Body() dto: CreateApprovalPolicyRuleDto) {
    return this.approvalsService.createPolicyRule(dto);
  }

  @Post('policy/rules/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update approval policy rule' })
  updatePolicyRule(@Param('id') id: string, @Body() dto: UpdateApprovalPolicyRuleDto) {
    return this.approvalsService.updatePolicyRule(id, dto);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a step' })
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveDecisionDto,
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { approvalStepId: id });
    return this.approvalsService.approve(id, user.id, user.role, dto.comment);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a step' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectDecisionDto,
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { approvalStepId: id });
    return this.approvalsService.reject(id, user.id, user.role, dto.comment);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow details' })
  async getWorkflow(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { approvalWorkflowId: id });
    return this.approvalsService.getWorkflow(id);
  }
}
