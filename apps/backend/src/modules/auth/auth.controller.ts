import { Controller, Post, Patch, Body, Get, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register new user (disabled in production by default)' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('activate-invitation')
  @Public()
  async activateInvitation(@Body() body: { token: string; password: string }) {
    return this.authService.activateInvitation(body.token, body.password);
  }

  @Post('logout')
  @Roles(...MODULE_ROLES.notifications)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout and revoke current JWT token' })
  async logout(@Headers('authorization') authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    return this.authService.logout(token);
  }

  @Get('me')
  @Roles(...MODULE_ROLES.notifications)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@CurrentUser() user: any) {
    return this.authService.getMe(user.id);
  }

  @Patch('me/active-mall')
  @Roles(...MODULE_ROLES.notifications)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Set active mall context for current user session' })
  async setActiveMall(@CurrentUser() user: any, @Body() body: { mallId: string | null }) {
    return this.authService.setActiveMall(user.id, body.mallId);
  }
}
