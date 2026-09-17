/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 — the official PDF renders the canonical model.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildProposalDocDefinition, ProposalPdfService } from './proposal-pdf.service';
import { buildProposalDocument, buildFacts, computeSourceFingerprint, approvalFromRoutePreview } from './document/proposal-document.mapper';
import { proposalDocumentSource } from './document/proposal-document.fixture';
import { PROPOSAL_DOCUMENT_SCHEMA_VERSION } from './document/proposal-document.types';

const NOW = new Date('2026-09-14T02:00:00.000Z');
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Every string pdfmake will lay out: `text` values and `ul` entries only. */
function texts(node: unknown, out: string[] = [], key?: string): string[] {
  if (typeof node === 'string') {
    if (key === 'text' || key === 'ul') out.push(node);
  } else if (Array.isArray(node)) {
    node.forEach((n) => texts(n, out, key === 'ul' ? 'ul' : undefined));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'image' || k === 'layout' || k === 'footer' || k === 'info') continue;
      texts(v, out, k);
    }
  }
  return out;
}

function documentWithHistory() {
  const src = proposalDocumentSource({
    status: 'UNDER_REVIEW',
    rentCurrency: 'USD',
    exchangeRate: 25_450,
    exchangeRateSource: 'Vietcombank',
    approvalWorkflow: {
      status: 'IN_PROGRESS',
      createdAt: new Date('2026-09-10T02:00:00.000Z'),
      steps: [
        { id: 's1', stepOrder: 1, stepName: 'Leasing Manager Approval', approverRole: 'LEASING_MANAGER', approverId: 'u1', approver: { id: 'u1', fullName: 'Trần Thị B' }, status: 'APPROVED', decidedAt: new Date('2026-09-11T04:30:00.000Z'), comment: 'Đồng ý' },
        { id: 's2', stepOrder: 2, stepName: 'Mall Director Approval', approverRole: 'MALL_DIRECTOR', approverId: 'u2', approver: { id: 'u2', fullName: 'Lê Văn C' }, status: 'PENDING', decidedAt: null, comment: null },
      ],
    },
  });
  src.editorContent = {
    schemaVersion: PROPOSAL_DOCUMENT_SCHEMA_VERSION,
    content: {
      docNumber: null, documentDate: null, subject: null, preamble: null, bodyIntro: 'Đoạn mở đầu người lập đã sửa.',
      closingLine: null, itemOrder: null, logoDataUrl: PNG_1PX, layoutImageDataUrl: PNG_1PX, primaryColor: '#1b5e20',
      items: { PAYMENT: { narrativeText: 'Thanh toán trước ngày 10 hằng tháng.', note: 'Theo đề nghị của khách' } },
    },
    sourceFingerprint: computeSourceFingerprint(buildFacts(src)),
    contentVersion: 2, savedAt: '2026-09-09T00:00:00.000Z', savedById: 'user-author',
  };
  return buildProposalDocument(src, NOW);
}

describe('Official proposal PDF', () => {
  it('PROP-PDF-025 carries the author’s saved wording', () => {
    const all = texts(buildProposalDocDefinition(documentWithHistory())).join('\n');
    expect(all).toContain('Đoạn mở đầu người lập đã sửa.');
    expect(all).toContain('Thanh toán trước ngày 10 hằng tháng.');
    expect(all).toContain('Theo đề nghị của khách');
  });

  it('PROP-PDF-026 prints the approval history exactly as ApprovalStep holds it', () => {
    const model = documentWithHistory();
    const all = texts(buildProposalDocDefinition(model)).join('\n');

    expect(all).toContain('LEASING MANAGER APPROVAL');
    expect(all).toContain('Trần Thị B');
    expect(all).toContain('Ý kiến: Đồng ý');
    // 04:30Z is 11:30 in Hồ Chí Minh City; vi-VN prints the time first.
    expect(all).toContain('Duyệt lúc 11:30 11/09/2026');
    expect(all).toContain('NGƯỜI LẬP');
    expect(all).toContain('Nguyễn Thị Lập');
  });

  it('PROP-PDF-026 marks the pending director as not yet approved', () => {
    const def = buildProposalDocDefinition(documentWithHistory());
    const block = texts(def.content[def.content.length - 1]);
    const director = block.indexOf('Lê Văn C');
    expect(director).toBeGreaterThan(-1);
    const directorCell = block.slice(director - 2, director + 1).join(' | ');
    expect(block[director - 2]).toBe('MALL DIRECTOR APPROVAL');
    expect(directorCell).toContain('CHƯA DUYỆT');
    expect(directorCell).not.toContain('ĐÃ DUYỆT');
    expect(block.filter((t) => /^Duyệt lúc/.test(t))).toHaveLength(1);
  });

  it('prints facts from the model: mall, FX with source, and no hard-coded rate or person', () => {
    const all = texts(buildProposalDocDefinition(documentWithHistory())).join('\n');
    expect(all).toContain('THISO Mall Hà Nội');
    expect(all).toContain('Hà Nội, ngày');
    expect(all).toContain('1 USD = 25.450 VND');
    expect(all).toContain('Nguồn: Vietcombank');
    expect(all).not.toMatch(/26[.,]?340|Thiso Mall|PHẠM THỊ KHÁNH TRANG/);
  });

  it('says a draft has not been routed instead of drawing signatures', () => {
    const all = texts(buildProposalDocDefinition(buildProposalDocument(proposalDocumentSource(), NOW))).join('\n');
    expect(all).toContain('Chưa trình duyệt');
    expect(all).not.toContain('ĐÃ DUYỆT');
  });

  it('PROP-ROUTE-PREVIEW-001 a draft shows a box for every expected step, named with the position holder, and never as a signature', () => {
    const doc = buildProposalDocument(proposalDocumentSource(), NOW);
    doc.approval = approvalFromRoutePreview({
      evaluatedAt: NOW.toISOString(),
      policyConfigured: true,
      steps: [
        { stepOrder: 1, stepName: 'Leasing Manager Approval', approverRole: 'LEASING_MANAGER', approverId: 'u-m', approverName: 'Tran Thi B' },
        { stepOrder: 2, stepName: 'Finance Review', approverRole: 'FINANCE', approverId: 'u-f', approverName: 'Pham Thi D' },
        { stepOrder: 3, stepName: 'Legal Review', approverRole: 'LEGAL', approverId: null, approverName: null },
      ],
      issues: [{ stepOrder: 3, stepName: 'Legal Review', reason: 'STEP_UNASSIGNED' }],
    });
    const all = texts(buildProposalDocDefinition(doc)).join('\n');
    expect(all).toContain('quy trình phê duyệt dự kiến theo cấu hình hiện tại');
    for (const text of ['LEASING MANAGER APPROVAL', 'FINANCE REVIEW', 'LEGAL REVIEW', 'Tran Thi B', 'Pham Thi D', 'Chưa có người phụ trách']) {
      expect(all).toContain(text);
    }
    expect(all.match(/NGƯỜI DUYỆT DỰ KIẾN — CHƯA DUYỆT/g)).toHaveLength(3);
    expect(all).not.toContain('ĐÃ DUYỆT');
  });

  it('PROP-ROUTE-PREVIEW-002 a Mall without approval rules says so on the draft', () => {
    const doc = buildProposalDocument(proposalDocumentSource(), NOW);
    doc.approval = approvalFromRoutePreview({ evaluatedAt: NOW.toISOString(), policyConfigured: false, steps: [], issues: [{ stepOrder: null, stepName: null, reason: 'NO_ACTIVE_POLICY' }] });
    expect(texts(buildProposalDocDefinition(doc)).join('\n')).toContain('Mall chưa cấu hình quy trình phê duyệt');
  });

  it('PROP-REVISE-PDF a withdrawn version says it no longer carries approval', () => {
    const doc = documentWithHistory();
    doc.approval = { ...doc.approval, state: 'WITHDRAWN' };
    expect(texts(buildProposalDocDefinition(doc)).join('\n')).toContain('Tờ trình đã được thu hồi');
  });

  it('renders a real PDF including the saved logo and layout image', async () => {
    const buffer = await new ProposalPdfService().render(documentWithHistory());
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(10_000);
    expect(buffer.toString('latin1')).toMatch(/\/Subtype \/Image/);
  }, 60_000);

  it('PROP-PDF-028 every character the document lays out exists in the embedded Roboto faces', () => {
    const vfs: Record<string, string> = require('pdfmake/build/vfs_fonts');
    const faces = ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Italic.ttf', 'Roboto-MediumItalic.ttf'];
    const chars = new Set(texts(buildProposalDocDefinition(documentWithHistory())).join('').replace(/\s/g, ''));

    for (const face of faces) {
      const covered = cmapCoverage(Buffer.from(vfs[face], 'base64'));
      const missing = [...chars].filter((ch) => !covered.has(ch.codePointAt(0)!));
      expect({ face, missing }).toEqual({ face, missing: [] });
    }
  });
});

describe('Proposal document runtime code — hard-code guard', () => {
  const runtimeFiles = [
    'document/proposal-document.mapper.ts',
    'document/proposal-document.service.ts',
    'proposal-pdf.service.ts',
  ].map((f) => path.join(__dirname, f));

  it('PROP-DOC-008 / PROP-DOC-003 no hard-coded mall, person or exchange rate remains', () => {
    for (const file of runtimeFiles) {
      const source = fs.readFileSync(file, 'utf8');
      for (const banned of [/Thiso Mall/, /PHẠM THỊ KHÁNH TRANG/, /NGUYỄN ĐÌNH CÔNG/, /TRẦN VIÊN NGỌC OANH/, /26[.,]?340/, /preferredCategory/]) {
        expect({ file: path.basename(file), banned: String(banned), found: banned.test(source) })
          .toEqual({ file: path.basename(file), banned: String(banned), found: false });
      }
    }
  });
});

/** Minimal TrueType cmap (format 4) reader: the set of mapped code points. */
function cmapCoverage(buf: Buffer): Set<number> {
  const u16 = (o: number) => buf.readUInt16BE(o);
  const u32 = (o: number) => buf.readUInt32BE(o);
  let cmap = -1;
  for (let i = 0; i < u16(4); i++) {
    const rec = 12 + i * 16;
    if (buf.toString('ascii', rec, rec + 4) === 'cmap') cmap = u32(rec + 8);
  }
  const covered = new Set<number>();
  for (let i = 0; i < u16(cmap + 2); i++) {
    const rec = cmap + 4 + i * 8;
    const off = cmap + u32(rec + 4);
    if (u16(rec) !== 3 || u16(rec + 2) !== 1 || u16(off) !== 4) continue;
    const segX2 = u16(off + 6);
    const endO = off + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = u16(endO + s * 2), start = u16(startO + s * 2), delta = u16(deltaO + s * 2), ro = u16(rangeO + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g = ro === 0 ? (c + delta) & 0xffff : u16(rangeO + s * 2 + ro + (c - start) * 2);
        if (ro !== 0 && g !== 0) g = (g + delta) & 0xffff;
        if (g !== 0) covered.add(c);
      }
    }
  }
  return covered;
}
