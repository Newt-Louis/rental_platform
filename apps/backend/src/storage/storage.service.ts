import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
    this.ensureUploadDir();
  }

  private ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async saveFile(
    file: Express.Multer.File,
    subfolder: string = '',
  ): Promise<{ fileName: string; filePath: string; fileUrl: string }> {
    const subDir = subfolder
      ? path.join(this.uploadDir, subfolder)
      : this.uploadDir;

    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir, { recursive: true });
    }

    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    const fileName = `${timestamp}_${baseName}${ext}`;
    const fullPath = path.join(subDir, fileName);

    fs.writeFileSync(fullPath, file.buffer);

    const relativePath = subfolder
      ? `${subfolder}/${fileName}`
      : fileName;

    this.logger.log(`File saved: ${fullPath}`);

    return {
      fileName: file.originalname,
      filePath: relativePath,
      fileUrl: `/uploads/${relativePath}`,
    };
  }

  async deleteFile(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.uploadDir, filePath);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        this.logger.log(`File deleted: ${fullPath}`);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Error deleting file: ${error.message}`);
      return false;
    }
  }

  getFileStream(filePath: string): fs.ReadStream | null {
    const fullPath = path.join(this.uploadDir, filePath);
    if (fs.existsSync(fullPath)) {
      return fs.createReadStream(fullPath);
    }
    return null;
  }
}
