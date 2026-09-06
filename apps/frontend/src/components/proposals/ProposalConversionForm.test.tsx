import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { buildProposalPrefill } from '@/pages/bookings/proposal-prefill';

/**
 * SEM-001 field-parity + NumericFormat/react-hook-form integration regression suite.
 *
 * Two defects are covered here:
 *  1. The Spaces and Bookings dialogs used to submit almost disjoint subsets of
 *     ConvertToProposalDto.
 *  2. `<Input type="number">` renders a controlled NumericFormat, and RHF's
 *     `register()` supplies no `value` — so registered numeric fields silently
 *     failed to repopulate on reset()/reopen. The old Spaces dialog had this bug.
 */

const convertToProposal = vi.fn().mockResolvedValue({ proposal: { id: 'p1' } });

vi.mock('@/api', () => ({
  bookingApi: { convertToProposal: (...args: unknown[]) => convertToProposal(...args) },
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
// NOTE: react-router-dom is deliberately NOT mocked. Replacing the whole module
// leaks the stub into other test files sharing the worker, breaking any suite
// that renders a component calling useLocation(). Wrap in a real MemoryRouter
// instead.

import { ProposalConversionForm } from './ProposalConversionForm';
import { ConvertBookingDialog } from '@/components/spaces/dialogs/ConvertBookingDialog';
import { ConvertToProposalDialog } from '@/pages/bookings/ConvertToProposalDialog';

const bookingA: any = {
  id: 'b1',
  bookingNumber: 'BK-001',
  unit: { code: 'L3-E01', areaNLA: 100, minLeaseTerm: 36, currencyCode: 'VND', escalationRate: 5 },
  lead: { brandName: 'Test Brand' },
  currencyCode: 'VND',
  proposedRentPerSqm: 1_000_000,
  requestedArea: 100,
  requestedTerm: 36,
};

const bookingB: any = {
  id: 'b2',
  bookingNumber: 'BK-002',
  unit: { code: 'L1-A02', areaNLA: 250, minLeaseTerm: 24, currencyCode: 'VND', escalationRate: 8 },
  lead: { brandName: 'Second Brand' },
  currencyCode: 'VND',
  proposedRentPerSqm: 2_500_000,
  proposedCamPerSqm: 150_000,
  requestedArea: 250,
  requestedTerm: 24,
};

function renderForm(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Displayed (thousand-separated) value of a NumericFormat-backed field. */
const shown = (label: RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value;

beforeEach(() => convertToProposal.mockClear());

// ═══════════════════════════════════════════════════════════════════════════
// Prefill shape — form state holds numeric primitives, not strings
// ═══════════════════════════════════════════════════════════════════════════

describe('proposal-prefill — numeric form state', () => {
  const prefill = buildProposalPrefill(bookingA);

  it('T2/T12: deposit defaults to 3 as a NUMBER', () => {
    expect(prefill.deposit).toBe(3);
  });

  it('T13: fitoutDays defaults to 90 as a NUMBER', () => {
    expect(prefill.fitoutDays).toBe(90);
  });

  it('T14: paymentTermDays defaults to 30 as a NUMBER', () => {
    expect(prefill.paymentTermDays).toBe(30);
  });

  it('T7: rentFree defaults to integer 0 months', () => {
    expect(prefill.rentFree).toBe(0);
    expect(Number.isInteger(prefill.rentFree)).toBe(true);
  });

  it('T5: zero-valued fees are 0, never null or empty string', () => {
    for (const key of ['utilityFee', 'afterHoursFee', 'depositFitout', 'fitoutFee', 'depositLease'] as const) {
      expect(prefill[key], key).toBe(0);
    }
  });

  it('distinguishes "not supplied" (null) from zero', () => {
    // bookingA has no CAM anywhere, so camPerSqm is genuinely absent.
    expect(prefill.camPerSqm).toBeNull();
    expect(prefill.serviceFeeSqm).toBeNull();
    // …whereas the fee defaults above are a real 0.
    expect(prefill.utilityFee).toBe(0);
  });

  it('carries booking values through as numbers', () => {
    expect(prefill.area).toBe(100);
    expect(prefill.term).toBe(36);
    expect(prefill.rentPerSqm).toBe(1_000_000);
  });

  it('exposes every field both legacy dialogs used to submit between them', () => {
    for (const key of [
      'area', 'term', 'startDate', 'businessModel',
      'rentCurrency', 'rentPerSqm', 'camPerSqm', 'serviceFeeSqm', 'businessSupportFeeSqm',
      'deposit', 'rentFree', 'escalationPercent', 'paymentTermDays',
      'depositLease', 'depositFitout', 'fitoutFee', 'utilityFee', 'afterHoursFee',
      'fitoutDays', 'handoverDate', 'openingDate',
      'operatingHours', 'specialConditions', 'notes',
    ]) {
      expect(prefill, `missing prefill field: ${key}`).toHaveProperty(key);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Rendering + initial values
// ═══════════════════════════════════════════════════════════════════════════

describe('ProposalConversionForm — initial render', () => {
  it('T2/T12-14: shows the business defaults so the user can see them', async () => {
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);

    await waitFor(() => expect(shown(/Đặt cọc/i)).toBe('3'));
    expect(shown(/TG Hoàn thiện nội thất/i)).toBe('90');
    expect(shown(/Thanh toán \(ngày\)/i)).toBe('30');
  });

  it('T5: a zero value renders as "0", not as an empty field', async () => {
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);
    await waitFor(() => expect(shown(/Phí tiện ích/i)).toBe('0'));
    expect(shown(/Phí ngoài giờ/i)).toBe('0');
    expect(shown(/Miễn tiền thuê \(tháng\)/i)).toBe('0');
  });

  it('formats large amounts with thousand separators for display only', async () => {
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);
    await waitFor(() => expect(shown(/Giá thuê\/m²/i)).toBe('1,000,000'));
  });

  it('T15: exposes handoverDate — the field the Bookings dialog used to omit', async () => {
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText(/Ngày Bàn giao dự kiến/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/Ngày Khai trương dự kiến/i)).toBeInTheDocument();
  });

  it('SEM-001: labels rent-free in MONTHS, never days', async () => {
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText(/Miễn tiền thuê \(tháng\)/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/Rent-free \(ngày\)/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Miễn tiền thuê \(ngày\)/i)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE reset bug — this is what regressed silently before the fix
// ═══════════════════════════════════════════════════════════════════════════

describe('NumericFormat + react-hook-form controlled binding', () => {
  it('T3: typing updates form state and the submitted payload', async () => {
    const user = userEvent.setup();
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);

    const deposit = await screen.findByLabelText(/Đặt cọc/i);
    await user.clear(deposit);
    await user.type(deposit, '6');
    expect((deposit as HTMLInputElement).value).toBe('6');

    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));
    await waitFor(() => expect(convertToProposal).toHaveBeenCalled());
    const calls = convertToProposal.mock.calls;
    expect(calls[calls.length - 1][1].deposit).toBe(6);
  });

  it('T1/T4/A-E: reset() with a new booking repopulates the VISIBLE numeric values', async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm(
      <ProposalConversionForm booking={bookingA} open onClose={() => {}} />,
    );

    // A. initial values
    await waitFor(() => expect(shown(/Diện tích/i)).toBe('100'));
    expect(shown(/Thời hạn/i)).toBe('36');
    expect(shown(/Giá thuê\/m²/i)).toBe('1,000,000');

    // B. user edits them
    const area = screen.getByLabelText(/Diện tích/i);
    await user.clear(area);
    await user.type(area, '555');
    expect(shown(/Diện tích/i)).toBe('555');

    // C. reset() via a new booking
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ProposalConversionForm booking={bookingB} open onClose={() => {}} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    // D. the visible NumericFormat values must update.
    //    THIS IS THE ASSERTION THAT FAILED BEFORE THE FIX — with register(),
    //    NumericFormat kept its own state and still showed 555 / 100 / 36.
    await waitFor(() => expect(shown(/Diện tích/i)).toBe('250'));
    expect(shown(/Thời hạn/i)).toBe('24');
    expect(shown(/Giá thuê\/m²/i)).toBe('2,500,000');
    expect(shown(/CAM\/m²/i)).toBe('150,000');

    // E. submitting after reset sends the NEW values, not the stale ones.
    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));
    await waitFor(() => expect(convertToProposal).toHaveBeenCalled());
    const calls = convertToProposal.mock.calls;
    const [bookingId, payload] = calls[calls.length - 1];
    expect(bookingId).toBe('b2');
    expect(payload.area).toBe(250);
    expect(payload.term).toBe(24);
    expect(payload.rentPerSqm).toBe(2_500_000);
  });

  it('F: closing and reopening with another booking shows that booking\'s values', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ProposalConversionForm booking={bookingA} open onClose={() => {}} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(shown(/Diện tích/i)).toBe('100'));

    // close
    rerender(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ProposalConversionForm booking={bookingA} open={false} onClose={() => {}} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByLabelText(/Diện tích/i)).not.toBeInTheDocument());

    // reopen with a different booking
    rerender(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ProposalConversionForm booking={bookingB} open onClose={() => {}} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(shown(/Diện tích/i)).toBe('250'));
    expect(shown(/Thời hạn/i)).toBe('24');
  });

  it('G/T5: a user-entered 0 survives submission and does not become empty', async () => {
    const user = userEvent.setup();
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);

    const escalation = await screen.findByLabelText(/Tăng giá\/năm/i);
    await user.clear(escalation);
    await user.type(escalation, '0');
    expect((escalation as HTMLInputElement).value).toBe('0');

    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));
    await waitFor(() => expect(convertToProposal).toHaveBeenCalled());
    const calls = convertToProposal.mock.calls;
    expect(calls[calls.length - 1][1].escalationPercent).toBe(0);
  });

  it('T6: a decimal amount survives formatting and submits as a number', async () => {
    const user = userEvent.setup();
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);

    const cam = await screen.findByLabelText(/CAM\/m²/i);
    await user.type(cam, '12345.67');
    expect((cam as HTMLInputElement).value).toBe('12,345.67');

    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));
    await waitFor(() => expect(convertToProposal).toHaveBeenCalled());
    const calls = convertToProposal.mock.calls;
    expect(calls[calls.length - 1][1].camPerSqm).toBe(12345.67);
  });

  it('T7: rentFree refuses a fractional value — it is integer MONTHS', async () => {
    const user = userEvent.setup();
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);

    const rentFree = await screen.findByLabelText(/Miễn tiền thuê \(tháng\)/i);
    await user.clear(rentFree);
    await user.type(rentFree, '2.5');
    // decimalScale=0 → the fractional part is rejected at input level.
    expect((rentFree as HTMLInputElement).value).toBe('25');

    await user.clear(rentFree);
    await user.type(rentFree, '3');

    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));
    await waitFor(() => expect(convertToProposal).toHaveBeenCalled());
    const calls = convertToProposal.mock.calls;
    const value = calls[calls.length - 1][1].rentFree;
    expect(value).toBe(3);
    expect(Number.isInteger(value)).toBe(true);
  });

  it('T8: paymentTermDays stays integer days', async () => {
    const user = userEvent.setup();
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);

    const term = await screen.findByLabelText(/Thanh toán \(ngày\)/i);
    await user.clear(term);
    await user.type(term, '45');

    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));
    await waitFor(() => expect(convertToProposal).toHaveBeenCalled());
    const calls = convertToProposal.mock.calls;
    const value = calls[calls.length - 1][1].paymentTermDays;
    expect(value).toBe(45);
    expect(Number.isInteger(value)).toBe(true);
  });

  it('submits numeric primitives, never formatted strings', async () => {
    const user = userEvent.setup();
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);
    await screen.findByLabelText(/Diện tích/i);

    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));
    await waitFor(() => expect(convertToProposal).toHaveBeenCalled());
    const calls = convertToProposal.mock.calls;
    const payload = calls[calls.length - 1][1];

    for (const key of ['area', 'term', 'rentPerSqm', 'deposit', 'rentFree', 'paymentTermDays', 'fitoutDays']) {
      expect(typeof payload[key], `${key} should be a number`).toBe('number');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('required-field validation', () => {
  it('blocks submission and reports the field when a required value is cleared', async () => {
    const user = userEvent.setup();
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);

    const area = await screen.findByLabelText(/Diện tích/i);
    await user.clear(area);
    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/bắt buộc/i);
    expect(convertToProposal).not.toHaveBeenCalled();
    expect(area).toHaveAttribute('aria-invalid', 'true');
  });

  it('T10: the error message is associated with its field via aria-describedby', async () => {
    const user = userEvent.setup();
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);

    const area = await screen.findByLabelText(/Diện tích/i);
    await user.clear(area);
    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));

    await screen.findByRole('alert');
    const describedBy = area.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(/bắt buộc/i);
  });

  it('recovers once the value is supplied again', async () => {
    const user = userEvent.setup();
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);

    const area = await screen.findByLabelText(/Diện tích/i);
    await user.clear(area);
    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));
    await screen.findByRole('alert');

    await user.type(area, '120');
    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));

    await waitFor(() => expect(convertToProposal).toHaveBeenCalled());
    const calls = convertToProposal.mock.calls;
    expect(calls[calls.length - 1][1].area).toBe(120);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Accessibility
// ═══════════════════════════════════════════════════════════════════════════

describe('T10: accessibility', () => {
  const NUMERIC_LABELS = [
    /Diện tích/i, /Thời hạn \(tháng\)/i, /Giá thuê\/m²/i, /CAM\/m²/i,
    /Phí Dịch vụ\/m²/i, /Phí HT KD\/m²/i, /Đặt cọc/i, /Miễn tiền thuê \(tháng\)/i,
    /Tăng giá\/năm/i, /Thanh toán \(ngày\)/i, /Cọc thuê/i, /Cọc thi công/i,
    /Phí thi công/i, /Phí tiện ích/i, /Phí ngoài giờ/i, /TG Hoàn thiện nội thất/i,
  ];

  it('every numeric field has exactly one labelled input', async () => {
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);
    await screen.findByLabelText(/Diện tích/i);

    for (const label of NUMERIC_LABELS) {
      // getAllByLabelText throws if none match; length asserts it is unambiguous.
      expect(screen.getAllByLabelText(label), String(label)).toHaveLength(1);
    }
  });

  it('generated ids are unique across the whole form', async () => {
    const { container } = renderForm(
      <ProposalConversionForm booking={bookingA} open onClose={() => {}} />,
    );
    await screen.findByLabelText(/Diện tích/i);

    const dialog = screen.getByRole('dialog');
    const ids = Array.from(dialog.querySelectorAll('[id]')).map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    void container;
  });

  it('every label points at an element that exists', async () => {
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);
    await screen.findByLabelText(/Diện tích/i);

    const dialog = screen.getByRole('dialog');
    const labels = Array.from(dialog.querySelectorAll('label[for]'));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const target = dialog.querySelector(`#${CSS.escape(label.getAttribute('for')!)}`);
      expect(target, `label "${label.textContent}" targets a missing element`).not.toBeNull();
    }
  });

  it('required fields expose their required state', async () => {
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);
    await screen.findByLabelText(/Diện tích/i);

    expect(screen.getByLabelText(/Diện tích/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Thời hạn \(tháng\)/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Giá thuê\/m²/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Ngày bắt đầu/i)).toHaveAttribute('aria-required', 'true');
    // …and an optional one does not.
    expect(screen.getByLabelText(/CAM\/m²/i)).not.toHaveAttribute('aria-required');
  });

  it('numeric fields are keyboard focusable in document order', async () => {
    const user = userEvent.setup();
    renderForm(<ProposalConversionForm booking={bookingA} open onClose={() => {}} />);

    const area = await screen.findByLabelText(/Diện tích/i);
    area.focus();
    expect(area).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/Thời hạn \(tháng\)/i)).toHaveFocus();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Entry-point parity
// ═══════════════════════════════════════════════════════════════════════════

describe('T9: both entry points submit identical semantics', () => {
  async function submitVia(ui: React.ReactElement) {
    const user = userEvent.setup();
    const { unmount } = renderForm(ui);
    await screen.findByLabelText(/Diện tích/i);
    await user.click(screen.getByRole('button', { name: /Lập Tờ Trình Đề xuất/i }));
    await waitFor(() => expect(convertToProposal).toHaveBeenCalled());
    const calls = convertToProposal.mock.calls;
    const payload = calls[calls.length - 1][1];
    unmount();
    return payload as Record<string, unknown>;
  }

  it('the Spaces dialog and the Bookings dialog produce the same DTO', async () => {
    const fromSpaces = await submitVia(
      <ConvertBookingDialog booking={bookingA} onClose={() => {}} />,
    );
    convertToProposal.mockClear();
    const fromBookings = await submitVia(
      <ConvertToProposalDialog booking={bookingA} open onClose={() => {}} />,
    );

    expect(Object.keys(fromSpaces).sort()).toEqual(Object.keys(fromBookings).sort());
    expect(fromSpaces).toEqual(fromBookings);
  });

  it('both carry the handover + fitout progress fields', async () => {
    const payload = await submitVia(
      <ConvertToProposalDialog booking={bookingA} open onClose={() => {}} />,
    );
    expect(payload).toHaveProperty('handoverDate');
    expect(payload).toHaveProperty('openingDate');
    expect(payload.fitoutDays).toBe(90);
  });

  it('submits rentFree explicitly as a month count', async () => {
    const payload = await submitVia(
      <ConvertBookingDialog booking={bookingA} onClose={() => {}} />,
    );
    expect(payload.rentFree).toBe(0);
    expect(payload.paymentTermDays).toBe(30);
    expect(payload.deposit).toBe(3);
  });

  it('both entry points reset correctly for a second booking', async () => {
    // The reset bug would have surfaced differently per entry point, since the
    // Spaces wrapper derives `open` from booking presence.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ConvertBookingDialog booking={bookingA} onClose={() => {}} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(shown(/Diện tích/i)).toBe('100'));

    rerender(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ConvertBookingDialog booking={bookingB} onClose={() => {}} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(shown(/Diện tích/i)).toBe('250'));
    void within;
  });
});
