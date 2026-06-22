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

export function generateBillingPeriods(contract: ContractBillingInput): BillingPeriodEntry[] {
  const monthsPerPeriod = cycleMonths(contract.billingCycle);
  const entries: BillingPeriodEntry[] = [];
  let cursor = new Date(contract.startDate);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  const contractStart = new Date(contract.startDate);
  contractStart.setHours(0, 0, 0, 0);
  const contractEnd = new Date(contract.endDate);
  contractEnd.setHours(23, 59, 59, 999);

  while (cursor <= contractEnd) {
    const periodStart = new Date(cursor);
    const periodEnd = addMonths(cursor, monthsPerPeriod);
    periodEnd.setDate(0);
    periodEnd.setHours(23, 59, 59, 999);

    if (periodEnd < contractStart) {
      cursor = addMonths(cursor, monthsPerPeriod);
      continue;
    }

    const monthIdx = monthIndexFromStart(contractStart, periodStart);
    const rentFreeMonths = contract.rentFree;
    const inRentFree = monthIdx < rentFreeMonths;

    const rentMultiplier = monthsPerPeriod;
    const baseRent = applyEscalation(contract.rent, contract.escalationPercent, monthIdx);
    const rentAmount = inRentFree ? 0 : baseRent * rentMultiplier;
    const camAmount = contract.cam * rentMultiplier;
    const subtotal = rentAmount + camAmount;
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
      skipped: inRentFree && camAmount === 0,
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
