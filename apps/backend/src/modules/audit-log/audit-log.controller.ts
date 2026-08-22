import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { GlobalScope } from '../../common/decorators/scope.decorator';

// CR-101 Phase 1: descriptive only. Restricted to ADMIN/CEO (both mall-scoping
// bypass roles per mall-access.service.ts) -- no separate Mall boundary applies.
@ApiTags('Audit Log')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.auditLog)
@GlobalScope('ADMIN/CEO-only, both Mall-scoping bypass roles -- no Mall boundary needed')
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries (ai đã sửa gì, khi nào)' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any) {
    return this.auditLogService.findAll(query);
  }

  @Get('entity-types')
  @ApiOperation({ summary: 'List distinct entity types seen in the audit log' })
  listEntityTypes() {
    return this.auditLogService.listEntityTypes();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Summary stats (total, error count, by action)' })
  @ApiQuery({ name: 'dateFrom', required: false })
  getStats(@Query('dateFrom') dateFrom?: string) {
    return this.auditLogService.getStats(dateFrom);
  }
}
