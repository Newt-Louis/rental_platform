import { describe, expect, it } from 'vitest';
import { getRevisionMode, REVISION_COPY } from './proposalApprovalPresentation';

describe('Re-opening a Tờ trình for changes', () => {
  it.each([
    ['SUBMITTED', 'WITHDRAW'],
    ['UNDER_REVIEW', 'WITHDRAW'],
    ['APPROVED', 'REPLACE_APPROVED'],
    ['REJECTED', 'AFTER_REJECTION'],
    ['DRAFT', null],
    ['CONVERTED', null],
  ])('a %s Proposal → %s', (status, mode) => {
    expect(getRevisionMode({ status }, true)).toBe(mode);
  });

  it('never re-opens a Proposal that already has a contract, or for a user who cannot edit', () => {
    expect(getRevisionMode({ status: 'APPROVED', contract: { id: 'c1' } }, true)).toBeNull();
    expect(getRevisionMode({ status: 'SUBMITTED' }, false)).toBeNull();
  });

  it('asks for a reason whenever approvers lose a pending or approved document', () => {
    expect(REVISION_COPY.WITHDRAW.reasonRequired).toBe(true);
    expect(REVISION_COPY.REPLACE_APPROVED.reasonRequired).toBe(true);
    expect(REVISION_COPY.AFTER_REJECTION.reasonRequired).toBe(false);
    expect(REVISION_COPY.WITHDRAW.description).toContain('người duyệt được thông báo');
    expect(REVISION_COPY.REPLACE_APPROVED.description).toContain('phê duyệt lại toàn bộ');
  });
});
