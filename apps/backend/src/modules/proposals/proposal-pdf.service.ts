/* eslint-disable @typescript-eslint/no-var-requires */
import { Injectable, Logger } from '@nestjs/common';
import type {
  ProposalDocumentApprovalStep,
  ProposalDocumentModel,
} from './document/proposal-document.types';

type Margin = [number, number, number, number];

export interface ProposalPdfOptions {
  /**
   * EXTERNAL omits approvers' comments, which are internal deliberation; who
   * decided and when stays, as evidence the document was approved.
   */
  audience?: 'INTERNAL' | 'EXTERNAL';
}

const PRESENTATION_LABEL: Record<ProposalDocumentApprovalStep['presentation'], string> = {
  APPROVED_BY: 'ĐÃ DUYỆT',
  REJECTED_BY: 'TỪ CHỐI',
  EXPECTED_APPROVER: 'NGƯỜI DUYỆT DỰ KIẾN — CHƯA DUYỆT',
  SKIPPED: 'KHÔNG CÒN HIỆU LỰC',
};

/** What the approval block says above the step boxes. */
export function approvalNotice(approval: ProposalDocumentModel['approval']): string | null {
  if (approval.state === 'WITHDRAWN') {
    return 'Tờ trình đã được thu hồi để chỉnh sửa — phiên bản này không còn hiệu lực phê duyệt.';
  }
  if (approval.state !== 'NOT_SUBMITTED') return null;
  if (!approval.steps.length) {
    return approval.preview && !approval.preview.policyConfigured
      ? 'Chưa trình duyệt — Mall chưa cấu hình quy trình phê duyệt.'
      : 'Chưa trình duyệt — quy trình phê duyệt được xác định khi Proposal được trình.';
  }
  return 'Chưa trình duyệt — quy trình phê duyệt dự kiến theo cấu hình hiện tại, được chốt khi trình duyệt.';
}

function formatVnDateTime(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 — the official Tờ trình renderer.
 *
 * Renders a ProposalDocumentModel and nothing else. It used to read the raw
 * Proposal and run its own mapping, ignoring everything the author edited, so
 * the approver's PDF and the author's print disagreed. Mapping now lives in
 * proposal-document.mapper.ts only.
 *
 * `render` returns the exact bytes served by GET /proposals/:id/pdf, so a later
 * email attachment can reuse it instead of growing a third renderer.
 */
@Injectable()
export class ProposalPdfService {
  private readonly logger = new Logger(ProposalPdfService.name);

  render(model: ProposalDocumentModel, options: ProposalPdfOptions = {}): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const PdfPrinter = require('pdfmake');
        const vfs: Record<string, string> = require('pdfmake/build/vfs_fonts');
        const printer = new PdfPrinter({
          Roboto: {
            normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
            bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
            italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
            bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
          },
        });
        const pdfDoc = printer.createPdfKitDocument(buildProposalDocDefinition(model, options));
        const chunks: Buffer[] = [];
        pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', (err: Error) => reject(err));
        pdfDoc.end();
      } catch (err) {
        this.logger.error(`PDF generation failed: ${(err as Error).message}`);
        reject(err);
      }
    });
  }
}

/** Pure: the pdfmake definition for a model. Exported for tests. */
export function buildProposalDocDefinition(model: ProposalDocumentModel, options: ProposalPdfOptions = {}): any {
  const { header, facts, presentation } = model;
  const accent = presentation.primaryColor;
  const date = header.documentDate ? header.documentDate.split('-') : null;
  const dateLine = `${header.city ?? '……'}, ngày ${date?.[2] ?? '…'} tháng ${date?.[1] ?? '…'} năm ${date?.[0] ?? '……'}`;

  const itemRows = model.items.map((item) => {
    const cell: any[] = [];
    if (item.factText) cell.push({ text: item.factText });
    if (item.narrativeText) cell.push({ text: item.narrativeText, margin: [0, item.factText ? 3 : 0, 0, 0] as Margin });
    return [
      { text: String(item.stt), alignment: 'center' },
      { text: item.label },
      cell.length ? { stack: cell } : { text: '' },
      { text: item.note, fontSize: 8, color: '#555', italics: true },
    ];
  });

  const letterheadLeft: any[] = [];
  if (presentation.logoDataUrl) {
    letterheadLeft.push({ image: presentation.logoDataUrl, fit: [60, 60], width: 60 });
  }

  return {
    pageSize: 'A4',
    pageMargins: [50, 50, 40, 60],
    // A submitted version renders with fixed metadata dates, so the same version
    // (and the same approval cut-off) always produces byte-identical output: that is
    // what lets an email attachment be verified against the version it came from.
    info: {
      title: `Tờ trình ${model.proposalNumber}${model.version ? ` - phiên bản ${model.version.versionNumber}` : ''}`,
      subject: header.subject,
      ...(model.version
        ? {
            creationDate: new Date(model.version.submittedAt),
            modDate: new Date(model.approvalAsOf ?? model.version.submittedAt),
          }
        : {}),
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.3 },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${model.proposalNumber}${model.version ? ` · Phiên bản ${model.version.versionNumber}` : ' · Bản nháp'} · Trang ${currentPage}/${pageCount}`,
      fontSize: 8, alignment: 'right', margin: [0, 10, 40, 0], color: '#888',
    }),
    content: [
      {
        columns: [
          ...letterheadLeft,
          {
            width: '*',
            stack: header.organisationLines.map((line) => ({ text: line, bold: true, alignment: 'center' })),
          },
          {
            width: 'auto',
            stack: [
              { text: `Số/No: ${header.docNumber}`, fontSize: 9, alignment: 'right' },
              { text: dateLine, fontSize: 9, alignment: 'right', italics: true },
            ],
          },
        ],
        columnGap: 10,
        margin: [0, 0, 0, 16] as Margin,
      },
      { text: header.title, fontSize: 14, bold: true, alignment: 'center', color: accent, margin: [0, 0, 0, 6] as Margin },
      { text: header.subject, bold: true, alignment: 'center', margin: [20, 0, 20, 14] as Margin },
      { text: header.addressee, fontSize: 11, bold: true, alignment: 'center', margin: [0, 0, 0, 12] as Margin },
      { ul: model.preamble, margin: [20, 0, 0, 10] as Margin },
      { text: model.bodyIntro, margin: [0, 0, 0, 14] as Margin },
      { text: 'I.   CÁC ĐIỀU KHOẢN CHI TIẾT ĐÃ THỎA THUẬN GIỮA HAI BÊN:', bold: true, color: accent, margin: [0, 0, 0, 6] as Margin },
      { text: `1.1  Thương hiệu ${facts.party.brandName ?? 'Chưa xác định'}`, bold: true, margin: [20, 0, 0, 6] as Margin },
      {
        table: {
          headerRows: 1,
          widths: [22, 110, '*', 85],
          body: [
            ['STT', 'HẠNG MỤC', 'ĐIỀU KIỆN THƯƠNG MẠI', 'GHI CHÚ'].map((h) => ({
              text: h, bold: true, fontSize: 9, fillColor: '#f0f0f0', alignment: 'center',
            })),
            ...itemRows,
          ],
        },
        fontSize: 9,
        layout: tableLayout(4),
        margin: [0, 0, 0, 18] as Margin,
      },
      { text: 'II.  LAYOUT MẶT BẰNG NHƯ SAU:', bold: true, color: accent, margin: [0, 0, 0, 6] as Margin },
      presentation.layoutImageDataUrl
        ? { image: presentation.layoutImageDataUrl, fit: [480, 320], alignment: 'center', margin: [0, 0, 0, 18] as Margin }
        : { text: '(Chưa đính kèm layout mặt bằng)', fontSize: 9, color: '#888', alignment: 'center', margin: [0, 0, 0, 18] as Margin },
      { text: model.closingLine, margin: [0, 0, 0, 14] as Margin },
      approvalBlock(model, options.audience ?? 'INTERNAL'),
    ],
  };
}

function tableLayout(padding: number) {
  return {
    hLineColor: '#999', vLineColor: '#999',
    hLineWidth: () => 0.5, vLineWidth: () => 0.5,
    paddingLeft: () => 5, paddingRight: () => 5,
    paddingTop: () => padding, paddingBottom: () => padding,
  };
}

/**
 * Who prepared the document and what each approval step actually did. A
 * pending step names the expected approver and says it is not approved; it is
 * never drawn as a signature.
 */
function approvalBlock(model: ProposalDocumentModel, audience: 'INTERNAL' | 'EXTERNAL'): any {
  const prepared = model.facts.preparedBy;
  const cells: any[] = [{
    stack: [
      { text: 'NGƯỜI LẬP', fontSize: 8, bold: true, alignment: 'center' },
      { text: prepared.fullName ?? 'Không xác định', fontSize: 9, bold: true, alignment: 'center', margin: [0, 24, 0, 0] as Margin },
    ],
  }];

  const notice = approvalNotice(model.approval);
  // Without steps the notice fills the row; with steps it is printed above the boxes.
  if (notice && !model.approval.steps.length) {
    cells.push({
      text: notice,
      fontSize: 8, italics: true, color: '#555', alignment: 'center', margin: [0, 16, 0, 0] as Margin,
    });
  }

  for (const step of model.approval.steps) {
    const approved = step.presentation === 'APPROVED_BY';
    const rejected = step.presentation === 'REJECTED_BY';
    cells.push({
      fillColor: approved ? '#f3faf3' : rejected ? '#fdf2f2' : undefined,
      stack: [
        { text: step.stepName.toUpperCase(), fontSize: 8, bold: true, alignment: 'center' },
        {
          text: PRESENTATION_LABEL[step.presentation], fontSize: 7, alignment: 'center', margin: [0, 2, 0, 0] as Margin,
          color: approved ? '#1b5e20' : rejected ? '#b71c1c' : '#777',
        },
        { text: step.approverName ?? 'Chưa có người phụ trách', fontSize: 9, bold: approved || rejected, alignment: 'center', margin: [0, 14, 0, 0] as Margin },
        ...(step.decidedAt
          ? [{ text: `${rejected ? 'Từ chối' : 'Duyệt'} lúc ${formatVnDateTime(step.decidedAt)}`, fontSize: 7, color: '#555', alignment: 'center', margin: [0, 2, 0, 0] as Margin }]
          : []),
        ...(step.comment && audience === 'INTERNAL'
          ? [{ text: `Ý kiến: ${step.comment}`, fontSize: 7, italics: true, color: '#555', alignment: 'center', margin: [0, 2, 0, 0] as Margin }]
          : []),
      ],
    });
  }

  const perRow = 4;
  const body: any[][] = [];
  for (let i = 0; i < cells.length; i += perRow) {
    const row = cells.slice(i, i + perRow);
    while (row.length < Math.min(perRow, cells.length)) row.push({ text: '', border: [false, false, false, false] });
    body.push(row);
  }

  return {
    unbreakable: cells.length <= perRow,
    stack: [
      ...(notice && model.approval.steps.length
        ? [{ text: notice, fontSize: 8, italics: true, color: '#555', margin: [0, 0, 0, 4] as Margin }]
        : []),
      {
        table: { widths: body[0].map(() => '*'), body },
        layout: tableLayout(8),
      },
    ],
  };
}

