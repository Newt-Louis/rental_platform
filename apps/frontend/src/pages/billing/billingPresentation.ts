export interface InvoiceExportFilters {
  search?: string;
  status?: string;
  bucket?: string;
  sourceType?: string;
  period?: string;
  mallId?: string | null;
}

export function buildInvoiceExportParams(filters: InvoiceExportFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && !(key === 'bucket' && value === 'UNBILLED')) params.set(key, value);
  }
  return params;
}

export function getAuthoritativeBalance(invoice?: {
  balance?: number | null;
  totalAmount: number;
  totalPaid?: number | null;
} | null) {
  if (!invoice) return 0;
  return invoice.balance ?? (invoice.totalAmount - (invoice.totalPaid ?? 0));
}

export function getExportNotice(headers: Record<string, unknown>) {
  const rowCount = headers['x-export-row-count'] == null ? undefined : String(headers['x-export-row-count']);
  const limit = headers['x-export-limit'] == null ? undefined : String(headers['x-export-limit']);
  const truncated = String(headers['x-export-truncated']) === 'true';
  return {
    truncated,
    title: truncated ? `Đã xuất ${rowCount || limit} dòng (bị giới hạn)` : `Đã xuất ${rowCount || 0} dòng`,
    description: truncated
      ? `Kết quả vượt giới hạn ${limit} dòng. Hãy thu hẹp bộ lọc để xuất đầy đủ.`
      : 'File giữ nguyên cột số tiền và tiền tệ.',
  };
}
