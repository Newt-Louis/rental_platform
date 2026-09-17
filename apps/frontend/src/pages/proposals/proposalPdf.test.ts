/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 — one official PDF path for every screen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import editorSource from './ProposalEditor.tsx?raw';
import proposalsPageSource from './ProposalsPage.tsx?raw';
import approvalsPageSource from '../approvals/ApprovalsPage.tsx?raw';

const api = vi.hoisted(() => ({ exportPdf: vi.fn(), exportVersionPdf: vi.fn() }));
const approvals = vi.hoisted(() => ({ exportWorkflowDocumentPdf: vi.fn() }));
vi.mock('@/api', () => ({ proposalsApi: api, approvalsApi: approvals }));

import { exportOfficialProposalPdf, proposalErrorMessage, proposalErrorCode, proposalRoutingIssues, SUBMIT_BLOCK_LABELS, ROUTING_REASON_LABELS } from './proposalPdf';

describe('exportOfficialProposalPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.exportPdf.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
    api.exportVersionPdf.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() });
  });

  it('downloads the server-rendered document under the proposal number', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('proposal-PRO-2026-00042.pdf');
      expect(this.href).toBe('blob:pdf');
    });

    await exportOfficialProposalPdf({ id: 'prop-1', proposalNumber: 'PRO-2026-00042' });

    expect(api.exportPdf).toHaveBeenCalledWith('prop-1');
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it('opens the same server-rendered document for viewing', async () => {
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);
    await exportOfficialProposalPdf({ id: 'prop-1', proposalNumber: 'PRO-2026-00042' }, 'open');
    expect(api.exportPdf).toHaveBeenCalledWith('prop-1');
    expect(windowOpen).toHaveBeenCalledWith('blob:pdf', '_blank', 'noopener,noreferrer');
    windowOpen.mockRestore();
  });

  it('PROP-FINAL-012 a submitted document is always fetched by its exact version', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('proposal-PRO-2026-00042-v3.pdf');
    });
    await exportOfficialProposalPdf({ id: 'prop-1', proposalNumber: 'PRO-2026-00042', documentVersionId: 'dv-3', versionNumber: 3 });
    expect(api.exportVersionPdf).toHaveBeenCalledWith('prop-1', 'dv-3');
    expect(api.exportPdf).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('the approval screen fetches the PDF through its workflow, which every approver of it can read', async () => {
    approvals.exportWorkflowDocumentPdf.mockResolvedValue(new Blob(['%PDF-']));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await exportOfficialProposalPdf({ id: 'prop-1', proposalNumber: 'PRO-1', documentVersionId: 'dv-3', versionNumber: 3, approvalWorkflowId: 'wf-9' });
    expect(approvals.exportWorkflowDocumentPdf).toHaveBeenCalledWith('wf-9');
    expect(api.exportPdf).not.toHaveBeenCalled();
    expect(api.exportVersionPdf).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('surfaces the server’s reason, falling back when there is none', () => {
    expect(proposalErrorMessage({ response: { data: { message: 'Tờ trình đã cũ' } } }, 'fallback')).toBe('Tờ trình đã cũ');
    expect(proposalErrorMessage(new Error('network'), 'fallback')).toBe('fallback');
  });
});

describe('Official PDF path is shared by every surface', () => {
  it('PROP-PDF-021 the editor exports through the shared helper', () => {
    expect(editorSource).toContain("from './proposalPdf'");
    expect(editorSource).toContain('exportOfficialProposalPdf(');
  });

  it('PROP-PDF-022 the proposal list exports through the shared helper', () => {
    expect(proposalsPageSource).toContain('exportOfficialProposalPdf(p)');
    expect(proposalsPageSource).not.toContain('proposalsApi.exportPdf');
  });

  it('PROP-PDF-023 / PROP-FINAL-012 the approval screen exports the workflow-bound version', () => {
    expect(approvalsPageSource).toContain('exportOfficialProposalPdf({');
    expect(approvalsPageSource).toContain('approvalWorkflowId: documentVersionId ? workflowId : null');
    expect(approvalsPageSource).toContain("const documentVersionId: string | null = w?.documentVersionId ?? null;");
    expect(approvalsPageSource).not.toContain('proposalsApi.exportPdf');
  });

  it('the approval screen reads business facts from the submitted version, not the live Proposal', () => {
    expect(approvalsPageSource).toContain('approvalsApi.getWorkflowDocument(workflowId!)');
    expect(approvalsPageSource).toMatch(/vf \? vf\.party\.brandName/);
    expect(approvalsPageSource).toContain('Dữ liệu Proposal hiện tại đã thay đổi sau thời điểm trình duyệt.');
  });

  it('PROP-SOD UX tells the preparer why they cannot approve instead of showing the buttons', () => {
    expect(approvalsPageSource).toContain('Bạn là người lập Proposal này nên không thể tự phê duyệt.');
    expect(approvalsPageSource).toMatch(/decisionStep && isPreparer \?/);
  });

  it('PROP-PDF-027 no proposal screen prints HTML as the official document', () => {
    for (const source of [editorSource, proposalsPageSource]) {
      expect(source).not.toMatch(/outerHTML|window\.print|document\.write|printAreaRef|handlePrint/);
    }
    // The editor keeps no client-side mapping of Proposal fields into document text.
    expect(editorSource).not.toMatch(/initEditorContent|p\.tenant\?\.preferredCategory|Thiso Mall|26\.340/);
  });
});

describe('Proposal governance — submit refusal is explained, not generic', () => {
  const routingError = { response: { data: {
    code: 'APPROVAL_ROUTING_SELF_CONFLICT', message: 'Quy trình phê duyệt hiện tại phân công người lập Proposal làm người duyệt.',
    errors: [{ stepOrder: 2, stepName: 'Leasing Manager Price Review', reason: 'SELF_APPROVAL' }],
  } } };

  it('reads the business code and the structured routing issues', () => {
    expect(proposalErrorCode(routingError)).toBe('APPROVAL_ROUTING_SELF_CONFLICT');
    expect(proposalRoutingIssues(routingError)).toEqual([{ stepOrder: 2, stepName: 'Leasing Manager Price Review', reason: 'SELF_APPROVAL' }]);
    expect(proposalErrorCode(new Error('network'))).toBeNull();
    expect(proposalRoutingIssues({ response: { data: { errors: ['plain validation text'] } } })).toEqual([]);
  });

  it('has a specific message for every governance code the server returns', () => {
    for (const code of ['PROPOSAL_DOCUMENT_NOT_REVIEWED', 'PROPOSAL_DOCUMENT_STALE', 'APPROVAL_ROUTING_SELF_CONFLICT', 'APPROVAL_STEP_UNASSIGNED', 'APPROVAL_ROUTING_INVALID']) {
      expect(SUBMIT_BLOCK_LABELS[code]).toBeTruthy();
    }
    for (const reason of ['STEP_UNASSIGNED', 'SELF_APPROVAL', 'APPROVER_NOT_FOUND', 'APPROVER_INACTIVE', 'APPROVER_ROLE_NOT_ELIGIBLE', 'APPROVER_ROLE_CHANGED', 'APPROVER_NO_MALL_ACCESS', 'NO_ACTIVE_POLICY']) {
      expect(ROUTING_REASON_LABELS[reason]).toBeTruthy();
    }
  });

  it('the proposal detail offers "Mở và kiểm tra tờ trình" for review failures and bulk submit reports reasons per code', () => {
    expect(proposalsPageSource).toContain('Mở và kiểm tra tờ trình');
    expect(proposalsPageSource).toMatch(/submitBlock\.code === 'PROPOSAL_DOCUMENT_NOT_REVIEWED' \|\| submitBlock\.code === 'PROPOSAL_DOCUMENT_STALE'/);
    expect(proposalsPageSource).toContain('proposalErrorCode(r.reason)');
    expect(proposalsPageSource).toContain("canPerformAction(currentRole, 'proposal-send-external')");
  });

  it('PROP-HIST UX: approval history names the decider from the decision snapshot', () => {
    expect(approvalsPageSource).toContain('step.decidedByDisplayName');
    expect(approvalsPageSource).toContain('Dữ liệu lịch sử chưa được snapshot');
  });
});

