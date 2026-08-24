import { describe, expect, it } from 'vitest';
import { filterFitoutProjects, getFitoutPresentationLabel, groupChangeOrderAmountsByCurrency, humanizeFitoutCode } from './fitoutPresentation';
import en from '@/locales/en/fitout.json';
import vi from '@/locales/vi/fitout.json';

describe('Fitout presentation helpers', () => {
  const projects = [
    { status: 'FITOUT_IN_PROGRESS', tenant: { brandName: 'Alpha' }, unit: { code: 'L1-01', floor: { name: 'Tầng 1' } }, operationManager: { fullName: 'An' } },
    { status: 'OPENED', tenant: { brandName: 'Beta' }, unit: { code: 'L2-02', floor: { name: 'Tầng 2' } }, operationManager: null },
  ];

  it('filters the local worklist by status and business-visible text', () => {
    expect(filterFitoutProjects(projects, 'alpha', '')).toEqual([projects[0]]);
    expect(filterFitoutProjects(projects, 'tầng 2', 'OPENED')).toEqual([projects[1]]);
    expect(filterFitoutProjects(projects, '', 'OPENED')).toEqual([projects[1]]);
  });

  it('uses a localized label when available', () => {
    const translate = (key: string) => key === 'issue.status.OPENED' ? 'Mới mở' : '';
    expect(getFitoutPresentationLabel(translate, 'issue.status', 'OPENED')).toBe('Mới mở');
  });

  it('never exposes an untranslated enum as the fallback label', () => {
    expect(humanizeFitoutCode('IN_PROGRESS')).toBe('In Progress');
    expect(getFitoutPresentationLabel(() => '', 'status', 'APPROVED_TO_OPEN')).toBe('Unknown');
  });

  it('defines localized labels for every status rendered by Fitout workspaces', () => {
    const requiredPaths = [
      'submittal.status.SUBMITTED', 'submittal.status.OBSOLETED',
      'issue.status.OPENED', 'issue.status.CANCELLED',
      'workflow.status.PENDING', 'workflow.status.REJECTED',
      'changeOrder.status.UNDER_REVIEW', 'changeOrder.status.APPROVED',
      'riskControl.status.MITIGATING',
    ];
    const read = (source: Record<string, unknown>, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], source);
    for (const path of requiredPaths) {
      expect(read(en, path), `missing en:${path}`).toBeTruthy();
      expect(read(vi, path), `missing vi:${path}`).toBeTruthy();
    }
  });

  it('keeps change-order totals separated by persisted currency', () => {
    expect(groupChangeOrderAmountsByCurrency([
      { currency: 'VND', status: 'APPROVED', estimatedCost: 1_000, approvedCost: 900 },
      { currency: 'USD', status: 'SUBMITTED', estimatedCost: 25.5 },
      { currency: 'USD', status: 'APPROVED', estimatedCost: 10, approvedCost: 8 },
    ])).toEqual({
      VND: { estimated: 1_000, approved: 900 },
      USD: { estimated: 35.5, approved: 8 },
    });
  });
});
