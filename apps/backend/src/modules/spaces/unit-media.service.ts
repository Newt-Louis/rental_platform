import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitMediaType } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class UnitMediaService {
  // Root thư mục uploads (được main.ts serve tĩnh tại '/uploads') — file phải nằm trong đây để truy cập được qua URL.
  private readonly uploadRoot = (process.env.UPLOAD_DIR ?? 'uploads').replace(/[\\/]unit-media$/, '');

  constructor(private prisma: PrismaService) {}

  private resolvePhysicalPath(fileUrl: string): string {
    return fileUrl.startsWith('/uploads/')
      ? path.join(this.uploadRoot, fileUrl.slice('/uploads/'.length))
      : fileUrl; // dữ liệu cũ: fileUrl từng được lưu trực tiếp là đường dẫn vật lý
  }

  async getUnitMedia(unitId: string, type?: UnitMediaType) {
    await this.requireUnit(unitId);
    const where: any = { unitId };
    if (type) where.type = type;
    return this.prisma.unitMedia.findMany({
      where,
      include: { uploadedBy: { select: { id: true, fullName: true } } },
      orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async uploadMedia(
    unitId: string,
    file: Express.Multer.File,
    body: { type?: UnitMediaType; caption?: string; isCover?: boolean },
    uploadedById: string,
  ) {
    await this.requireUnit(unitId);

    const type = body.type ?? UnitMediaType.PHOTO;
    this.validateFileType(file, type);

    // Lưu file vào thư mục uploads
    const dir = path.join(this.uploadRoot, 'unit-media', unitId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, file.buffer);

    // Lấy max sortOrder hiện tại
    const maxOrder = await this.prisma.unitMedia.aggregate({
      where: { unitId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    // Nếu đánh dấu là cover → bỏ cover cũ
    if (body.isCover) {
      await this.prisma.unitMedia.updateMany({
        where: { unitId, isCover: true },
        data: { isCover: false },
      });
    }

    return this.prisma.unitMedia.create({
      data: {
        unitId,
        type,
        fileUrl: `/uploads/unit-media/${unitId}/${filename}`,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        caption: body.caption,
        sortOrder,
        isCover: body.isCover ?? false,
        uploadedById,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }

  async updateMedia(
    unitId: string,
    mediaId: string,
    body: { caption?: string; sortOrder?: number; isCover?: boolean },
    userId: string,
  ) {
    const media = await this.prisma.unitMedia.findFirst({ where: { id: mediaId, unitId } });
    if (!media) throw new NotFoundException('Media không tồn tại');

    if (body.isCover) {
      await this.prisma.unitMedia.updateMany({
        where: { unitId, isCover: true, id: { not: mediaId } },
        data: { isCover: false },
      });
    }

    return this.prisma.unitMedia.update({
      where: { id: mediaId },
      data: {
        caption: body.caption,
        sortOrder: body.sortOrder,
        isCover: body.isCover,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }

  async deleteMedia(unitId: string, mediaId: string) {
    const media = await this.prisma.unitMedia.findFirst({ where: { id: mediaId, unitId } });
    if (!media) throw new NotFoundException('Media không tồn tại');

    // Xóa file thực tế
    const physicalPath = this.resolvePhysicalPath(media.fileUrl);
    if (fs.existsSync(physicalPath)) {
      fs.unlinkSync(physicalPath);
    }

    await this.prisma.unitMedia.delete({ where: { id: mediaId } });
    return { message: 'Media đã được xóa' };
  }

  // Import unit data hàng loạt từ CSV/JSON
  async importUnits(mallId: string, file: Express.Multer.File, importedById: string) {
    const mall = await this.prisma.mall.findUnique({ where: { id: mallId } });
    if (!mall) throw new NotFoundException('Mall không tồn tại');

    const log = await this.prisma.unitImportLog.create({
      data: {
        mallId,
        fileName: file.originalname,
        status: 'PROCESSING',
        importedById,
      },
    });

    // Parse CSV/JSON
    const rows = this.parseImportFile(file);
    let successRows = 0;
    const errors: { row: number; error: string }[] = [];

    for (const [index, row] of rows.entries()) {
      try {
        this.validateImportRow(row);
        await this.prisma.unit.upsert({
          where: { mallId_code: { mallId, code: row.code } },
          update: {
            name: row.name,
            areaGFA: parseFloat(row.areaGFA),
            areaNLA: parseFloat(row.areaNLA),
            category: row.category,
            baseRentPerSqm: parseFloat(row.baseRentPerSqm ?? '0'),
            camPerSqm: parseFloat(row.camPerSqm ?? '0'),
            description: row.description,
          },
          create: {
            mallId,
            code: row.code,
            name: row.name,
            areaGFA: parseFloat(row.areaGFA),
            areaNLA: parseFloat(row.areaNLA),
            category: row.category,
            baseRentPerSqm: parseFloat(row.baseRentPerSqm ?? '0'),
            camPerSqm: parseFloat(row.camPerSqm ?? '0'),
            description: row.description,
          },
        });
        successRows++;
      } catch (err) {
        errors.push({ row: index + 2, error: err.message });
      }
    }

    const completedLog = await this.prisma.unitImportLog.update({
      where: { id: log.id },
      data: {
        totalRows: rows.length,
        successRows,
        failedRows: errors.length,
        errors: errors.length > 0 ? errors : undefined,
        status: errors.length === rows.length ? 'FAILED' : 'COMPLETED',
        completedAt: new Date(),
      },
    });

    return {
      logId: log.id,
      totalRows: rows.length,
      successRows,
      failedRows: errors.length,
      errors,
      status: completedLog.status,
    };
  }

  async getImportLogs(mallId: string) {
    return this.prisma.unitImportLog.findMany({
      where: { mallId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  private parseImportFile(file: Express.Multer.File): any[] {
    const content = file.buffer.toString('utf-8');
    if (file.mimetype === 'application/json') {
      return JSON.parse(content);
    }
    // CSV parsing đơn giản
    const lines = content.split('\n').filter((l) => l.trim());
    if (lines.length < 2) throw new BadRequestException('File CSV trống hoặc chỉ có header');
    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
      return headers.reduce((obj: any, key, i) => {
        obj[key] = values[i] ?? '';
        return obj;
      }, {});
    });
  }

  private validateImportRow(row: any) {
    if (!row.code) throw new Error('Thiếu mã unit (code)');
    if (!row.areaGFA || isNaN(parseFloat(row.areaGFA))) throw new Error('Diện tích GFA không hợp lệ');
    if (!row.areaNLA || isNaN(parseFloat(row.areaNLA))) throw new Error('Diện tích NLA không hợp lệ');
  }

  private validateFileType(file: Express.Multer.File, type: UnitMediaType) {
    const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const videoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    const docTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

    const allowed: Record<UnitMediaType, string[]> = {
      PHOTO: imageTypes,
      FLOOR_PLAN: [...imageTypes, ...docTypes],
      VIDEO: videoTypes,
      RENDER_3D: [...imageTypes, 'model/gltf-binary'],
      BROCHURE: docTypes,
      SITE_MAP: [...imageTypes, ...docTypes],
    };

    if (!allowed[type].includes(file.mimetype)) {
      throw new BadRequestException(`Loại file không được chấp nhận cho ${type}`);
    }
  }

  private async requireUnit(unitId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit || !unit.isActive) throw new NotFoundException('Unit không tồn tại');
    return unit;
  }
}
