import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NotificationRecipientType, NotificationRoutingMode } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Scope } from '../../../common/decorators/scope.decorator';
import { EnforcementStatus, ScopeType } from '../../../common/constants/scope.types';
import { NotificationRoutingConfigService } from './notification-routing-config.service';

class RoutingRecipientDto {
  @IsString()
  userId!: string;

  @IsEnum(NotificationRecipientType)
  recipientType!: NotificationRecipientType;
}

export class UpsertRoutingDto {
  @IsEnum(NotificationRoutingMode)
  mode!: NotificationRoutingMode;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RoutingRecipientDto)
  recipients!: RoutingRecipientDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

/**
 * CR-NOTIFICATION-RECIPIENT-ROUTING admin API. Authority is checked in the
 * service against the event's own scope (the Mall of the configuration), never
 * from a client-supplied mallId on a mutation body.
 */
const SERVICE_ENFORCED = 'CR-NOTIFICATION-RECIPIENT-ROUTING -- service-level: event registry scope + notification-routing-* action permission + Mall access';

@ApiTags('Notification Routing')
@ApiBearerAuth('JWT-auth')
@Controller('notification-routing')
export class NotificationRoutingController {
  constructor(private readonly service: NotificationRoutingConfigService) {}

  @Get('events')
  @ApiOperation({ summary: 'Danh mục sự kiện + cấu hình người nhận hiện tại của một Mall' })
  @ApiQuery({ name: 'mallId', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  listEvents(@Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    return this.service.listEvents(user, mallId);
  }

  @Get('events/:eventKey/candidates')
  @ApiOperation({ summary: 'Người dùng có thể chọn làm người nhận cho sự kiện này' })
  @ApiQuery({ name: 'mallId', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  candidates(@Param('eventKey') eventKey: string, @Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    return this.service.candidates(user, eventKey, mallId);
  }

  @Put('events/:eventKey')
  @ApiOperation({ summary: 'Đặt chế độ định tuyến + người nhận đích danh' })
  @ApiQuery({ name: 'mallId', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  upsert(
    @Param('eventKey') eventKey: string,
    @Query('mallId') mallId: string | undefined,
    @Body() dto: UpsertRoutingDto,
    @CurrentUser() user: any,
  ) {
    return this.service.upsert(user, eventKey, mallId, dto);
  }

  @Delete('events/:eventKey')
  @ApiOperation({ summary: 'Trả sự kiện về quy tắc người nhận mặc định' })
  @ApiQuery({ name: 'mallId', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  reset(@Param('eventKey') eventKey: string, @Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    return this.service.reset(user, eventKey, mallId);
  }

  @Post('events/:eventKey/test')
  // Outbound mail on demand: the global 100/min ceiling is far too generous for
  // an email primitive, so this route uses the same narrow throttle the costly
  // AI routes already use.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Gửi email [TEST] tới người nhận đã cấu hình — không tạo dữ liệu nghiệp vụ' })
  @ApiQuery({ name: 'mallId', required: false })
  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'direct', from: 'query', key: 'mallId' }, status: EnforcementStatus.ENFORCED, trackedAs: SERVICE_ENFORCED })
  sendTest(@Param('eventKey') eventKey: string, @Query('mallId') mallId: string | undefined, @CurrentUser() user: any) {
    return this.service.sendTest(user, eventKey, mallId);
  }
}
