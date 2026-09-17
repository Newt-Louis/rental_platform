/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 / CR-PROPOSAL-MAPPING-002 — document mapping.
 *
 * Every row a Tờ trình prints is decided by buildProposalDocument. These tests
 * pin where each value comes from, so a hard-coded mall, person or rate cannot
 * come back without a test naming it.
 */
import {
  buildProposalDocument,
  computeSourceFingerprint,
  buildFacts,
  normalizeStoredContent,
} from './proposal-document.mapper';
import { proposalDocumentSource } from './proposal-document.fixture';
import { PROPOSAL_DOCUMENT_SCHEMA_VERSION } from './proposal-document.types';

const NOW = new Date('2026-09-14T02:00:00.000Z');
const item = (doc: ReturnType<typeof buildProposalDocument>, key: string) => doc.items.find((i) => i.key === key)!;
const allText = (doc: ReturnType<typeof buildProposalDocument>) => JSON.stringify(doc);

describe('Proposal document — authoritative facts', () => {
  it('PROP-DOC-001 takes the Mall from Proposal → Unit → Mall, never a hard-coded name', () => {
    const doc = buildProposalDocument(proposalDocumentSource(), NOW);

    expect(doc.facts.mall).toEqual({ id: 'mall-hn', code: 'THISO-HN', name: 'THISO Mall Hà Nội', city: 'Hà Nội' });
    expect(doc.header.subject).toContain('THISO Mall Hà Nội');
    expect(doc.header.city).toBe('Hà Nội');
    expect(allText(doc)).not.toContain('Thiso Mall');
  });

  it('PROP-DOC-001 says the Mall is unknown when the relation is missing, rather than inventing one', () => {
    const src = proposalDocumentSource();
    const doc = buildProposalDocument({ ...src, unit: { ...src.unit, mall: null } }, NOW);

    expect(doc.facts.mall.name).toBeNull();
    expect(doc.header.subject).toContain('Chưa xác định');
    expect(allText(doc)).not.toMatch(/thiso mall(?! hà nội)/i);
    expect(doc.warnings).toContain('Không xác định được Mall của Proposal.');
  });

  it('PROP-DOC-002 resolves the preparer from createdById', () => {
    const doc = buildProposalDocument(proposalDocumentSource(), NOW);
    expect(doc.facts.preparedBy).toEqual({
      userId: 'user-author', fullName: 'Nguyễn Thị Lập', role: 'LEASING_EXECUTIVE', department: 'Leasing',
    });
  });

  it('PROP-DOC-003 has no named-person fallback when the creator cannot be resolved', () => {
    const doc = buildProposalDocument(proposalDocumentSource({ creator: null }), NOW);

    expect(doc.facts.preparedBy.fullName).toBeNull();
    const text = allText(doc);
    for (const name of ['PHẠM THỊ KHÁNH TRANG', 'NGUYỄN ĐÌNH CÔNG', 'TRẦN VIÊN NGỌC OANH']) {
      expect(text).not.toContain(name);
    }
    expect(doc.warnings).toContain('Không xác định được người lập Proposal.');
  });

  it('PROP-DOC-004 prefers the Category master row over free text', () => {
    const doc = buildProposalDocument(proposalDocumentSource(), NOW);

    expect(doc.facts.category).toEqual({ id: 'cat-tech', code: 'TECH', name: 'Công nghệ', source: 'LEAD_MASTER', legacy: false });
    expect(item(doc, 'CATEGORY').factText).toBe('Công nghệ');
  });

  it('PROP-DOC-004 lets the contracting Tenant master win over the Lead', () => {
    const doc = buildProposalDocument(proposalDocumentSource({
      tenant: {
        companyName: 'CellphoneS Retail Co.', brandName: 'CellphoneS',
        category: null, categoryRef: { id: 'cat-elec', code: 'ELEC', name: 'Điện tử' },
      },
    }), NOW);

    expect(doc.facts.category.source).toBe('TENANT_MASTER');
    expect(doc.facts.party.companyName).toBe('CellphoneS Retail Co.');
  });

  it('PROP-DOC-005 keeps an unmapped legacy category visible, flagged, and not re-mapped', () => {
    const src = proposalDocumentSource();
    const doc = buildProposalDocument({ ...src, lead: { ...src.lead!, category: 'Supermarket', categoryRef: null } }, NOW);

    expect(doc.facts.category).toEqual({ id: null, code: null, name: 'Supermarket', source: 'LEAD_LEGACY_TEXT', legacy: true });
    expect(item(doc, 'CATEGORY').factText).toBe('Supermarket');
    expect(doc.warnings.some((w) => w.includes('Supermarket'))).toBe(true);
  });

  it('PROP-DOC-005 reads Tenant.category, the column that exists (not preferredCategory)', () => {
    const doc = buildProposalDocument(proposalDocumentSource({
      lead: null,
      tenant: { companyName: 'A', brandName: 'B', category: 'F&B', categoryRef: null },
    }), NOW);
    expect(doc.facts.category.source).toBe('TENANT_LEGACY_TEXT');
  });

  it('PROP-DOC-006 takes the exchange rate from the Proposal', () => {
    const doc = buildProposalDocument(proposalDocumentSource({ rentCurrency: 'USD', exchangeRate: 25_450 }), NOW);
    expect(item(doc, 'EXCHANGE_RATE').factText).toContain('1 USD = 25.450 VND');
  });

  it('PROP-DOC-007 shows the exchange-rate source when one is recorded', () => {
    const doc = buildProposalDocument(proposalDocumentSource({
      rentCurrency: 'USD', exchangeRate: 25_450, exchangeRateSource: 'Vietcombank 12/09/2026',
    }), NOW);
    expect(item(doc, 'EXCHANGE_RATE').factText).toContain('Nguồn: Vietcombank 12/09/2026');
  });

  it('PROP-DOC-007 omits the FX row for a VND Proposal with no rate, and does not invent one when USD has none', () => {
    const vnd = buildProposalDocument(proposalDocumentSource(), NOW);
    expect(vnd.items.some((i) => i.key === 'EXCHANGE_RATE')).toBe(false);

    const usd = buildProposalDocument(proposalDocumentSource({ rentCurrency: 'USD' }), NOW);
    expect(item(usd, 'EXCHANGE_RATE').factText).toBe('Chưa ghi nhận tỷ giá cho Proposal này.');
    expect(usd.warnings).toContain('Proposal tính bằng USD nhưng chưa ghi nhận tỷ giá.');
  });

  it('PROP-DOC-008 prints no hard-coded rate whatever the Proposal holds', () => {
    for (const rate of [null, 24_000, 26_340]) {
      const doc = buildProposalDocument(proposalDocumentSource({ rentCurrency: 'USD', exchangeRate: rate }), NOW);
      const fx = item(doc, 'EXCHANGE_RATE');
      const printed = `${fx.factText} ${fx.narrativeText}`;
      if (rate === 26_340) expect(printed).toContain('26.340');
      else expect(printed).not.toMatch(/26[.,]?340/);
    }
  });

  it('PROP-FINAL-004 a service fee of 0 is printed as 0, not replaced by CAM', () => {
    const doc = buildProposalDocument(proposalDocumentSource({ serviceFeeSqm: 0, camPerSqm: 90_000 }), NOW);
    expect(doc.facts.serviceFeeSqm).toBe(0);
    expect(item(doc, 'SERVICE_FEE').factText).toBe('0 VND/m²/tháng');
    expect(JSON.stringify(item(doc, 'SERVICE_FEE'))).not.toContain('90.000');
  });

  it('PROP-FINAL-005 an absent service fee is shown as absent, with no implicit fallback', () => {
    const doc = buildProposalDocument(proposalDocumentSource({ serviceFeeSqm: null, camPerSqm: 90_000 }), NOW);
    expect(doc.facts.serviceFeeSqm).toBeNull();
    expect(item(doc, 'SERVICE_FEE').factText).toBe('Chưa xác định');
    expect(doc.warningCodes).toContain('SERVICE_FEE_MISSING');
  });

  it('PROP-FINAL-001 the payment term comes from Proposal.paymentTermDays', () => {
    expect(item(buildProposalDocument(proposalDocumentSource({ paymentTermDays: 30 }), NOW), 'PAYMENT').factText)
      .toBe('Thời hạn thanh toán: 30 ngày.');
    expect(item(buildProposalDocument(proposalDocumentSource({ paymentTermDays: 7 }), NOW), 'PAYMENT').factText)
      .toBe('Thời hạn thanh toán: 7 ngày.');
  });

  it('PROP-FINAL-002 no hard-coded "05 ngày" payment rule is generated', () => {
    const doc = buildProposalDocument(proposalDocumentSource({ paymentTermDays: 30 }), NOW);
    const payment = item(doc, 'PAYMENT');
    expect(`${payment.factText} ${payment.narrativeText}`).not.toMatch(/05\s*\(năm\)|05 ngày/);
  });

  it('PROP-FINAL-003 internal Proposal.notes never become the special conditions', () => {
    const src = { ...proposalDocumentSource({ specialConditions: null }), notes: 'NỘI BỘ: khách nợ cũ, cân nhắc' } as any;
    const doc = buildProposalDocument(src, NOW);
    expect(item(doc, 'SPECIAL_CONDITIONS').factText).toBeNull();
    expect(JSON.stringify(doc)).not.toContain('NỘI BỘ');

    const withTerms = buildProposalDocument({ ...src, specialConditions: 'Miễn phí 2 chỗ đậu xe' }, NOW);
    expect(item(withTerms, 'SPECIAL_CONDITIONS').factText).toBe('Miễn phí 2 chỗ đậu xe');
  });

  it('does not invent an FX rule for MMK and flags FX_RULE_NOT_CONFIGURED', () => {
    const doc = buildProposalDocument(proposalDocumentSource({ rentCurrency: 'MMK', exchangeRate: 25_450 }), NOW);
    expect(item(doc, 'EXCHANGE_RATE').factText).toContain('Chưa cấu hình quy tắc quy đổi tỷ giá cho MMK.');
    expect(item(doc, 'EXCHANGE_RATE').factText).not.toMatch(/1 MMK/);
    expect(doc.warningCodes).toContain('FX_RULE_NOT_CONFIGURED');
  });

  it('keeps an explicit 0% escalation as a statement, not as missing', () => {
    const doc = buildProposalDocument(proposalDocumentSource({ escalationPercent: 0 }), NOW);
    expect(item(doc, 'RENT').factText).toContain('Không áp dụng điều chỉnh tăng giá thuê theo năm.');
  });

  it('falls back to the mall rule, never Sala hours, when no operating hours are recorded', () => {
    const doc = buildProposalDocument(proposalDocumentSource({ operatingHours: null }), NOW);
    expect(item(doc, 'OPERATING_HOURS').factText).toBe('Theo quy định vận hành của TTTM THISO Mall Hà Nội.');
  });

  it('renders the recorded operating hours, after-hours and utility fees the old PDF ignored', () => {
    const doc = buildProposalDocument(proposalDocumentSource({
      operatingHours: '09:00 – 22:00 hằng ngày', afterHoursFee: 250_000, utilityFee: 1_500_000,
    }), NOW);
    expect(item(doc, 'OPERATING_HOURS').factText).toBe('09:00 – 22:00 hằng ngày');
    expect(item(doc, 'AFTER_HOURS').factText).toBe('Phí ngoài giờ: 250.000 VND/giờ.');
    expect(item(doc, 'UTILITIES').factText).toBe('Phí tiện ích: 1.500.000 VND/tháng');
  });

  it('does not round an 18-month term into "2 năm"', () => {
    expect(item(buildProposalDocument(proposalDocumentSource({ term: 18 }), NOW), 'TERM').factText).toBe('18 tháng kể từ Ngày Bàn giao.');
    expect(item(buildProposalDocument(proposalDocumentSource({ term: 60 }), NOW), 'TERM').factText).toBe('5 năm (60 tháng) kể từ Ngày Bàn giao.');
  });

  it('dates in Vietnam time, so a local-midnight handover is not shown a day early on a UTC server', () => {
    const doc = buildProposalDocument(proposalDocumentSource(), NOW);
    expect(item(doc, 'HANDOVER').factText).toBe('Dự kiến ngày 01/10/2026');
  });
});

describe('Proposal document — approval evidence', () => {
  const workflow = (steps: any[], status = 'IN_PROGRESS') => ({
    status, createdAt: new Date('2026-09-10T02:00:00.000Z'), steps,
  });
  const step = (o: any) => ({
    id: `s${o.stepOrder}`, stepName: `Bước ${o.stepOrder}`, approverRole: 'LEASING_MANAGER',
    approverId: 'u-approver', approver: { id: 'u-approver', fullName: 'Trần Thị B' },
    decidedAt: null, comment: null, ...o,
  });

  it('PROP-DOC-009 builds the history from ApprovalStep rows in step order', () => {
    const doc = buildProposalDocument(proposalDocumentSource({
      status: 'UNDER_REVIEW',
      approvalWorkflow: workflow([
        step({ stepOrder: 2, status: 'PENDING', approverId: 'u-dir', approver: { id: 'u-dir', fullName: 'Lê Văn C' } }),
        step({ stepOrder: 1, status: 'APPROVED', decidedAt: new Date('2026-09-11T04:30:00.000Z'), comment: 'Đồng ý' }),
      ]),
    }), NOW);

    expect(doc.approval.steps.map((s) => [s.stepOrder, s.approverName, s.status])).toEqual([
      [1, 'Trần Thị B', 'APPROVED'],
      [2, 'Lê Văn C', 'PENDING'],
    ]);
  });

  it('PROP-DOC-010 never presents a pending approver as a signer', () => {
    const doc = buildProposalDocument(proposalDocumentSource({
      approvalWorkflow: workflow([step({ stepOrder: 1, status: 'PENDING', decidedAt: new Date() })]),
    }), NOW);

    expect(doc.approval.steps[0].presentation).toBe('EXPECTED_APPROVER');
    // A stray decidedAt on an undecided step must not read as a signature time.
    expect(doc.approval.steps[0].decidedAt).toBeNull();
  });

  it('PROP-DOC-011 records who approved and when', () => {
    const doc = buildProposalDocument(proposalDocumentSource({
      approvalWorkflow: workflow([step({ stepOrder: 1, status: 'APPROVED', decidedAt: new Date('2026-09-11T04:30:00.000Z'), comment: 'OK' })]),
    }), NOW);

    expect(doc.approval.steps[0]).toMatchObject({
      presentation: 'APPROVED_BY', approverName: 'Trần Thị B', decidedAt: '2026-09-11T04:30:00.000Z', comment: 'OK',
    });
  });

  it('PROP-DOC-012 represents a rejection as a rejection', () => {
    const doc = buildProposalDocument(proposalDocumentSource({
      status: 'REJECTED',
      approvalWorkflow: workflow([step({ stepOrder: 1, status: 'REJECTED', decidedAt: new Date('2026-09-11T04:30:00.000Z'), comment: 'Giá thấp' })], 'REJECTED'),
    }), NOW);

    expect(doc.approval.state).toBe('REJECTED');
    expect(doc.approval.steps[0]).toMatchObject({ presentation: 'REJECTED_BY', comment: 'Giá thấp' });
  });

  it('shows no invented routing before submission', () => {
    const doc = buildProposalDocument(proposalDocumentSource(), NOW);
    expect(doc.approval).toEqual({ state: 'NOT_SUBMITTED', steps: [] });
  });
});

describe('Proposal document — editor sync', () => {
  const saved = (src: ReturnType<typeof proposalDocumentSource>, content: any) => ({
    schemaVersion: PROPOSAL_DOCUMENT_SCHEMA_VERSION,
    content: { ...normalizeStoredContent(null).content, ...content },
    sourceFingerprint: computeSourceFingerprint(buildFacts(src)),
    contentVersion: 3,
    savedAt: '2026-09-12T01:00:00.000Z',
    savedById: 'user-author',
  });

  it('PROP-SYNC-013 builds a first-load document entirely from the current Proposal', () => {
    const doc = buildProposalDocument(proposalDocumentSource(), NOW);

    expect(doc.sync).toMatchObject({ contentVersion: 0, documentStale: false, staleReason: null, savedFingerprint: null });
    expect(item(doc, 'RENT').factText).toContain('750.000 VND/m²/tháng');
    expect(doc.items.every((i) => !i.narrativeOverridden)).toBe(true);
  });

  it('PROP-SYNC-015 changing the Proposal rent changes the rendered rent even with saved content', () => {
    const original = proposalDocumentSource();
    const content = saved(original, { items: { PAYMENT: { narrativeText: 'Thanh toán trước ngày 10 mỗi tháng.' } } });

    const changed = buildProposalDocument({ ...original, rentPerSqm: 820_000, editorContent: content }, NOW);

    expect(item(changed, 'RENT').factText).toContain('820.000 VND/m²/tháng');
    expect(item(changed, 'RENT').factText).not.toContain('750.000');
  });

  it('PROP-SYNC-016 saved narrative survives a refresh of the facts', () => {
    const original = proposalDocumentSource();
    const content = saved(original, {
      bodyIntro: 'Đoạn mở đầu do người lập viết.',
      items: { PAYMENT: { narrativeText: 'Thanh toán trước ngày 10 mỗi tháng.', note: 'Đã thống nhất với khách' } },
    });

    const doc = buildProposalDocument({ ...original, rentPerSqm: 820_000, editorContent: content }, NOW);

    expect(doc.bodyIntro).toBe('Đoạn mở đầu do người lập viết.');
    expect(item(doc, 'PAYMENT')).toMatchObject({
      narrativeText: 'Thanh toán trước ngày 10 mỗi tháng.', narrativeOverridden: true, note: 'Đã thống nhất với khách',
    });
  });

  it('PROP-SYNC-017 a source change after the last save marks the document stale', () => {
    const original = proposalDocumentSource();
    const content = saved(original, {});

    const doc = buildProposalDocument({ ...original, area: 150, editorContent: content }, NOW);

    expect(doc.sync.documentStale).toBe(true);
    expect(doc.sync.staleReason).toBe('SOURCE_CHANGED');
    expect(doc.sync.savedFingerprint).not.toBe(doc.sync.sourceFingerprint);
  });

  it('PROP-SYNC-018 the fingerprint is stable while facts are unchanged — clock, status and approvals excluded', () => {
    const src = proposalDocumentSource();
    const a = buildProposalDocument(src, NOW);
    const b = buildProposalDocument({
      ...src,
      status: 'SUBMITTED',
      approvalWorkflow: { status: 'IN_PROGRESS', createdAt: new Date(), steps: [] },
    }, new Date('2027-01-01T00:00:00.000Z'));

    expect(b.sync.sourceFingerprint).toBe(a.sync.sourceFingerprint);
    expect(buildProposalDocument({ ...src, editorContent: saved(src, {}) }, NOW).sync.documentStale).toBe(false);
  });

  it('a fact-only row ignores a stored narrative override', () => {
    const src = proposalDocumentSource();
    const doc = buildProposalDocument({
      ...src, editorContent: saved(src, { items: { RENT: { narrativeText: 'Giá thuê: 1 VND' } } }),
    }, NOW);
    expect(item(doc, 'RENT').narrativeText).toBeNull();
    expect(JSON.stringify(item(doc, 'RENT'))).not.toContain('1 VND');
  });

  it('applies saved row order and appends rows the saved order does not know', () => {
    const src = proposalDocumentSource();
    const doc = buildProposalDocument({ ...src, editorContent: saved(src, { itemOrder: ['PAYMENT', 'LEGAL_NAME'] }) }, NOW);
    expect(doc.items.slice(0, 3).map((i) => i.key)).toEqual(['PAYMENT', 'LEGAL_NAME', 'BRAND_NAME']);
    expect(doc.items.map((i) => i.stt)).toEqual(doc.items.map((_, i) => i + 1));
  });
});

describe('Proposal document — pre-v2 editor content', () => {
  const legacy = {
    logoBase64: 'data:image/png;base64,iVBORw0KGgo=',
    layoutImageBase64: 'data:image/webp;base64,UklGRg==',
    font: '"Times New Roman", Times, serif',
    primaryColor: '#1b5e20',
    docNumber: '42/2026/TTr-CTTTTM',
    dateDay: '05', dateMonth: '09', dateYear: '2026',
    brandTitle: 'Thương hiệu CellphoneS',
    preamble: ['Căn cứ A;', 'Căn cứ B.'],
    bodyIntro: 'Kính trình (bản cũ).',
    items: [
      { label: 'Giá thuê\n(Chưa bao gồm Thuế GTGT)', content: 'Giá thuê: 700.000 VND/m²/tháng', note: '' },
      { label: 'Thanh toán Tiền thuê', content: 'Thanh toán trước ngày 5.', note: 'ghi chú cũ' },
      { label: 'Tên Pháp nhân', content: 'Tên cũ', note: '' },
    ],
    signatories: [{ title: 'TRƯỞNG PHÒNG CHO THUÊ TTTM', name: 'PHẠM THỊ KHÁNH TRANG' }],
    closingLine: 'Kết (bản cũ).',
  };

  it('imports only editorial content, flags the rest, and is never treated as fresh', () => {
    const doc = buildProposalDocument(proposalDocumentSource({ editorContent: legacy }), NOW);

    expect(doc.sync).toMatchObject({ documentStale: true, staleReason: 'LEGACY_UNVERIFIED', contentVersion: 0 });
    // PAYMENT wording carried the old fixed 05-day rule, so it is not imported either.
    expect(doc.sync.legacyContentNotImported).toEqual(['RENT', 'PAYMENT', 'LEGAL_NAME']);
    expect(doc.sync.legacySignatoriesIgnored).toBe(true);
    // Hand-typed facts do not come back…
    expect(item(doc, 'RENT').factText).toContain('750.000');
    expect(item(doc, 'LEGAL_NAME').factText).toBe('CellphoneS JSC');
    // …editorial wording does.
    expect(item(doc, 'PAYMENT')).toMatchObject({ narrativeOverridden: false, note: 'ghi chú cũ' });
    expect(doc.header.docNumber).toBe('42/2026/TTr-CTTTTM');
    expect(doc.header.documentDate).toBe('2026-09-05');
    expect(doc.preamble).toEqual(['Căn cứ A;', 'Căn cứ B.']);
    expect(doc.items.slice(0, 3).map((i) => i.key)).toEqual(['RENT', 'PAYMENT', 'LEGAL_NAME']);
  });

  it('drops an image pdfmake cannot embed instead of breaking the PDF', () => {
    const doc = buildProposalDocument(proposalDocumentSource({ editorContent: legacy }), NOW);
    expect(doc.presentation.logoDataUrl).toBe(legacy.logoBase64);
    expect(doc.presentation.layoutImageDataUrl).toBeNull();
    expect(doc.warnings.some((w) => w.includes('layout'))).toBe(true);
  });

  it('does not render the legacy signatory names anywhere in the document', () => {
    const doc = buildProposalDocument(proposalDocumentSource({ editorContent: legacy }), NOW);
    const { editableContent, ...rendered } = doc;
    expect(JSON.stringify(rendered)).not.toContain('PHẠM THỊ KHÁNH TRANG');
    expect(JSON.stringify(editableContent)).not.toContain('PHẠM THỊ KHÁNH TRANG');
  });
});
