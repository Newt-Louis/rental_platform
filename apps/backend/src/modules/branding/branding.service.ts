import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

@Injectable()
export class BrandingService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  // Bảng singleton — luôn thao tác trên 1 dòng duy nhất, tự tạo nếu chưa có.
  private async getOrCreateSettings() {
    const existing = await this.prisma.brandingSettings.findFirst();
    if (existing) return existing;
    return this.prisma.brandingSettings.create({ data: {} });
  }

  async getSettings() {
    const settings = await this.getOrCreateSettings();
    return { logoUrl: settings.logoUrl, backgroundUrl: settings.backgroundUrl };
  }

  private validateImage(file: Express.Multer.File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Chỉ hỗ trợ ảnh JPG, PNG, WebP hoặc SVG');
    }
  }

  async uploadLogo(file: Express.Multer.File, userId: string) {
    this.validateImage(file);
    const settings = await this.getOrCreateSettings();
    const { fileUrl } = await this.storage.saveFile(file, 'branding');
    return this.prisma.brandingSettings.update({
      where: { id: settings.id },
      data: { logoUrl: fileUrl, updatedById: userId },
    });
  }

  async uploadBackground(file: Express.Multer.File, userId: string) {
    this.validateImage(file);
    const settings = await this.getOrCreateSettings();
    const { fileUrl } = await this.storage.saveFile(file, 'branding');
    return this.prisma.brandingSettings.update({
      where: { id: settings.id },
      data: { backgroundUrl: fileUrl, updatedById: userId },
    });
  }

  async removeLogo(userId: string) {
    const settings = await this.getOrCreateSettings();
    return this.prisma.brandingSettings.update({
      where: { id: settings.id },
      data: { logoUrl: null, updatedById: userId },
    });
  }

  async removeBackground(userId: string) {
    const settings = await this.getOrCreateSettings();
    return this.prisma.brandingSettings.update({
      where: { id: settings.id },
      data: { backgroundUrl: null, updatedById: userId },
    });
  }
}
