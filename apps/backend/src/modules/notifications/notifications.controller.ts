import { BadRequestException, Controller, ForbiddenException, Get, Headers, Put, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserScope } from '../../common/decorators/scope.decorator';
import { EmailDeliveryService } from './email-delivery.service';
import { Role } from '@prisma/client';
import { TenantsService } from '../tenants/tenants.service';

const EMAIL_OPERATIONS_ROLES = [Role.ADMIN, Role.CEO, Role.MALL_DIRECTOR, Role.OPERATION] as const;

// CR-101 Phase 1: descriptive only. Own-notifications-only, not a Mall concept.

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.notifications)
@UserScope()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService, private readonly emailDelivery: EmailDeliveryService, private readonly tenants: TenantsService) {}

  @Get('email-deliveries')
  @Roles(...EMAIL_OPERATIONS_ROLES)
  getEmailDeliveries(@Query() query: any, @CurrentUser() user: any) {
    return this.emailDelivery.list(query, user);
  }

  @Get('email-deliveries/:id')
  @Roles(...EMAIL_OPERATIONS_ROLES)
  getEmailDelivery(@Param('id') id: string, @CurrentUser() user: any) {
    return this.emailDelivery.get(id, user);
  }

  @Get('email-deliveries/:id/preview')
  @Roles(...EMAIL_OPERATIONS_ROLES)
  previewEmailDelivery(@Param('id') id: string, @CurrentUser() user: any) {
    return this.emailDelivery.preview(id, user);
  }

  @Post('email-deliveries/:id/retry')
  @Roles(...EMAIL_OPERATIONS_ROLES)
  retryEmailDelivery(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Headers('idempotency-key') operationId: string,
  ) {
    return this.emailDelivery.retry(id, user, operationId);
  }

  @Post('email-deliveries/:id/resend')
  @Roles(...EMAIL_OPERATIONS_ROLES)
  async resendEmailDelivery(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Headers('idempotency-key') operationId: string,
  ) {
    const delivery: any = await this.emailDelivery.get(id, user);
    if (!delivery.capabilities?.canResend) {
      throw new ForbiddenException('This delivery is not authorized for resend');
    }
    if (delivery.capabilities?.resendMode === 'REGENERATE_DOMAIN_TOKEN') {
      if (!delivery.entityId) throw new BadRequestException('Activation delivery has no Tenant linkage');
      const result = await this.tenants.reissuePortalActivation(
        delivery.entityId,
        id,
        operationId,
        delivery.mallId,
      );
      if (result.created) {
        await this.emailDelivery.auditDomainResend(id, result.deliveryId, result.sent, user);
      }
      return result;
    }
    return this.emailDelivery.resend(id, user, operationId);
  }

  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  findAll(@CurrentUser() user: any) {
    return this.notificationsService.findAll(user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.markRead(id, user.id);
  }

  @Put('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllRead(user.id);
  }
}
