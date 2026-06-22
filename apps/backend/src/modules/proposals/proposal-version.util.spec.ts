import {
  buildProposalSnapshot,
  compareProposalSnapshots,
} from './proposal-version.util';

describe('proposal-version.util', () => {
  it('builds snapshot from proposal record', () => {
    const snap = buildProposalSnapshot({
      proposalNumber: 'PRO-2026-00001',
      unitId: 'u1',
      area: 100,
      term: 36,
      startDate: new Date('2026-01-01'),
      rentPerSqm: 1000000,
      camPerSqm: 100000,
      deposit: 3,
      rentFree: 0,
      escalationPercent: 5,
      revenueSharePercent: 0,
      marketingFee: 0,
      monthlyRent: 100000000,
      monthlyCAM: 10000000,
      depositAmount: 300000000,
      totalContractValue: 3600000000,
      discount: 0,
      status: 'DRAFT',
    });

    expect(snap.proposalNumber).toBe('PRO-2026-00001');
    expect(snap.monthlyRent).toBe(100000000);
  });

  it('compares snapshots and returns field diffs', () => {
    const base = buildProposalSnapshot({
      proposalNumber: 'PRO-1',
      unitId: 'u1',
      area: 100,
      term: 36,
      startDate: new Date('2026-01-01'),
      rentPerSqm: 1000000,
      camPerSqm: 0,
      deposit: 3,
      rentFree: 0,
      escalationPercent: 0,
      revenueSharePercent: 0,
      marketingFee: 0,
      monthlyRent: 100000000,
      monthlyCAM: 0,
      depositAmount: 300000000,
      totalContractValue: 3600000000,
      discount: 0,
      status: 'DRAFT',
    });

    const changed = { ...base, discount: 8, monthlyRent: 92000000, status: 'SUBMITTED' };
    const diffs = compareProposalSnapshots(base, changed);

    expect(diffs.some((d) => d.field === 'discount')).toBe(true);
    expect(diffs.some((d) => d.field === 'monthlyRent')).toBe(true);
    expect(diffs.some((d) => d.field === 'status')).toBe(true);
  });
});
