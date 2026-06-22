export type ArDunningPolicyLike = {
  id: string;
  code: string;
  level: number;
  minDaysOverdue: number;
  maxDaysOverdue?: number | null;
  notifyTenant?: boolean;
  notifyFinance?: boolean;
  isActive: boolean;
};

export function daysOverdue(dueDate: Date, asOf: Date): number {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date(asOf);
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - due.getTime()) / 86400000);
}

export function matchDunningPolicy(
  policies: ArDunningPolicyLike[],
  overdueDays: number,
): ArDunningPolicyLike | null {
  const active = policies
    .filter((p) => p.isActive)
    .sort((a, b) => a.level - b.level);

  for (const policy of active) {
    const withinMin = overdueDays >= policy.minDaysOverdue;
    const withinMax =
      policy.maxDaysOverdue == null || overdueDays <= policy.maxDaysOverdue;
    if (withinMin && withinMax) {
      return policy;
    }
  }

  return null;
}

export function policiesToApply(
  policies: ArDunningPolicyLike[],
  overdueDays: number,
  alreadySentPolicyIds: Set<string>,
): ArDunningPolicyLike[] {
  return policies
    .filter((p) => p.isActive && overdueDays >= p.minDaysOverdue)
    .filter((p) => p.maxDaysOverdue == null || overdueDays <= p.maxDaysOverdue)
    .filter((p) => !alreadySentPolicyIds.has(p.id))
    .sort((a, b) => a.level - b.level);
}
