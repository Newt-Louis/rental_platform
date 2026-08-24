import { describe, expect, it } from 'vitest';
import enPatrol from '@/locales/en/patrol.json';
import viPatrol from '@/locales/vi/patrol.json';
import enWorkOrders from '@/locales/en/workOrders.json';
import viWorkOrders from '@/locales/vi/workOrders.json';

const workOrderStatuses = [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'ON_HOLD',
  'WAITING_REVIEW',
  'COMPLETED',
  'CANCELLED',
] as const;

const patrolStatuses = [
  'SCHEDULED',
  'OVERDUE',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

const patrolResults = ['PENDING', 'NORMAL', 'ABNORMAL', 'SKIPPED'] as const;

describe('Golden Operations presentation', () => {
  it.each([enWorkOrders, viWorkOrders])('maps every Work Order status without exposing the enum', (locale) => {
    for (const status of workOrderStatuses) {
      expect(locale.status[status]).toBeTruthy();
      expect(locale.status[status]).not.toBe(status);
    }
  });

  it.each([enPatrol, viPatrol])('maps every Patrol Shift status without exposing the enum', (locale) => {
    for (const status of patrolStatuses) {
      expect(locale.status[status]).toBeTruthy();
      expect(locale.status[status]).not.toBe(status);
    }
    for (const result of patrolResults) {
      expect(locale.result[result]).toBeTruthy();
      expect(locale.result[result]).not.toBe(result);
    }
  });
});
