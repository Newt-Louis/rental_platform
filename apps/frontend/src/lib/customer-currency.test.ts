/**
 * REMEDIATION WAVE 4 — CUR-002-CUSTOMER, frontend half.
 *
 * The CRM rendered a Customer budget as `"${min}–${max} tr/m²"`. "tr" is
 * triệu đồng, a VND unit word, printed over values the model could not prove
 * were VND. The currency now comes from the Customer.
 */
import { describe, it, expect } from 'vitest';
import {
  formatBudgetRange,
  formatBudgetValue,
  customerCurrencyKey,
  groupCustomerBudgetByCurrency,
  UNKNOWN_CUSTOMER_CURRENCY,
} from './customer-currency';

describe('customer-currency (CUR-002-CUSTOMER)', () => {
  // T7
  it('T7: the budget range shows the Customer currency', () => {
    expect(formatBudgetRange(800_000, 1_000_000, 'VND')).toBe('800.000–1.000.000 VND/m²');
    expect(formatBudgetRange(30, 45, 'USD')).toBe('30–45 USD/m²');
    expect(formatBudgetRange(29_000, 35_000, 'MMK')).toBe('29.000–35.000 MMK/m²');
  });

  it('T7b: the VND unit word "tr" is gone', () => {
    expect(formatBudgetRange(30, 45, 'USD')).not.toContain('tr/m²');
    expect(formatBudgetRange(800_000, 1_000_000, 'VND')).not.toContain('tr/m²');
  });

  // T8
  it('T8: an unknown currency is stated, never rendered as VND', () => {
    const rendered = formatBudgetRange(800_000, 1_000_000, null);

    expect(rendered).toContain('chưa rõ ĐVT');
    expect(rendered).not.toContain('VND');
    expect(rendered).not.toContain('₫');
    expect(rendered).not.toContain('tr/m²');
    // The figures are still shown -- hiding them would lose information.
    expect(rendered).toContain('800.000');
  });

  it('T8b: a half-filled range still renders honestly', () => {
    expect(formatBudgetRange(800_000, null, 'VND')).toBe('800.000–? VND/m²');
    expect(formatBudgetRange(null, null, 'VND')).toBe('—');
  });

  it('T8c: a single budget value follows the same rule', () => {
    expect(formatBudgetValue(30, 'USD')).toContain('US$');
    expect(formatBudgetValue(800_000, null)).toContain('chưa rõ ĐVT');
    expect(formatBudgetValue(800_000, null)).not.toContain('₫');
    expect(formatBudgetValue(null, 'VND')).toBe('—');
  });

  it('a missing currency keys to UNKNOWN, not VND', () => {
    expect(customerCurrencyKey({ currencyCode: null })).toBe(UNKNOWN_CUSTOMER_CURRENCY);
    expect(customerCurrencyKey({})).not.toBe('VND');
  });

  // T9 (frontend half) — no aggregate exists in the product today, but the safe
  // shape must be the one available so the next one cannot be a bare sum.
  it('T9: a Customer budget aggregate groups by currency and produces no combined total', () => {
    const customers = [
      { budgetMin: 800_000, budgetMax: 1_000_000, currencyCode: 'VND' as const },
      { budgetMin: 30, budgetMax: 45, currencyCode: 'USD' as const },
      { budgetMin: 500, budgetMax: 900, currencyCode: null },
    ];

    const buckets = groupCustomerBudgetByCurrency(customers);
    expect(buckets.map((b) => b.currencyCode)).toEqual(['VND', 'USD', UNKNOWN_CUSTOMER_CURRENCY]);

    const naiveMax = customers.reduce((s, c) => s + (c.budgetMax ?? 0), 0);
    expect(buckets.some((b) => b.budgetMax === naiveMax)).toBe(false);
  });

  // T14 — regression proof for the presentation half.
  it('T14: the old "tr/m²" rendering is not reproducible', () => {
    const oldRendering = `${800_000}–${1_000_000} tr/m²`;
    expect(formatBudgetRange(800_000, 1_000_000, 'VND')).not.toBe(oldRendering);
    expect(formatBudgetRange(800_000, 1_000_000, null)).not.toBe(oldRendering);
  });
});
