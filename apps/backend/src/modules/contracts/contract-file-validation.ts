import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

const ALLOWED_MIME_TYPES: Record<string, Set<string>> = {
  pdf: new Set(['application/pdf']),
  jpg: new Set(['image/jpeg', 'image/jpg']),
  jpeg: new Set(['image/jpeg', 'image/jpg']),
  png: new Set(['image/png']),
  doc: new Set(['application/msword']),
  docx: new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  xls: new Set(['application/vnd.ms-excel']),
  xlsx: new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
};

const GENERIC_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
]);

function beginsWith(bytes: Buffer, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function hasExpectedSignature(extension: string, bytes: Buffer): boolean {
  if (extension === 'pdf') return bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'));
  if (extension === 'jpg' || extension === 'jpeg') return beginsWith(bytes, [0xff, 0xd8, 0xff]);
  if (extension === 'png') return beginsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === 'doc' || extension === 'xls') {
    return beginsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  if (extension === 'docx' || extension === 'xlsx') {
    return beginsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
      || beginsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
      || beginsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);
  }
  return false;
}

function isWrappedStreamableFileJson(bytes: Buffer): boolean {
  const prefix = bytes.subarray(0, 4096).toString('utf8').trimStart();
  if (!prefix.startsWith('{')) return false;
  try {
    const value = JSON.parse(prefix);
    return value?.success === true
      && value?.data?.logger?.context === 'StreamableFile'
      && typeof value?.data?.stream?.path === 'string';
  } catch {
    return false;
  }
}

export function validateContractFileUpload(file?: Express.Multer.File): void {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Vui lòng chọn một file hợp lệ và không rỗng');
  }

  const extension = path.extname(file.originalname || '').slice(1).toLowerCase();
  const acceptedMimeTypes = ALLOWED_MIME_TYPES[extension];
  if (!acceptedMimeTypes) {
    throw new BadRequestException('Chỉ hỗ trợ PDF, JPG, JPEG, PNG, DOC, DOCX, XLS và XLSX');
  }

  const mimeType = (file.mimetype || '').toLowerCase().split(';', 1)[0].trim();
  if (!GENERIC_MIME_TYPES.has(mimeType) && !acceptedMimeTypes.has(mimeType)) {
    throw new BadRequestException('Định dạng nội dung file không khớp với phần mở rộng');
  }

  if (isWrappedStreamableFileJson(file.buffer)) {
    throw new BadRequestException(
      'File này là bản tải xuống bị hỏng từ hệ thống cũ. Vui lòng chọn lại file gốc.',
    );
  }

  if (!hasExpectedSignature(extension, file.buffer)) {
    throw new BadRequestException('Nội dung file bị hỏng hoặc không đúng định dạng');
  }
}
