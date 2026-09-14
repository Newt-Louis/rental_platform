/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 / CR-PROPOSAL-MAPPING-002 — the Tờ trình editor
 * renders the server's canonical document and exports the server's PDF.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProposalDocumentModel } from './proposalDocument.types';

const api = vi.hoisted(() => ({
  getDocument: vi.fn(),
  saveDocumentContent: vi.fn(),
  exportPdf: vi.fn(),
  updateDocFields: vi.fn(),
  exportVersionPdf: vi.fn(),
  startRevision: vi.fn(),
}));
vi.mock('@/api', () => ({ proposalsApi: api }));

const mockToast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { ProposalEditorDialog, STALE_DOCUMENT_MESSAGE, LIVE_DIFFERS_MESSAGE } from './ProposalEditor';

const FP = 'f'.repeat(64);

function model(overrides: Partial<ProposalDocumentModel> = {}): ProposalDocumentModel {
  return {
    schemaVersion: 2,
    proposalId: 'prop-1',
    proposalNumber: 'PRO-2026-00042',
    status: 'DRAFT',
    facts: {
      mall: { id: 'mall-hn', code: 'THISO-HN', name: 'THISO Mall Hà Nội', city: 'Hà Nội' },
      party: { source: 'LEAD', companyName: 'CellphoneS JSC', brandName: 'CellphoneS' },
      category: { id: 'cat-tech', code: 'TECH', name: 'Công nghệ', source: 'LEAD_MASTER', legacy: false },
      currency: 'VND',
      preparedBy: { userId: 'u-author', fullName: 'Nguyễn Thị Lập', role: 'LEASING_EXECUTIVE', department: null },
    },
    header: {
      organisationLines: ['KHỐI KINH DOANH BĐS TM & DV', 'PHÒNG CHO THUÊ TTTM'],
      docNumber: '00042/2026/TTr-CTTTTM',
      city: 'Hà Nội',
      documentDate: '2026-09-14',
      title: 'TỜ TRÌNH',
      subject: 'V/v: Phê duyệt … THISO Mall Hà Nội',
      addressee: 'KÍNH GỬI: BAN TỔNG GIÁM ĐỐC',
    },
    preamble: ['Căn cứ A;'],
    bodyIntro: 'Phòng cho thuê TTTM kính trình…',
    items: [
      { key: 'CATEGORY', stt: 1, label: 'Ngành hàng Kinh doanh', factText: 'Công nghệ', narrativeText: null, narrativeEditable: false, narrativeOverridden: false, defaultNarrativeText: null, note: '' },
      { key: 'RENT', stt: 2, label: 'Giá thuê\n(Chưa bao gồm Thuế GTGT)', factText: 'Giá thuê: 750.000 VND/m²/tháng', narrativeText: null, narrativeEditable: false, narrativeOverridden: false, defaultNarrativeText: null, note: '' },
      { key: 'PAYMENT', stt: 3, label: 'Thanh toán Tiền thuê', factText: null, narrativeText: '• Mẫu thanh toán.', narrativeEditable: true, narrativeOverridden: false, defaultNarrativeText: '• Mẫu thanh toán.', note: '' },
    ],
    closingLine: 'Kính trình.',
    presentation: { logoDataUrl: null, layoutImageDataUrl: null, primaryColor: '#1a237e' },
    approval: {
      state: 'IN_PROGRESS',
      steps: [
        { stepOrder: 1, stepName: 'Leasing Manager Approval', approverRole: 'LEASING_MANAGER', approverId: 'u1', approverName: 'Trần Thị B', status: 'APPROVED', presentation: 'APPROVED_BY', decidedAt: '2026-09-11T04:30:00.000Z', comment: 'Đồng ý', identitySource: 'DECISION_SNAPSHOT' },
        { stepOrder: 2, stepName: 'Mall Director Approval', approverRole: 'MALL_DIRECTOR', approverId: 'u2', approverName: 'Lê Văn C', status: 'PENDING', presentation: 'EXPECTED_APPROVER', decidedAt: null, comment: null, identitySource: 'ASSIGNED_APPROVER' },
      ],
    },
    sync: {
      sourceFingerprint: FP, savedFingerprint: FP, contentVersion: 4, savedAt: '2026-09-12T01:00:00.000Z',
      savedById: 'u-author', documentStale: false, staleReason: null, legacyContentNotImported: [], legacySignatoriesIgnored: false,
      reviewState: 'REVIEWED', reviewedFingerprint: FP, reviewedAt: '2026-09-12T01:00:00.000Z', reviewedById: 'u-author', reviewedByName: 'Nguyễn Thị Lập',
    },
    version: null,
    approvalAsOf: null,
    warnings: [],
    warningCodes: [],
    ...overrides,
  };
}

function open(m = model()) {
  api.getDocument.mockResolvedValue(m);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <ProposalEditorDialog proposal={{ id: 'prop-1', proposalNumber: 'PRO-2026-00042', rentCurrency: 'VND' }} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

const exportButton = () => screen.getAllByRole('button', { name: /Xuất PDF chính thức|Lưu & xuất PDF/ })[0];

describe('ProposalEditorDialog', () => {
  const createObjectURL = vi.fn(() => 'blob:official');
  const revokeObjectURL = vi.fn();
  let anchorClick: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    api.exportPdf.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
  });
  afterEach(() => anchorClick.mockRestore());

  it('renders the server facts read-only instead of mapping the Proposal itself', async () => {
    open();

    const rent = await screen.findByTestId('doc-fact-RENT');
    expect(rent).toHaveTextContent('Giá thuê: 750.000 VND/m²/tháng');
    expect(within(screen.getByTestId('doc-row-RENT')).queryByRole('textbox', { name: /Nội dung/ })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Nội dung Thanh toán Tiền thuê' })).toHaveValue('• Mẫu thanh toán.');
    expect(screen.getByRole('textbox', { name: 'Trích yếu' })).toHaveValue('V/v: Phê duyệt … THISO Mall Hà Nội');
    expect(document.body.textContent).not.toContain('PHẠM THỊ KHÁNH TRANG');
  });

  it('shows approval evidence from the workflow and never presents a pending step as approved', async () => {
    open();
    const block = await screen.findByTestId('document-approval-block');

    expect(within(block).getByText('Nguyễn Thị Lập')).toBeInTheDocument();
    expect(within(block).getByText('Trần Thị B')).toBeInTheDocument();
    expect(within(block).getByText('Đã duyệt')).toBeInTheDocument();
    const director = within(block).getByText('Lê Văn C').parentElement!;
    expect(director).toHaveTextContent('Người duyệt dự kiến — chưa duyệt');
    expect(director).not.toHaveTextContent('Đã duyệt');
    // The manual signatory editor is gone.
    expect(screen.queryByText(/Thêm người ký/)).toBeNull();
  });

  it('warns when the Proposal changed after the last saved review', async () => {
    open(model({ sync: { ...model().sync, documentStale: true, staleReason: 'SOURCE_CHANGED', savedFingerprint: 'e'.repeat(64) } }));
    expect(await screen.findByRole('alert')).toHaveTextContent(STALE_DOCUMENT_MESSAGE);
  });

  it('saves editorial content with the concurrency token and reviewed fingerprint, never fact wording', async () => {
    open();
    const saved = model({ sync: { ...model().sync, contentVersion: 5 } });
    api.saveDocumentContent.mockResolvedValue(saved);

    const payment = await screen.findByRole('textbox', { name: 'Nội dung Thanh toán Tiền thuê' });
    await userEvent.clear(payment);
    await userEvent.type(payment, 'Thanh toán trước ngày 10.');
    await userEvent.click(screen.getAllByRole('button', { name: /^Lưu & xác nhận/ })[0]);

    await waitFor(() => expect(api.saveDocumentContent).toHaveBeenCalledTimes(1));
    const [id, body] = api.saveDocumentContent.mock.calls[0];
    expect(id).toBe('prop-1');
    expect(body.expectedContentVersion).toBe(4);
    expect(body.reviewedFingerprint).toBe(FP);
    expect(body.content.items.find((i: any) => i.key === 'PAYMENT')).toEqual({ key: 'PAYMENT', note: '', narrativeText: 'Thanh toán trước ngày 10.' });
    expect(body.content.items.find((i: any) => i.key === 'RENT')).not.toHaveProperty('narrativeText');
    expect(body.content).not.toHaveProperty('signatories');
    expect(body.content).not.toHaveProperty('font');
  });

  it('PROP-PDF-021 exports the official server PDF, not a browser print', async () => {
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    open();
    await screen.findByTestId('doc-fact-RENT');

    await userEvent.click(exportButton());

    await waitFor(() => expect(api.exportPdf).toHaveBeenCalledWith('prop-1'));
    expect(anchorClick).toHaveBeenCalled();
    expect(api.saveDocumentContent).not.toHaveBeenCalled();
    expect(windowOpen).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    windowOpen.mockRestore();
    print.mockRestore();
  });

  it('saves unsaved edits before exporting, because the official PDF renders saved content', async () => {
    open();
    const order: string[] = [];
    api.saveDocumentContent.mockImplementation(async () => { order.push('save'); return model({ sync: { ...model().sync, contentVersion: 5 } }); });
    api.exportPdf.mockImplementation(async () => { order.push('pdf'); return new Blob(['%PDF-']); });

    await userEvent.type(await screen.findByRole('textbox', { name: 'Đoạn kết' }), ' Trân trọng.');
    await userEvent.click(screen.getByRole('button', { name: /Lưu & xuất PDF/ }));

    await waitFor(() => expect(order).toEqual(['save', 'pdf']));
  });

  it('does not export when saving the pending edits fails', async () => {
    open();
    api.saveDocumentContent.mockRejectedValue({ response: { status: 400, data: { message: 'Only DRAFT proposals can be edited' } } });

    await userEvent.type(await screen.findByRole('textbox', { name: 'Đoạn kết' }), ' x');
    await userEvent.click(screen.getByRole('button', { name: /Lưu & xuất PDF/ }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Only DRAFT proposals can be edited' })));
    expect(api.exportPdf).not.toHaveBeenCalled();
  });

  it('on a concurrent-save conflict offers to reload the latest document', async () => {
    open();
    api.saveDocumentContent.mockRejectedValue({
      response: { status: 409, data: { message: 'Nội dung tờ trình đã được lưu bởi một phiên làm việc khác.', code: 'PROPOSAL_DOCUMENT_VERSION_CONFLICT' } },
    });

    await userEvent.type(await screen.findByRole('textbox', { name: 'Đoạn kết' }), ' x');
    await userEvent.click(screen.getAllByRole('button', { name: /^Lưu & xác nhận/ })[0]);

    const reload = await screen.findByRole('button', { name: /Tải lại tờ trình/ });
    api.getDocument.mockResolvedValue(model({ closingLine: 'Bản của người khác.', sync: { ...model().sync, contentVersion: 5 } }));
    await userEvent.click(reload);

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Đoạn kết' })).toHaveValue('Bản của người khác.'));
    expect(screen.queryByRole('button', { name: /Tải lại tờ trình/ })).toBeNull();
  });

  it('is read-only once the Proposal has left DRAFT', async () => {
    open(model({ status: 'SUBMITTED' }));
    await screen.findByTestId('doc-fact-RENT');

    expect(screen.queryByRole('button', { name: /^Lưu/ })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Đoạn kết' })).toHaveAttribute('readonly');
    expect(exportButton()).toBeEnabled();
  });

  it('rejects an image format the PDF renderer cannot embed', async () => {
    open();
    await screen.findByTestId('doc-fact-RENT');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/png,image/jpeg');

    await userEvent.upload(input, new File(['x'], 'logo.webp', { type: 'image/webp' }), { applyAccept: false });

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Chỉ hỗ trợ ảnh PNG hoặc JPEG' }));
  });

  it('shows a submitted version as frozen, with who submitted it and when, and exports that version', async () => {
    const VERSION = { id: 'dv-3', versionNumber: 3, status: 'SUBMITTED' as const, submittedAt: '2026-09-10T02:00:00.000Z', submittedById: 'u-author', submittedByName: 'Nguyễn Thị Lập', sourceFingerprint: FP, approvalWorkflowId: 'wf-1', liveFingerprint: 'e'.repeat(64), liveDiffers: true };
    api.exportVersionPdf.mockResolvedValue(new Blob(['%PDF-']));
    open(model({ status: 'UNDER_REVIEW', version: VERSION }));

    expect(await screen.findByTestId('document-status')).toHaveTextContent('Tờ trình đã trình · phiên bản 3');
    expect(screen.getByTestId('document-status')).toHaveTextContent('Nguyễn Thị Lập');
    expect(screen.getAllByRole('alert').some((a) => a.textContent?.includes(LIVE_DIFFERS_MESSAGE))).toBe(true);
    expect(screen.queryByRole('button', { name: /^Lưu/ })).toBeNull();

    await userEvent.click(exportButton());
    await waitFor(() => expect(api.exportVersionPdf).toHaveBeenCalledWith('prop-1', 'dv-3'));
    expect(api.exportPdf).not.toHaveBeenCalled();
  });

  it('shows draft status, source freshness and content version for a draft', async () => {
    open();
    const status = await screen.findByTestId('document-status');
    expect(status).toHaveTextContent('Bản nháp');
    expect(status).toHaveTextContent('khớp với lần xác nhận gần nhất');
    expect(screen.getByTestId('review-state')).toHaveTextContent('ĐÃ XÁC NHẬN');
    expect(status).toHaveTextContent('Xác nhận bởi: Nguyễn Thị Lập');
    expect(status).toHaveTextContent('Phiên bản nội dung: 4');
  });

  it('offers a new document revision for a rejected Proposal without touching the rejected version', async () => {
    const VERSION = { id: 'dv-1', versionNumber: 1, status: 'REJECTED' as const, submittedAt: '2026-09-10T02:00:00.000Z', submittedById: 'u', submittedByName: 'A', sourceFingerprint: FP, approvalWorkflowId: 'wf-1', liveFingerprint: FP, liveDiffers: false };
    open(model({ status: 'REJECTED', version: VERSION }));
    api.startRevision.mockResolvedValue({ proposalId: 'prop-1', previousDocumentVersionId: 'dv-1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Tạo bản tờ trình mới' }));
    await waitFor(() => expect(api.startRevision).toHaveBeenCalledWith('prop-1'));
  });

  it('lets the author record the payment term that the document now prints', async () => {
    open();
    await screen.findByTestId('doc-fact-RENT');
    expect(screen.getByLabelText('Thời hạn thanh toán (ngày)')).toBeInTheDocument();
  });

  it('PROP-REVIEW UX: an unreviewed draft says CHƯA XÁC NHẬN and offers "Lưu & xác nhận"', async () => {
    open(model({ sync: { ...model().sync, reviewState: 'NOT_REVIEWED', reviewedFingerprint: null, reviewedAt: null, reviewedById: null, reviewedByName: null, savedAt: null, contentVersion: 0 } }));
    expect(await screen.findByTestId('review-state')).toHaveTextContent('CHƯA XÁC NHẬN');
    expect(screen.getByTestId('document-status')).not.toHaveTextContent('Xác nhận bởi');
    expect(screen.getAllByRole('button', { name: /^Lưu & xác nhận/ }).length).toBeGreaterThan(0);
  });

  it('PROP-REVIEW UX: a review overtaken by data changes says CẦN KIỂM TRA LẠI', async () => {
    open(model({ sync: { ...model().sync, reviewState: 'STALE', documentStale: true, staleReason: 'SOURCE_CHANGED' } }));
    expect(await screen.findByTestId('review-state')).toHaveTextContent('CẦN KIỂM TRA LẠI');
    expect(screen.getByTestId('document-status')).toHaveTextContent('đã thay đổi — cần kiểm tra lại');
  });
});

