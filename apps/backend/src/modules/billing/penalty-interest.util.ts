export type PenaltyPolicyLike = {
  annualRate: number;
  graceDays: number;
};

export function calculatePenaltyInterest(opts: {
  principal: number;
  dueDate: Date;
  asOf: Date;
  policy: PenaltyPolicyLike;
}): { daysOverdue: number; penaltyAmount: number } {
  const due = new Date(opts.dueDate);
  due.setHours(0, 0, 0, 0);
  const asOf = new Date(opts.asOf);
  asOf.setHours(0, 0, 0, 0);

  const rawDays = Math.floor((asOf.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  const daysOverdue = Math.max(0, rawDays - opts.policy.graceDays);

  if (daysOverdue <= 0 || opts.principal <= 0) {
    return { daysOverdue: 0, penaltyAmount: 0 };
  }

  const dailyRate = opts.policy.annualRate / 100 / 365;
  const penaltyAmount = Math.round(opts.principal * dailyRate * daysOverdue);

  return { daysOverdue, penaltyAmount };
}
