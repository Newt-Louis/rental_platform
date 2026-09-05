import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// Mã hoá đối xứng cho secret lưu trong DB (vd mật khẩu SMTP) -- không phải cho
// password người dùng (đã có bcrypt riêng). Key luôn được kéo giãn qua scrypt
// thành đúng 32 byte, nên ENCRYPTION_KEY trong env có thể là chuỗi bất kỳ.
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer | null;

  constructor() {
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) {
      this.logger.warn('ENCRYPTION_KEY chưa được cấu hình -- các tính năng lưu secret vào DB (vd SMTP password) sẽ bị vô hiệu hoá');
      this.key = null;
    } else {
      this.key = scryptSync(secret, 'thiso-leasing-encryption', 32);
    }
  }

  get isConfigured(): boolean {
    return this.key !== null;
  }

  encrypt(plainText: string): string {
    if (!this.key) {
      throw new Error('ENCRYPTION_KEY chưa được cấu hình trên server, không thể lưu secret này');
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
  }

  decrypt(payload: string): string {
    if (!this.key) {
      throw new Error('ENCRYPTION_KEY chưa được cấu hình trên server, không thể đọc secret đã lưu');
    }
    const [ivHex, authTagHex, ciphertextHex] = payload.split(':');
    if (!ivHex || !authTagHex || !ciphertextHex) {
      throw new Error('Dữ liệu mã hoá không đúng định dạng');
    }
    const decipher = createDecipheriv(this.algorithm, this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
