import { describe, expect, it } from 'vitest';
import { groupPendingInvoiceAmounts } from './tenantPortalPresentation';

describe('groupPendingInvoiceAmounts', () => {
  it('groups pending amounts by authoritative currency without FX', () => {
    expect(groupPendingInvoiceAmounts([
      { status: 'ISSUED', totalAmount: 3_000_000, currencyCode: 'VND' },
      { status: 'OVERDUE', totalAmount: 125.5, currencyCode: 'USD' },
      { status: 'ISSUED', totalAmount: 2_000_000, currencyCode: 'VND' },
      { status: 'PAID', totalAmount: 999, currencyCode: 'USD' },
    ])).toEqual({ VND: 5_000_000, USD: 125.5 });
  });

  it('uses the persisted legacy default only when currency is absent', () => {
    expect(groupPendingInvoiceAmounts([
      { status: 'OVERDUE', totalAmount: 10, currencyCode: null },
    ])).toEqual({ VND: 10 });
  });
});
