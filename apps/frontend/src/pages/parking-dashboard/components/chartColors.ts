// Shared across breakdown cards and charts so cash/online/voucher/total stay consistent.
export const SERIES_COLORS = {
  total: '#4f46e5',
  cash: '#10b981',
  online: '#0ea5e9',
  voucher: '#f59e0b',
} as const;

// Per-vehicle-type breakdown lines (Ô tô, Xe máy, Xe đạp, Khác, ...) — arbitrary count of
// tenant-specific type names, so a fixed-size palette cycled by index instead of named keys.
const VEHICLE_TYPE_PALETTE = ['#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e', '#84cc16', '#6366f1'];

export function vehicleTypeColor(index: number): string {
  return VEHICLE_TYPE_PALETTE[index % VEHICLE_TYPE_PALETTE.length];
}
