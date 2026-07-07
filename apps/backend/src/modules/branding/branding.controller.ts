import {
  Controller, Get, Post, Delete, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { BrandingService } from './branding.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Branding')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Roles(...MODULE_ROLES.branding)
@Controller('branding')
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lấy cấu hình thương hiệu (logo + ảnh nền) — public, dùng cho màn hình đăng nhập' })
  getSettings() {
    return this.brandingService.getSettings();
  }

  @Post('logo')
  @ApiOperation({ summary: 'Upload logo công ty' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadLogo(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    return this.brandingService.uploadLogo(file, user.id);
  }

  @Post('background')
  @ApiOperation({ summary: 'Upload ảnh nền màn hình đăng nhập' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadBackground(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    return this.brandingService.uploadBackground(file, user.id);
  }

  @Delete('logo')
  @ApiOperation({ summary: 'Xoá logo, quay về mặc định' })
  removeLogo(@CurrentUser() user: any) {
    return this.brandingService.removeLogo(user.id);
  }

  @Delete('background')
  @ApiOperation({ summary: 'Xoá ảnh nền, quay về mặc định' })
  removeBackground(@CurrentUser() user: any) {
    return this.brandingService.removeBackground(user.id);
  }
}
