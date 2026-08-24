import { describe, it, expect } from 'vitest';
import { classifyNotification } from './notification-classification';

describe('classifyNotification', () => {
  it('classifies action-required types as task', () => {
    for (const type of [
      'APPROVAL_PENDING',
      'TICKET_SLA_BREACH',
      'TICKET_ESCALATION',
      'FITOUT_SLA_BREACH',
      'FITOUT_ESCALATION',
      'FITOUT_ISSUE_ASSIGNED',
      'FITOUT_ISSUE_OVERDUE',
      'FITOUT_SUBMITTAL_PENDING',
      'AR_DUNNING',
      'CONTRACT_EXPIRY',
      'WORK_ORDER',
    ]) {
      expect(classifyNotification(type)).toBe('task');
    }
  });

  it('classifies informational types as notification', () => {
    for (const type of ['PROPOSAL_APPROVED', 'CONTRACT_DRAFT', 'SYSTEM', 'FITOUT_ISSUE_UPDATED']) {
      expect(classifyNotification(type)).toBe('notification');
    }
  });

  it('is case-insensitive', () => {
    expect(classifyNotification('approval_pending')).toBe('task');
  });

  it('defaults unknown or missing types to notification (never hides an item)', () => {
    expect(classifyNotification(undefined)).toBe('notification');
    expect(classifyNotification('SOME_FUTURE_TYPE')).toBe('notification');
  });
});
