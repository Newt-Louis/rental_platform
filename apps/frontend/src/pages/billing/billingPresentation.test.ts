import { describe, expect, it } from 'vitest';
import { buildInvoiceExportParams, getAuthoritativeBalance, getExportNotice } from './billingPresentation';

describe('Golden Billing presentation contracts', () => {
  it('exports all technically supported active invoice filters', () => {
    const params = buildInvoiceExportParams({
      search: 'INV-2026', status: 'OVERDUE', bucket: 'OVERDUE',
      sourceType: 'LEASE_CONTRACT', period: '2026-08', mallId: 'mall-1',
    });
    expect(Object.fromEntries(params.entries())).toEqual({
      search: 'INV-2026', status: 'OVERDUE', bucket: 'OVERDUE',
      sourceType: 'LEASE_CONTRACT', period: '2026-08', mallId: 'mall-1',
    });
  });

  it('does not export the UI-only unbilled bucket through the invoice endpoint', () => {
    expect(buildInvoiceExportParams({ bucket: 'UNBILLED' }).toString()).toBe('');
  });

  it('prefers the backend-authoritative balance over frontend recalculation', () => {
    expect(getAuthoritativeBalance({ totalAmount: 100, totalPaid: 20, balance: 75 })).toBe(75);
    expect(getAuthoritativeBalance({ totalAmount: 100, totalPaid: 20 })).toBe(80);
  });

  it('explicitly discloses a capped export', () => {
    expect(getExportNotice({
      'x-export-row-count': '5000', 'x-export-limit': '5000', 'x-export-truncated': 'true',
    })).toMatchObject({ truncated: true, title: 'Đã xuất 5000 dòng (bị giới hạn)' });
  });
});
