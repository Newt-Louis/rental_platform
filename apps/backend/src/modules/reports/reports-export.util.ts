export interface CsvExportResult {
  csv: string;
  rowCount: number;
  truncated: boolean;
  limit: number;
}

export function encodeCsv(
  header: string[],
  rows: unknown[][],
  truncated = false,
  limit = rows.length,
): CsvExportResult {
  return {
    csv: [
      header.join(','),
      ...rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n'),
    rowCount: rows.length,
    truncated,
    limit,
  };
}

export function buildRevenueCsv(
  exportRows: Array<{
    contract?: { contractNumber?: string | null } | null;
    tenant?: { brandName?: string | null } | null;
    period: string;
    type: string;
    totalAmount: number | { toString(): string };
    currencyCode: string;
    status: string;
    createdAt: Date | string;
  }>,
  exportLimit: number,
): CsvExportResult {
  const truncated = exportRows.length > exportLimit;
  const rows = exportRows.slice(0, exportLimit).map((invoice) => [
    invoice.contract?.contractNumber ?? '',
    invoice.tenant?.brandName ?? '',
    invoice.period,
    invoice.type,
    invoice.totalAmount.toString(),
    invoice.currencyCode,
    invoice.status,
    new Date(invoice.createdAt).toLocaleDateString('vi-VN'),
  ]);
  return encodeCsv(
    ['Số HĐ', 'Khách thuê', 'Kỳ', 'Loại', 'Số tiền', 'Tiền tệ', 'Trạng thái', 'Ngày tạo'],
    rows,
    truncated,
    exportLimit,
  );
}
