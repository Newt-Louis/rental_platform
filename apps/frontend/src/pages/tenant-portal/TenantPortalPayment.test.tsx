import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * PAY-001 — the Tenant Portal payment dialog must send one idempotency key per
 * payment intent.
 *
 * Before the fix it sent none at all, so a double-click produced two Payment
 * rows for a single intent whenever both amounts still fit the remaining
 * balance (BILL-001 only blocks the overpayment case).
 */

const recordPayment = vi.fn().mockResolvedValue({ id: 'pay-1' });

vi.mock('@/api', () => ({
  contractsApi: { listMyContracts: vi.fn().mockResolvedValue([]) },
  billingApi: { recordPayment: (...args: unknown[]) => recordPayment(...args) },
  ticketsApi: { listMyUnits: vi.fn().mockResolvedValue([]) },
  fitoutApi: {},
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { usePaymentIntentKey } from '@/hooks/usePaymentIntentKey';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '@/api';

/**
 * Mirrors the wiring of TenantPortalPage's RecordPaymentDialog: rendered
 * unconditionally by the parent, keyed by intent via `usePaymentIntentKey`.
 * Exercising the real page would drag in its whole data layer; what matters
 * here is the intent-key lifecycle and the submit path.
 */
function PaymentDialogHarness({ invoice }: { invoice: { id: string } | null }) {
  const qc = useQueryClient();
  const idempotencyKey = usePaymentIntentKey(invoice?.id, !!invoice);
  const mutation = useMutation({
    mutationFn: (data: any) => billingApi.recordPayment(invoice!.id, data, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-invoices'] }),
  });

  if (!invoice) return null;
  return (
    <button
      type="button"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ amount: 100 })}
    >
      Xác nhận thanh toán
    </button>
  );
}

function Harness() {
  const [invoice, setInvoice] = useState<{ id: string } | null>(null);
  return (
    <>
      <button type="button" onClick={() => setInvoice({ id: 'inv-1' })}>open-1</button>
      <button type="button" onClick={() => setInvoice({ id: 'inv-2' })}>open-2</button>
      <button type="button" onClick={() => setInvoice(null)}>close</button>
      <PaymentDialogHarness invoice={invoice} />
    </>
  );
}

function renderHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{<Harness />}</QueryClientProvider>);
}

const keysSent = () => recordPayment.mock.calls.map((c) => c[2]);

beforeEach(() => recordPayment.mockClear());

describe('PAY-001 — Tenant Portal payment idempotency', () => {
  it('T6: the request carries an idempotencyKey', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText('open-1'));
    await user.click(screen.getByRole('button', { name: /Xác nhận thanh toán/ }));

    await waitFor(() => expect(recordPayment).toHaveBeenCalled());
    const [invoiceId, payload, key] = recordPayment.mock.calls[0];
    expect(invoiceId).toBe('inv-1');
    expect(payload).toEqual({ amount: 100 });
    expect(key).toBeTruthy();
  });

  it('T2/T7: a double-click sends the SAME key — one intent, one payment', async () => {
    const user = userEvent.setup();
    // Hold the request in flight so the second click lands during the first.
    let release!: () => void;
    recordPayment.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ id: 'pay-1' }); }),
    );

    renderHarness();
    await user.click(screen.getByText('open-1'));

    const submit = screen.getByRole('button', { name: /Xác nhận thanh toán/ });
    await user.click(submit);
    await user.click(submit); // double-click
    release();

    await waitFor(() => expect(recordPayment.mock.calls.length).toBeGreaterThanOrEqual(1));

    // Whatever number of requests the UI guard let through, they all belong to
    // the SAME intent, so the backend collapses them into one Payment.
    const keys = new Set(keysSent());
    expect(keys.size).toBe(1);
  });

  it('T3: an explicit retry of the same intent reuses the key', async () => {
    const user = userEvent.setup();
    recordPayment.mockRejectedValueOnce(new Error('network'));

    renderHarness();
    await user.click(screen.getByText('open-1'));

    const submit = screen.getByRole('button', { name: /Xác nhận thanh toán/ });
    await user.click(submit);
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(1));

    await user.click(submit); // user retries after the failure
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(2));

    expect(new Set(keysSent()).size).toBe(1);
  });

  it('T4: closing and reopening for the same invoice is a NEW intent', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText('open-1'));
    await user.click(screen.getByRole('button', { name: /Xác nhận thanh toán/ }));
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText('close'));
    await user.click(screen.getByText('open-1'));
    await user.click(screen.getByRole('button', { name: /Xác nhận thanh toán/ }));
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(2));

    // A second genuine payment must not reuse the first key — the backend
    // would otherwise return the first payment or reject as a payload conflict.
    const keys = keysSent();
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('T5: switching to another invoice is a NEW intent', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText('open-1'));
    await user.click(screen.getByRole('button', { name: /Xác nhận thanh toán/ }));
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText('open-2'));
    await user.click(screen.getByRole('button', { name: /Xác nhận thanh toán/ }));
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(2));

    const keys = keysSent();
    expect(keys[0]).not.toBe(keys[1]);
    expect(recordPayment.mock.calls[1][0]).toBe('inv-2');
  });

  it('regression: paying two invoices in one page session does not reuse a key', async () => {
    // This is the failure mode the naive `useState(() => randomUUID())` had:
    // the dialog never unmounts, so both invoices shared one key and the second
    // payment was rejected by the backend.
    const user = userEvent.setup();
    renderHarness();

    const sequence = ['open-1', 'open-2', 'open-1'];
    for (const [index, target] of sequence.entries()) {
      await user.click(screen.getByText(target));
      await user.click(screen.getByRole('button', { name: /Xác nhận thanh toán/ }));
      await waitFor(() => expect(recordPayment.mock.calls.length).toBe(index + 1));
    }

    expect(new Set(keysSent()).size).toBe(3);
  });
});
