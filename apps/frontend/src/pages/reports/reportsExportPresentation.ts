export function getReportsExportCap(headers: Record<string, unknown>) {
  const truncated = String(headers['x-export-truncated']) === 'true';
  const rowCount = Number(headers['x-export-row-count'] ?? 0);
  const limit = Number(headers['x-export-limit'] ?? rowCount);
  return { truncated, rowCount, limit };
}
