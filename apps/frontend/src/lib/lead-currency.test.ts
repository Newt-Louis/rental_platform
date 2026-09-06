/**
 * REMEDIATION WAVE 3 — RPT-CUR-005, frontend half.
 *
 * The CRM used to render `Lead.expectedRent` with a hardcoded 'VND' and sum the
 * pipeline into one figure labelled VND. These tests pin that the currency now
 * always comes from the data, and that a missing one is shown as unknown.
 */
import { describe, it, expect } from 'vitest';
import {
  leadValue,
  leadCurrencyKey,
  groupLeadValueByCurrency,
  formatLeadMoney,
  formatLeadMoneyCompact,
  formatLeadBucket,
  UNKNOWN_LEAD_CURRENCY,
} from './lead-currency';

describe('lead-currency (RPT-CUR-005)', () => {
  // T9
  it('T9: renders the currency supplied by the data, not a fixed one', () => {
    expect(formatLeadMoney(10_200, 'USD')).toContain('US$');
    expect(formatLeadMoney(1_000_000, 'VND')).toContain('₫');
    expect(formatLeadMoney(87_000_000, 'MMK')).toContain('K');

    // A USD amount must never be rendered with a dong symbol.
    expect(formatLeadMoney(10_200, 'USD')).not.toContain('₫');
  });

  // T10
  it('T10: an undefined currency is never rendered as VND', () => {
    const rendered = formatLeadMoney(900_000, null);

    expect(rendered).toContain('chưa rõ ĐVT');
    expect(rendered).not.toContain('₫');
    expect(rendered).not.toContain('VND');
    // The amount is still shown -- hiding it would lose information.
    expect(rendered).toContain('900.000');
  });

  it('T10b: the compact variant applies the same rule', () => {
    expect(formatLeadMoneyCompact(1_000_000_000, null)).toContain('chưa rõ ĐVT');
    expect(formatLeadMoneyCompact(1_000_000_000, null)).not.toContain('VND');
    expect(formatLeadMoneyCompact(10_200, 'USD')).toContain('USD');
  });

  it('mirrors the backend valuation rule exactly', () => {
    expect(leadValue({ estimatedValue: 500, expectedRent: 10, expectedArea: 3 })).toBe(500);
    expect(leadValue({ estimatedValue: null, expectedRent: 10, expectedArea: 3 })).toBe(30);
    expect(leadCurrencyKey({ currencyCode: null })).toBe(UNKNOWN_LEAD_CURRENCY);
  });

  // T7 / T8
  it('T7/T8: groups the pipeline per currency and produces no combined total', () => {
    const leads = [
      { estimatedValue: 1_000_000_000, currencyCode: 'VND' as const },
      { estimatedValue: 10_200, currencyCode: 'USD' as const },
      { estimatedValue: 87_000_000, currencyCode: 'MMK' as const },
      { estimatedValue: 5, currencyCode: null },
    ];

    const buckets = groupLeadValueByCurrency(leads);
    expect(buckets.map((b) => b.currencyCode)).toEqual(['VND', 'USD', 'MMK', UNKNOWN_LEAD_CURRENCY]);

    const naiveSum = leads.reduce((s, l) => s + (l.estimatedValue ?? 0), 0);
    expect(buckets.some((b) => b.amount === naiveSum)).toBe(false);
  });

  // T15 — regression proof: the old presentation is what these assertions reject.
  it('T15: the old single VND-labelled total is not reproducible from the buckets', () => {
    const leads = [
      { estimatedValue: 1_000_000_000, currencyCode: 'VND' as const },
      { estimatedValue: 10_200, currencyCode: 'USD' as const },
    ];
    const buckets = groupLeadValueByCurrency(leads);
    const rendered = buckets.map(formatLeadBucket).join(' ');

    // Two separate labelled figures, never one.
    expect(buckets).toHaveLength(2);
    expect(rendered).toContain('₫');
    expect(rendered).toContain('US$');
    expect(rendered).not.toContain('1.000.010.200');
  });

  it('labels an UNKNOWN bucket as such', () => {
    const [bucket] = groupLeadValueByCurrency([{ estimatedValue: 900, currencyCode: null }]);
    expect(formatLeadBucket(bucket)).toContain('chưa rõ ĐVT');
    expect(formatLeadBucket(bucket)).not.toContain('₫');
  });
});
