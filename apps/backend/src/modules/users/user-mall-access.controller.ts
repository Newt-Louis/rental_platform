import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserMallAccessService } from './user-mall-access.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Mall Access')
@ApiBearerAuth('JWT-auth')
@Controller('mall-access')
export class UserMallAccessController {
  constructor(private readonly service: UserMallAccessService) {}

  @Get('my-malls')
  @Roles(...MODULE_ROLES.notifications)
  @ApiOperation({ summary: 'List malls accessible by current user' })
  getMyMalls(@CurrentUser() user: any) {
    return this.service.getMallsForUser(user.id);
  }

  @Get('users/:userId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List mall access for a user' })
  listForUser(@Param('userId') userId: string) {
    return this.service.listForUser(userId);
  }

  @Get('mall/:mallId/users')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List users with access to a mall' })
  getUsersForMall(@Param('mallId') mallId: string) {
    return this.service.getUsersForMall(mallId);
  }

  @Post('grant')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Grant a user access to a mall with a specific role' })
  grantAccess(
    @Body() dto: { userId: string; mallId: string; role: Role },
    @CurrentUser() user: any,
  ) {
    return this.service.grantAccess(dto, user.id);
  }

  @Delete(':userId/:mallId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Revoke user access from a mall' })
  revokeAccess(@Param('userId') userId: string, @Param('mallId') mallId: string) {
    return this.service.revokeAccess(userId, mallId);
  }
}
