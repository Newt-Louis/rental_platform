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

@ApiTags('Approvals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.approvals)
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Get pending approval steps for current user' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getPending(@CurrentUser() user: any, @Query() query: any) {
    return this.approvalsService.getPending(user.id, user.role, query);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get decided approval steps (approved/rejected) for current user' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['APPROVED', 'REJECTED'] })
  getHistory(@CurrentUser() user: any, @Query() query: any) {
    return this.approvalsService.getHistory(user.id, user.role, query);
  }

  @Get()
  @ApiOperation({ summary: 'Get all approval workflows' })
  @ApiQuery({ name: 'status', required: false, enum: WorkflowStatus })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getAll(@Query() query: any) {
    return this.approvalsService.getAllWorkflows(query);
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
  approve(
    @Param('id') id: string,
    @Body('comment') comment: string,
    @CurrentUser() user: any,
  ) {
    return this.approvalsService.approve(id, user.id, user.role, comment);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a step' })
  reject(
    @Param('id') id: string,
    @Body('comment') comment: string,
    @CurrentUser() user: any,
  ) {
    return this.approvalsService.reject(id, user.id, user.role, comment);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow details' })
  getWorkflow(@Param('id') id: string) {
    return this.approvalsService.getWorkflow(id);
  }
}
