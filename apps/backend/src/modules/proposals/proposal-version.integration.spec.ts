import { buildProposalSnapshot, compareProposalSnapshots } from './proposal-version.util';

describe('proposal versioning integration flow', () => {
  it('snapshots and compares versions after update', () => {
    const v1 = buildProposalSnapshot({
      id: 'p1',
      proposalNumber: 'PRO-1',
      startDate: '2026-01-01',
      monthlyRent: 100,
      discount: 5,
      status: 'DRAFT',
    });

    const v2 = buildProposalSnapshot({
      id: 'p1',
      proposalNumber: 'PRO-1',
      startDate: '2026-01-01',
      monthlyRent: 90,
      discount: 10,
      status: 'DRAFT',
    });

    const diff = compareProposalSnapshots(v1, v2);
    const fields = diff.map((d) => d.field);
    expect(fields).toContain('monthlyRent');
    expect(fields).toContain('discount');
  });
});
