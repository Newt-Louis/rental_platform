import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { UpdateEmailSettingsDto } from './dto/email-settings.dto';

export interface ActiveEmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from?: string;
}

@Injectable()
export class EmailSettingsService {
  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
  ) {}

  // Bảng singleton — luôn thao tác trên 1 dòng duy nhất, tự tạo nếu chưa có.
  private async getOrCreateSettings() {
    const existing = await this.prisma.emailSettings.findFirst();
    if (existing) return existing;
    return this.prisma.emailSettings.create({ data: {} });
  }

  async getSettings() {
    const settings = await this.getOrCreateSettings();
    return {
      isEnabled: settings.isEnabled,
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      smtpSecure: settings.smtpSecure,
      smtpUser: settings.smtpUser,
      emailFrom: settings.emailFrom,
      hasPassword: !!settings.smtpPassEncrypted,
      updatedAt: settings.updatedAt,
    };
  }

  async update(dto: UpdateEmailSettingsDto, userId: string) {
    if (dto.smtpPass !== undefined && dto.smtpPass !== '' && !this.encryption.isConfigured) {
      throw new BadRequestException('ENCRYPTION_KEY chưa được cấu hình trên server, không thể lưu mật khẩu SMTP');
    }

    const settings = await this.getOrCreateSettings();
    const data: Record<string, unknown> = { updatedById: userId };

    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    if (dto.smtpHost !== undefined) data.smtpHost = dto.smtpHost;
    if (dto.smtpPort !== undefined) data.smtpPort = dto.smtpPort;
    if (dto.smtpSecure !== undefined) data.smtpSecure = dto.smtpSecure;
    if (dto.smtpUser !== undefined) data.smtpUser = dto.smtpUser;
    if (dto.emailFrom !== undefined) data.emailFrom = dto.emailFrom;
    // Field vắng mặt trong DTO -> giữ nguyên password cũ. Chuỗi rỗng -> xoá.
    if (dto.smtpPass !== undefined) {
      data.smtpPassEncrypted = dto.smtpPass === '' ? null : this.encryption.encrypt(dto.smtpPass);
    }

    await this.prisma.emailSettings.update({ where: { id: settings.id }, data });
    return this.getSettings();
  }

  // Dùng nội bộ bởi EmailService -- trả về config đã giải mã, hoặc null nếu
  // chưa bật/chưa cấu hình đủ để gửi email.
  async getActiveConfig(): Promise<ActiveEmailConfig | null> {
    const settings = await this.prisma.emailSettings.findFirst();
    if (!settings || !settings.isEnabled) return null;
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassEncrypted) return null;
    if (!this.encryption.isConfigured) return null;

    return {
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      user: settings.smtpUser,
      pass: this.encryption.decrypt(settings.smtpPassEncrypted),
      from: settings.emailFrom ?? undefined,
    };
  }
}
