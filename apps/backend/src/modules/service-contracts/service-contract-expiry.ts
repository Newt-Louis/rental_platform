export const SERVICE_CONTRACT_EXPIRING_DAYS = 7;
export const SERVICE_CONTRACT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function getServiceContractDateWindow(now = new Date()): {
  today: Date;
  expiringThrough: Date;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SERVICE_CONTRACT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const today = new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
  const expiringThrough = new Date(today);
  expiringThrough.setUTCDate(expiringThrough.getUTCDate() + SERVICE_CONTRACT_EXPIRING_DAYS);
  return { today, expiringThrough };
}

export function classifyServiceContractEndDate(
  endDate: Date,
  now = new Date(),
): 'ACTIVE' | 'EXPIRING' | 'EXPIRED' {
  const { today, expiringThrough } = getServiceContractDateWindow(now);
  const contractEndDate = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
  );
  if (contractEndDate < today.getTime()) return 'EXPIRED';
  if (contractEndDate <= expiringThrough.getTime()) return 'EXPIRING';
  return 'ACTIVE';
}
