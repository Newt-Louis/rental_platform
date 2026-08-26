export interface ManagementFeeSurchargeRates {
  normAreaPerPerson: number;
  surchargePerPerson: number;
}

export interface UtilityRates {
  electricityUnitPrice: number;
  waterUnitPrice: number;
}

export interface AfterHoursCoolingRates {
  hourlyRate: number;
}

export interface ChargeLine {
  type: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface ChargeComputation {
  lines: ChargeLine[];
  subtotal: number;
}

const vnd = (n: number) => Math.round(n).toLocaleString('vi-VN');

export function computeManagementFeeSurcharge(
  input: { headcount: number },
  rates: ManagementFeeSurchargeRates,
  contractedArea: number,
  period: string,
): ChargeComputation {
  const maxHeadcount = rates.normAreaPerPerson > 0 ? Math.floor(contractedArea / rates.normAreaPerPerson) : 0;
  const excess = Math.max(0, Math.round(input.headcount) - maxHeadcount);
  const amount = excess * rates.surchargePerPerson;
  if (excess <= 0) return { lines: [], subtotal: 0 };
  return {
    lines: [{
      type: 'MANAGEMENT_FEE_SURCHARGE',
      description: `Phụ thu Phí Quản Lý - ${period}: ${excess} người vượt định mức x ${vnd(rates.surchargePerPerson)}đ`,
      qty: excess,
      unitPrice: rates.surchargePerPerson,
      amount,
    }],
    subtotal: amount,
  };
}

export function computeUtilityCharge(
  input: { elecStart: number; elecEnd: number; waterStart: number; waterEnd: number },
  rates: UtilityRates,
  period: string,
): ChargeComputation {
  const elecConsumption = Math.max(0, input.elecEnd - input.elecStart);
  const waterConsumption = Math.max(0, input.waterEnd - input.waterStart);
  const elecAmount = elecConsumption * rates.electricityUnitPrice;
  const waterAmount = waterConsumption * rates.waterUnitPrice;

  const lines: ChargeLine[] = [];
  if (elecConsumption > 0) {
    lines.push({
      type: 'ELECTRICITY',
      description: `Tiền Điện - ${period}: ${elecConsumption} kWh x ${vnd(rates.electricityUnitPrice)}đ`,
      qty: elecConsumption,
      unitPrice: rates.electricityUnitPrice,
      amount: elecAmount,
    });
  }
  if (waterConsumption > 0) {
    lines.push({
      type: 'WATER',
      description: `Tiền Nước - ${period}: ${waterConsumption} m³ x ${vnd(rates.waterUnitPrice)}đ`,
      qty: waterConsumption,
      unitPrice: rates.waterUnitPrice,
      amount: waterAmount,
    });
  }
  return { lines, subtotal: elecAmount + waterAmount };
}

export function computeAfterHoursCoolingCharge(
  input: { hours: number },
  rates: AfterHoursCoolingRates,
  period: string,
): ChargeComputation {
  const hours = Math.max(0, input.hours);
  const amount = hours * rates.hourlyRate;
  if (hours <= 0) return { lines: [], subtotal: 0 };
  return {
    lines: [{
      type: 'AFTER_HOURS_COOLING',
      description: `Điện lạnh ngoài giờ - ${period}: ${hours} giờ x ${vnd(rates.hourlyRate)}đ`,
      qty: hours,
      unitPrice: rates.hourlyRate,
      amount,
    }],
    subtotal: amount,
  };
}

export function periodBounds(period: string): { periodStart: Date; periodEnd: Date } {
  const [year, month] = period.split('-').map(Number);
  return {
    periodStart: new Date(Date.UTC(year, month - 1, 1)),
    periodEnd: new Date(Date.UTC(year, month, 0)),
  };
}

// Billing Add-in's own cron fires at a fixed wall-clock hour in Asia/Ho_Chi_Minh (UTC+7, no DST).
// `asOf` is always a UTC instant (`new Date()`), so reading it with UTC getters directly is wrong
// whenever the instant has already crossed a UTC day boundary relative to VN local time (e.g. the
// scheduler's 05:00 ICT on the 1st is 22:00 UTC on the LAST day of the PREVIOUS month) — that bug
// made every monthly run recompute the period that was already generated, silently creating
// nothing. Shifting the instant by the fixed +7h offset before reading UTC getters gives the
// correct Asia/Ho_Chi_Minh calendar date without needing full Intl timezone machinery.
const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

export function currentPeriod(asOf: Date): string {
  const vnLocal = new Date(asOf.getTime() + VN_UTC_OFFSET_MS);
  return `${vnLocal.getUTCFullYear()}-${String(vnLocal.getUTCMonth() + 1).padStart(2, '0')}`;
}
