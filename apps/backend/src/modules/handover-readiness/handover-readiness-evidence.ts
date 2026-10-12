import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as path from 'path';
import { HANDOVER_POLICY } from './handover-readiness.policy';

/**
 * Confirmation photos must be REAL images: extension, declared MIME type and
 * the file's magic bytes all have to agree (same approach as
 * contracts/contract-file-validation.ts). A renamed PDF or an HTML file with a
 * .jpg name is rejected before anything touches storage.
 */
const IMAGE_KINDS: Record<string, { mimes: string[]; check: (b: Buffer) => boolean; mime: string }> = {
  jpg: { mimes: ['image/jpeg', 'image/jpg'], mime: 'image/jpeg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mimes: ['image/jpeg', 'image/jpg'], mime: 'image/jpeg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: {
    mimes: ['image/png'],
    mime: 'image/png',
    check: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  },
  webp: {
    mimes: ['image/webp'],
    mime: 'image/webp',
    check: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
};

export interface ValidatedImage {
  mimeType: string;
  sha256: string;
}

export function validateEvidenceImage(file?: Express.Multer.File): ValidatedImage {
  if (!file?.buffer?.length) {
    throw new BadRequestException({ code: 'HANDOVER_EVIDENCE_INVALID', message: 'Vui lòng chọn một ảnh hợp lệ và không rỗng.' });
  }
  if (file.size > HANDOVER_POLICY.maxEvidenceBytes || file.buffer.length > HANDOVER_POLICY.maxEvidenceBytes) {
    throw new BadRequestException({ code: 'HANDOVER_EVIDENCE_TOO_LARGE', message: 'Ảnh vượt quá dung lượng cho phép (15MB).' });
  }
  const ext = path.extname(file.originalname || '').slice(1).toLowerCase();
  const kind = IMAGE_KINDS[ext];
  if (!kind) {
    throw new BadRequestException({ code: 'HANDOVER_EVIDENCE_INVALID', message: 'Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.' });
  }
  const declared = (file.mimetype || '').toLowerCase().split(';', 1)[0].trim();
  if (declared && declared !== 'application/octet-stream' && !kind.mimes.includes(declared)) {
    throw new BadRequestException({ code: 'HANDOVER_EVIDENCE_INVALID', message: 'Định dạng ảnh không khớp với phần mở rộng.' });
  }
  if (!kind.check(file.buffer)) {
    throw new BadRequestException({ code: 'HANDOVER_EVIDENCE_INVALID', message: 'Nội dung file không phải ảnh hợp lệ.' });
  }
  return { mimeType: kind.mime, sha256: createHash('sha256').update(file.buffer).digest('hex') };
}
