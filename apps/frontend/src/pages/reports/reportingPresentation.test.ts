import { describe, expect, it } from 'vitest';
import { formatExactReportingAmount, formatExactReportingMoney, formatVndBillionsAxis } from './reportingPresentation';

describe('Golden Reporting financial presentation', () => {
  it('uses a declared billion-VND chart scale without appending an ambiguous suffix', () => {
    expect(formatVndBillionsAxis(3_165_855_000)).toBe('3,2');
    expect(formatVndBillionsAxis(800_000_000)).toBe('0,8');
  });

  it('keeps exact monetary values and explicit ISO currency outside chart axes', () => {
    expect(formatExactReportingAmount(3_165_855_000, 'VND')).toBe('3.165.855.000');
    expect(formatExactReportingMoney(3_165_855_000, 'VND')).toBe('3.165.855.000 VND');
    expect(formatExactReportingMoney(1_250_000.25, 'USD')).toBe('1.250.000,25 USD');
  });
});
