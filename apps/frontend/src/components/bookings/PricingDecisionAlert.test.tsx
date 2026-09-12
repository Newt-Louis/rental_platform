/**
 * CR-BOOKING-PRICE-APPROVAL-ALWAYS-WARN-004 — the pricing warning surface.
 *
 * The property under test is that this component REPORTS a server decision and
 * never reaches its own conclusion. A frontend that computed "no approval
 * needed" on its own would eventually disagree with the approval steps the
 * server actually wrote, and the user would trust the wrong one.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { PricingDecisionAlert, type PricingDecision } from './PricingDecisionAlert';

function decision(over: Partial<PricingDecision> = {}): PricingDecision {
  return {
    status: 'ROUTED',
    severity: 'WARNING',
    requiresAcknowledgement: true,
    blocking: false,
    basis: 'CATEGORY_BAND',
    proposedRentPerSqm: 672_000,
    reference: { minRentPerSqm: 700_000, maxRentPerSqm: 1_200_000, currency: 'VND' },
    deviationPercent: 4,
    approval: {
      required: true,
      policyConfigured: true,
      steps: [
        {
          stepOrder: 1,
          stepName: 'Leasing Manager Price Review',
          approverRole: 'LEASING_MANAGER',
          approverId: 'u1',
          approverName: 'Nguyễn Văn A',
          policyRuleCode: 'P1',
          policyName: 'Duyệt giá cấp 1',
        },
      ],
    },
    warningCode: 'PRICE_ROUTED',
    message: 'Giá đề xuất thấp hơn giá sàn của ngành hàng, lệch 4,00%.',
    evaluatedAt: new Date().toISOString(),
    fingerprint: 'abc',
    ...over,
  };
}

describe('PricingDecisionAlert', () => {
  // BOOK-WARN-001 / 003 — an outcome that needs nothing still speaks.
  it('shows an informational result when no approval is required', () => {
    render(
      <PricingDecisionAlert
        decision={decision({
          status: 'NOT_REQUIRED',
          severity: 'INFO',
          requiresAcknowledgement: false,
          deviationPercent: 0,
          approval: { required: false, policyConfigured: true, steps: [] },
          message: 'Giá đề xuất nằm trong khung giá. Booking này không yêu cầu phê duyệt giá.',
        })}
      />,
    );

    expect(screen.getByText('Kiểm tra giá thuê hoàn tất')).toBeInTheDocument();
    expect(screen.getByText(/Không yêu cầu phê duyệt giá/)).toBeInTheDocument();
    // Nothing to confirm: the result is simply visible.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  // BOOK-WARN-002 / 004
  it('shows the reference, the deviation and the configured signers', () => {
    render(<PricingDecisionAlert decision={decision()} onAcknowledgeChange={vi.fn()} />);

    expect(screen.getByText('Cảnh báo giá thuê')).toBeInTheDocument();
    expect(screen.getByText('Khung giá ngành hàng')).toBeInTheDocument();
    expect(screen.getByText('4,00%')).toBeInTheDocument();
    expect(screen.getByText('Quy trình dự kiến:')).toBeInTheDocument();
    expect(screen.getByText(/Nguyễn Văn A/)).toBeInTheDocument();
  });

  it('names the base rent as the basis when that is what the server used', () => {
    render(
      <PricingDecisionAlert
        decision={decision({
          basis: 'UNIT_BASE_RENT',
          reference: { unitBaseRentPerSqm: 700_000, currency: 'VND' },
        })}
      />,
    );

    expect(screen.getByText('Giá thuê cơ bản của mặt bằng')).toBeInTheDocument();
    expect(screen.getByText('Giá thuê cơ bản')).toBeInTheDocument();
  });

  // BOOK-WARN-005 / 006
  it('reports a missing policy without naming any approver', () => {
    render(
      <PricingDecisionAlert
        decision={decision({
          status: 'POLICY_NOT_CONFIGURED',
          approval: { required: true, policyConfigured: false, steps: [] },
          message: 'Hệ thống chưa tìm thấy quy trình phê duyệt phù hợp với Booking này.',
        })}
        onAcknowledgeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Chưa cấu hình quy trình duyệt giá')).toBeInTheDocument();
    expect(screen.queryByText('Quy trình dự kiến:')).not.toBeInTheDocument();
  });

  // BOOK-WARN-007
  it('renders an ambiguous configuration as an error with nothing to acknowledge', () => {
    render(
      <PricingDecisionAlert
        decision={decision({
          status: 'POLICY_AMBIGUOUS',
          severity: 'ERROR',
          requiresAcknowledgement: false,
          blocking: true,
          approval: { required: false, policyConfigured: true, steps: [] },
          message: 'Có nhiều quy tắc phê duyệt cùng một vị trí bước.',
        })}
        onAcknowledgeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Cấu hình quy trình duyệt chưa hợp lệ')).toBeInTheDocument();
    // Nothing the user can tick to proceed past an unsafe configuration.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  // BOOK-WARN-008 / 009
  it.each([
    ['CURRENCY_MISMATCH', 'Không thể đối chiếu giá'],
    ['PRICING_REFERENCE_MISSING', 'Chưa có giá tham chiếu'],
  ] as const)('renders %s with its own title', (status, title) => {
    render(
      <PricingDecisionAlert
        decision={decision({
          status,
          basis: 'NONE',
          deviationPercent: null,
          reference: { currency: 'VND' },
          approval: { required: false, policyConfigured: false, steps: [] },
        })}
        onAcknowledgeChange={vi.fn()}
      />,
    );

    expect(screen.getByText(title)).toBeInTheDocument();
    // No reference block, because there is no reference.
    expect(screen.queryByText('Cơ sở đối chiếu')).not.toBeInTheDocument();
  });

  // BOOK-WARN-011 — the component reports, it does not decide.
  it('BOOK-WARN-011 derives nothing itself: severity and signers come from the server', () => {
    // A deliberately contradictory payload: a large deviation the server chose
    // to treat as informational. The component must follow the server.
    render(
      <PricingDecisionAlert
        decision={decision({
          status: 'NOT_REQUIRED',
          severity: 'INFO',
          requiresAcknowledgement: false,
          deviationPercent: 42,
          approval: { required: false, policyConfigured: true, steps: [] },
          message: 'Server nói không cần duyệt.',
        })}
      />,
    );

    expect(screen.getByText('Kiểm tra giá thuê hoàn tất')).toBeInTheDocument();
    expect(screen.queryByText('Cảnh báo giá thuê')).not.toBeInTheDocument();
    expect(screen.queryByText('Quy trình dự kiến:')).not.toBeInTheDocument();
  });

  it('shows an evaluating state rather than a stale verdict', () => {
    render(<PricingDecisionAlert decision={decision()} loading />);

    expect(screen.getByText(/Đang kiểm tra giá/)).toBeInTheDocument();
    expect(screen.queryByText('Cảnh báo giá thuê')).not.toBeInTheDocument();
  });

  it('reports the acknowledgement back to the caller', async () => {
    const onAcknowledgeChange = vi.fn();
    render(
      <PricingDecisionAlert decision={decision()} acknowledged={false} onAcknowledgeChange={onAcknowledgeChange} />,
    );

    await userEvent.click(screen.getByRole('checkbox'));
    expect(onAcknowledgeChange).toHaveBeenCalledWith(true);
  });

  it('renders nothing at all when there is no decision yet', () => {
    const { container } = render(<PricingDecisionAlert decision={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
