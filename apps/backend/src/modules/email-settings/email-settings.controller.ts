import { Body, Controller, Get, Put, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmailSettingsService } from './email-settings.service';
import { EmailService } from '../notifications/email.service';
import { UpdateEmailSettingsDto, SendTestEmailDto } from './dto/email-settings.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalScope } from '../../common/decorators/scope.decorator';

// Singleton platform-wide SMTP config -- no Mall concept applies, ADMIN only.
@ApiTags('Email Settings')
@ApiBearerAuth('JWT-auth')
@Roles(...MODULE_ROLES.emailSettings)
@GlobalScope('Singleton platform-wide SMTP config, not per-Mall')
@Controller('email-settings')
export class EmailSettingsController {
  constructor(
    private readonly emailSettingsService: EmailSettingsService,
    private readonly emailService: EmailService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lấy cấu hình SMTP hiện tại (không trả về mật khẩu)' })
  getSettings() {
    return this.emailSettingsService.getSettings();
  }

  @Put()
  @ApiOperation({ summary: 'Cập nhật cấu hình SMTP -- bỏ trống field smtpPass để giữ nguyên mật khẩu cũ' })
  update(@Body() dto: UpdateEmailSettingsDto, @CurrentUser() user: any) {
    return this.emailSettingsService.update(dto, user.id);
  }

  @Post('test')
  @ApiOperation({ summary: 'Gửi 1 email thử để xác nhận cấu hình SMTP đang hoạt động' })
  async sendTest(@Body() dto: SendTestEmailDto, @CurrentUser() user: any) {
    const to = dto.to || user.email;
    const result = await this.emailService.sendMail({
      to,
      subject: 'THISO Leasing — Email thử nghiệm cấu hình SMTP',
      html: `<p>Đây là email thử nghiệm xác nhận cấu hình SMTP của THISO Leasing Platform đang hoạt động.</p>
             <p>Gửi lúc: ${new Date().toLocaleString('vi-VN')}</p>`,
    });
    return { to, ...result };
  }
}
