import { describe, expect, it } from 'vitest';
import { formatMoneyWithCode } from './currency';

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
