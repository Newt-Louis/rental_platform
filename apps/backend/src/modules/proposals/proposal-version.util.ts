export type ProposalSnapshot = {
  proposalNumber: string;
  leadId?: string | null;
  tenantId?: string | null;
  unitId: string;
  area: number;
  term: number;
  startDate: string;
  endDate?: string | null;
  rentPerSqm: number;
  camPerSqm: number;
  deposit: number;
  rentFree: number;
  escalationPercent: number;
  revenueSharePercent: number;
  marketingFee: number;
  monthlyRent: number;
  monthlyCAM: number;
  depositAmount: number;
  totalContractValue: number;
  discount: number;
  notes?: string | null;
  status: string;
};

export function buildProposalSnapshot(proposal: Record<string, unknown>): ProposalSnapshot {
  return {
    proposalNumber: proposal.proposalNumber as string,
    leadId: (proposal.leadId as string) ?? null,
    tenantId: (proposal.tenantId as string) ?? null,
    unitId: proposal.unitId as string,
    area: proposal.area as number,
    term: proposal.term as number,
    startDate: new Date(proposal.startDate as string | Date).toISOString(),
    endDate: proposal.endDate ? new Date(proposal.endDate as string | Date).toISOString() : null,
    rentPerSqm: proposal.rentPerSqm as number,
    camPerSqm: proposal.camPerSqm as number,
    deposit: proposal.deposit as number,
    rentFree: proposal.rentFree as number,
    escalationPercent: proposal.escalationPercent as number,
    revenueSharePercent: proposal.revenueSharePercent as number,
    marketingFee: proposal.marketingFee as number,
    monthlyRent: proposal.monthlyRent as number,
    monthlyCAM: proposal.monthlyCAM as number,
    depositAmount: proposal.depositAmount as number,
    totalContractValue: proposal.totalContractValue as number,
    discount: proposal.discount as number,
    notes: (proposal.notes as string) ?? null,
    status: proposal.status as string,
  };
}

export type ProposalVersionDiff = {
  field: string;
  from: unknown;
  to: unknown;
};

const COMPARE_FIELDS: (keyof ProposalSnapshot)[] = [
  'area',
  'term',
  'rentPerSqm',
  'camPerSqm',
  'deposit',
  'rentFree',
  'escalationPercent',
  'revenueSharePercent',
  'marketingFee',
  'monthlyRent',
  'monthlyCAM',
  'depositAmount',
  'totalContractValue',
  'discount',
  'notes',
  'status',
];

export function compareProposalSnapshots(
  from: ProposalSnapshot,
  to: ProposalSnapshot,
): ProposalVersionDiff[] {
  const diffs: ProposalVersionDiff[] = [];

  for (const field of COMPARE_FIELDS) {
    const a = from[field];
    const b = to[field];
    if (a !== b) {
      diffs.push({ field, from: a, to: b });
    }
  }

  return diffs;
}
