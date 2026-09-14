import { BadRequestException } from '@nestjs/common';
import { validateContractFileUpload } from './contract-file-validation';

function upload(name: string, mimetype: string, bytes: Buffer): Express.Multer.File {
  return { originalname: name, mimetype, buffer: bytes, size: bytes.length } as Express.Multer.File;
}

describe('validateContractFileUpload', () => {
  it.each([
    ['lease.pdf', 'application/pdf', Buffer.from('%PDF-1.7\ncontent')],
    ['photo.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ['photo.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['agreement.doc', 'application/msword', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ['agreement.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('PK\u0003\u0004document')],
    ['schedule.xls', 'application/vnd.ms-excel', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ['schedule.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from('PK\u0003\u0004workbook')],
  ])('accepts a valid %s upload', (name, mimetype, bytes) => {
    expect(() => validateContractFileUpload(upload(name, mimetype, bytes))).not.toThrow();
  });

  it('rejects the former StreamableFile JSON response renamed as a PDF', () => {
    const bytes = Buffer.from(JSON.stringify({
      success: true,
      data: { logger: { context: 'StreamableFile' }, stream: { path: '/app/uploads/contracts/original.pdf' } },
    }));

    expect(() => validateContractFileUpload(upload('downloaded.pdf', 'application/pdf', bytes)))
      .toThrow('bản tải xuống bị hỏng');
  });

  it('rejects extension and MIME mismatches', () => {
    expect(() => validateContractFileUpload(upload('photo.pdf', 'image/png', Buffer.from('%PDF-1.7'))))
      .toThrow('không khớp');
  });

  it('rejects unsupported and signature-invalid files', () => {
    expect(() => validateContractFileUpload(upload('payload.txt', 'text/plain', Buffer.from('text'))))
      .toThrow(BadRequestException);
    expect(() => validateContractFileUpload(upload('fake.xlsx', 'application/octet-stream', Buffer.from('not a zip'))))
      .toThrow('bị hỏng');
  });
});
