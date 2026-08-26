export type PendingInvoice = {
  status?: string | null;
  totalAmount?: number | null;
  currencyCode?: string | null;
};

/** Keeps authoritative invoice amounts separated by ISO currency; never performs FX. */
export function groupPendingInvoiceAmounts(invoices: PendingInvoice[]) {
  return invoices
    .filter((invoice) => invoice.status === 'ISSUED' || invoice.status === 'OVERDUE')
    .reduce<Record<string, number>>((totals, invoice) => {
      const currency = invoice.currencyCode ?? 'VND';
      totals[currency] = (totals[currency] ?? 0) + Number(invoice.totalAmount ?? 0);
      return totals;
    }, {});
}
