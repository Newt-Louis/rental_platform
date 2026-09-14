import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyAmount, formatMoneyWithCode } from './currency';

describe('formatMoneyWithCode', () => {
  it('keeps an exact VND amount with an explicit ISO currency code', () => {
    expect(formatMoneyWithCode(3_165_855_000, 'VND')).toBe('3.165.855.000 VND');
  });

  it('does not append a currency code to an unavailable amount', () => {
    expect(formatMoneyWithCode(undefined, 'VND')).toBe('—');
  });

  it('preserves USD decimal precision and uses the ISO code', () => {
    expect(formatMoneyWithCode(500_000, 'USD')).toBe('500.000,00 USD');
  });
});

/**
 * RPT-CUR-007 — the shared formatters must not invent a currency.
 *
 * Two silent defaults existed: a `= 'VND'` parameter default, and a
 * `?? CURRENCIES.VND` fallback for an unrecognised code. Either turns "we do not
 * know what this money is" into a confident wrong label.
 *
 * The parameter default is gone — TypeScript now refuses a call that omits the
 * currency, which is why there is no runtime test for that half: it cannot
 * compile. These cover the runtime half.
 */
describe('RPT-CUR-007 — no invented currency', () => {
  it('renders each known currency as itself', () => {
    expect(formatMoney(1_000_000, 'VND')).toContain('₫');
    expect(formatMoney(1_000, 'USD')).toContain('US$');
    expect(formatMoney(1_000, 'MMK')).toContain('K');
  });

  it('a USD amount is never rendered with a dong sign', () => {
    expect(formatMoney(1_000, 'USD')).not.toContain('₫');
    expect(formatMoneyWithCode(1_000, 'USD')).toContain('USD');
    expect(formatMoneyWithCode(1_000, 'USD')).not.toContain('VND');
  });

  it('an unrecognised code is shown as itself, not as VND', () => {
    // Simulates untyped API data reaching a render path.
    const rendered = formatMoney(1_000, 'EUR' as never);
    expect(rendered).toContain('EUR');
    expect(rendered).not.toContain('₫');
    expect(rendered).not.toContain('VND');
    expect(rendered).toContain('1.000');
  });

  it('formatMoneyWithCode does not fall back to VND for an unknown code', () => {
    const rendered = formatMoneyWithCode(1_000, 'EUR' as never);
    expect(rendered).toContain('EUR');
    expect(rendered).not.toContain('VND');
  });

  it('formatMoneyAmount stays numeric for an unknown code rather than picking one', () => {
    const rendered = formatMoneyAmount(1_000, 'EUR' as never);
    expect(rendered).not.toContain('VND');
    expect(rendered).not.toContain('₫');
  });
});
