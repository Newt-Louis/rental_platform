export type ContractBillingInput = {
  startDate: Date;
  endDate: Date;
  rent: number;
  cam: number;
  rentFree: number;
  escalationPercent: number;
  paymentTerm: number;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
};

export type BillingPeriodEntry = {
  period: string;
  periodStart: Date;
  periodEnd: Date;
  rentAmount: number;
  camAmount: number;
  subtotal: number;
  dueDate: Date;
  skipped: boolean;
};

function formatPeriod(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function monthIndexFromStart(start: Date, current: Date): number {
  return (current.getFullYear() - start.getFullYear()) * 12 + (current.getMonth() - start.getMonth());
}

function applyEscalation(baseRent: number, escalationPercent: number, monthIndex: number): number {
  const yearsElapsed = Math.floor(monthIndex / 12);
  if (yearsElapsed <= 0 || escalationPercent <= 0) return baseRent;
  return baseRent * Math.pow(1 + escalationPercent / 100, yearsElapsed);
}

function cycleMonths(cycle: ContractBillingInput['billingCycle']): number {
  switch (cycle) {
    case 'QUARTERLY':
      return 3;
    case 'ANNUALLY':
      return 12;
    default:
      return 1;
  }
}

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function inclusiveDays(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endUtc - startUtc) / 86_400_000) + 1;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function generateBillingPeriods(contract: ContractBillingInput): BillingPeriodEntry[] {
  const monthsPerPeriod = cycleMonths(contract.billingCycle);
  const entries: BillingPeriodEntry[] = [];
  let cursor = new Date(contract.startDate);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  const contractStart = startOfDay(contract.startDate);
  const contractEnd = endOfDay(contract.endDate);

  while (cursor <= contractEnd) {
    const cycleStart = new Date(cursor);
    const cycleEnd = addMonths(cursor, monthsPerPeriod);
    cycleEnd.setDate(0);
    cycleEnd.setHours(23, 59, 59, 999);

    if (cycleEnd < contractStart) {
      cursor = addMonths(cursor, monthsPerPeriod);
      continue;
    }

    const periodStart = cycleStart < contractStart ? contractStart : cycleStart;
    const periodEnd = cycleEnd > contractEnd ? contractEnd : cycleEnd;
    let rentAmount = 0;
    let camAmount = 0;

    // Calculate each calendar month separately so that proration, rent-free and
    // annual escalation remain correct for quarterly/annual billing cycles.
    for (let monthOffset = 0; monthOffset < monthsPerPeriod; monthOffset++) {
      const month = addMonths(cycleStart, monthOffset);
      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
      const monthEnd = endOfDay(new Date(month.getFullYear(), month.getMonth() + 1, 0));
      const overlapStart = monthStart < contractStart ? contractStart : monthStart;
      const overlapEnd = monthEnd > contractEnd ? contractEnd : monthEnd;
      if (overlapStart > overlapEnd) continue;

      const proportion = inclusiveDays(overlapStart, overlapEnd) / daysInMonth(month);
      const monthIdx = monthIndexFromStart(contractStart, month);
      const inRentFree = monthIdx < contract.rentFree;
      const escalatedRent = applyEscalation(contract.rent, contract.escalationPercent, monthIdx);
      if (!inRentFree) rentAmount += escalatedRent * proportion;
      camAmount += contract.cam * proportion;
    }

    rentAmount = roundMoney(rentAmount);
    camAmount = roundMoney(camAmount);
    const subtotal = roundMoney(rentAmount + camAmount);
    const dueDate = new Date(periodEnd);
    dueDate.setDate(dueDate.getDate() + contract.paymentTerm);

    entries.push({
      period: formatPeriod(periodStart),
      periodStart,
      periodEnd,
      rentAmount,
      camAmount,
      subtotal,
      dueDate,
      skipped: subtotal === 0,
    });

    cursor = addMonths(cursor, monthsPerPeriod);
  }

  return entries;
}

/** @deprecated use generateBillingPeriods */
export function generateMonthlyBillingPeriods(contract: ContractBillingInput): BillingPeriodEntry[] {
  return generateBillingPeriods({ ...contract, billingCycle: 'MONTHLY' });
}

export function periodsDueForInvoicing(
  entries: BillingPeriodEntry[],
  asOf: Date,
): BillingPeriodEntry[] {
  return entries.filter(
    (e) => !e.skipped && e.subtotal > 0 && e.periodStart <= asOf,
  );
}
