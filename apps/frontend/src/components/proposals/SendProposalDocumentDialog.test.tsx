/**
 * CR-PROPOSAL-DOCUMENT-FINALIZATION — the external send is reviewed before it happens.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ getSendContext: vi.fn(), listSends: vi.fn(), sendDocument: vi.fn() }));
vi.mock('@/api', () => ({ proposalsApi: api }));
const mockToast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { SendProposalDocumentDialog } from './SendProposalDocumentDialog';

const CONTEXT = {
  canSend: true,
  approvedVersions: [
    { id: 'dv-2', versionNumber: 2, status: 'APPROVED', submittedAt: '2026-09-12T02:00:00.000Z', submittedById: 'u', submittedByName: 'A', sourceFingerprint: 'f', approvalWorkflow: null, attachmentFilename: 'to-trinh-PRO-1-v2.pdf' },
  ],
  suggestedRecipients: [{ email: 'contact@tenant.vn', name: 'Anh Quân', source: 'TENANT_CONTACT' }],
  defaultSubject: 'Tờ trình PRO-1 - phiên bản 2',
};

function open(context: any = CONTEXT) {
  api.getSendContext.mockResolvedValue(context);
  api.listSends.mockResolvedValue([]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <SendProposalDocumentDialog proposalId="prop-1" proposalNumber="PRO-1" open onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

beforeEach(() => vi.clearAllMocks());

describe('SendProposalDocumentDialog', () => {
  it('PROP-SEND-006 shows the version, attachment and suggestions, and sends nothing on open', async () => {
    open();
    expect(await screen.findByTestId('send-attachment')).toHaveTextContent('to-trinh-PRO-1-v2.pdf');
    expect(screen.getByRole('combobox', { name: 'Phiên bản tờ trình' })).toHaveValue('dv-2');
    expect(screen.getByRole('textbox', { name: 'Tiêu đề' })).toHaveValue('Tờ trình PRO-1 - phiên bản 2');
    // Suggested contacts are offered, not silently filled in.
    expect(screen.getByRole('textbox', { name: 'Người nhận' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled();
    expect(api.sendDocument).not.toHaveBeenCalled();
  });

  it('sends the chosen version to reviewed recipients with one idempotency key per opening', async () => {
    open();
    api.sendDocument.mockImplementation(() => new Promise((r) => setTimeout(() => r({ id: 's-1', duplicate: false }), 50)));

    await userEvent.click(await screen.findByRole('button', { name: /contact@tenant.vn/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'CC' }), 'legal@tenant.vn');
    await userEvent.type(screen.getByRole('textbox', { name: 'Lời nhắn' }), 'Kính gửi Quý khách');
    const send = screen.getByRole('button', { name: 'Gửi' });
    await userEvent.click(send);
    await userEvent.click(send).catch(() => undefined);

    await waitFor(() => expect(api.sendDocument).toHaveBeenCalled());
    const keys = new Set(api.sendDocument.mock.calls.map((c: any[]) => c[2]));
    expect(keys.size).toBe(1);
    expect(api.sendDocument.mock.calls[0][1]).toEqual({
      documentVersionId: 'dv-2', to: ['contact@tenant.vn'], cc: ['legal@tenant.vn'],
      subject: 'Tờ trình PRO-1 - phiên bản 2', message: 'Kính gửi Quý khách',
    });
  });

  it('blocks malformed recipients before any request', async () => {
    open();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Người nhận' }), 'not-an-email');
    expect(screen.getByText(/Email không hợp lệ/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled();
  });

  it('tells a user without permission instead of offering a form', async () => {
    open({ ...CONTEXT, canSend: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không có quyền gửi tờ trình ra bên ngoài.');
    expect(screen.queryByRole('button', { name: 'Gửi' })).toBeNull();
  });

  it('does not offer a send when no version is approved', async () => {
    open({ ...CONTEXT, approvedVersions: [] });
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa có phiên bản tờ trình nào được phê duyệt');
  });
});
