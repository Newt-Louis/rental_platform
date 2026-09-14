const SERVICE_CONTRACT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const SERVICE_CONTRACT_EXPIRING_DAYS = 7;

function businessTodayUtc(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SERVICE_CONTRACT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(value('year'), value('month') - 1, value('day'));
}

function endDateUtc(value: string): number | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (dateOnly) return Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

export function getServiceContractExpiryPresentation(
  endDate?: string | null,
  now = new Date(),
): { daysRemaining: number | null; text: string; className: string } {
  if (!endDate) {
    return { daysRemaining: null, text: 'Chưa có ngày kết thúc', className: 'text-muted-foreground' };
  }
  const end = endDateUtc(endDate);
  if (end == null) {
    return { daysRemaining: null, text: 'Ngày kết thúc không hợp lệ', className: 'text-red-600' };
  }
  const daysRemaining = Math.round((end - businessTodayUtc(now)) / 86_400_000);
  if (daysRemaining < 0) {
    return { daysRemaining, text: `Đã hết hạn ${Math.abs(daysRemaining)} ngày`, className: 'text-red-600' };
  }
  if (daysRemaining === 0) {
    return { daysRemaining, text: 'Kết thúc hôm nay', className: 'text-amber-700' };
  }
  if (daysRemaining <= SERVICE_CONTRACT_EXPIRING_DAYS) {
    return { daysRemaining, text: `Còn ${daysRemaining} ngày · Sắp hết hạn`, className: 'text-amber-700' };
  }
  return { daysRemaining, text: `Còn ${daysRemaining} ngày`, className: 'text-muted-foreground' };
}
