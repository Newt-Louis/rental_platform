import { describe, expect, it } from 'vitest';
import { canModifyFitoutSubmittal, canUploadToFitoutSubmittal, filterFitoutProjects, formatDecimalAmountWithoutCurrency, formatDecimalMoneyPreservingCode, formatDecimalMoneyWithCode, getFitoutPresentationLabel, getFitoutRoleCapabilities, groupChangeOrderAmountsByCurrency, humanizeFitoutCode } from './fitoutPresentation';
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

  it('applies meaningful attention filters without changing project status semantics', () => {
    const now = new Date('2026-08-24T00:00:00Z');
    const attentionProjects = [
      { ...projects[0], expectedOpenDate: '2026-08-30T00:00:00Z' },
      { ...projects[1], expectedOpenDate: '2026-08-20T00:00:00Z' },
    ];
    expect(filterFitoutProjects(attentionProjects, '', '', 'OPENING_SOON', now)).toEqual([attentionProjects[0]]);
    expect(filterFitoutProjects(attentionProjects, '', '', 'UNASSIGNED', now)).toEqual([attentionProjects[1]]);
    expect(filterFitoutProjects(attentionProjects, '', '', 'COMPLETED', now)).toEqual([attentionProjects[1]]);
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
      { currency: 'VND', status: 'APPROVED', estimatedCost: '1000.00', approvedCost: '900.00' },
      { currency: 'USD', status: 'SUBMITTED', estimatedCost: '25.50' },
      { currency: 'USD', status: 'APPROVED', estimatedCost: '10.00', approvedCost: '8.00' },
      { currency: 'USD', costType: 'DEDUCTION', status: 'APPROVED', estimatedCost: '0.25', approvedCost: '0.15' },
    ])).toEqual({
      VND: { estimated: '1000.00', approved: '900.00' },
      USD: { estimated: '35.25', approved: '7.85' },
    });
  });

  it('never silently assumes VND when persisted currency is absent', () => {
    expect(groupChangeOrderAmountsByCurrency([
      { currency: null, status: 'APPROVED', estimatedCost: '1000.00', approvedCost: '900.00' },
    ])).toEqual({
      UNSPECIFIED: { estimated: '1000.00', approved: '900.00' },
    });
  });

  it('does not substitute the proposed amount for a missing approved amount', () => {
    expect(groupChangeOrderAmountsByCurrency([
      { currency: 'USD', status: 'APPROVED', estimatedCost: '1000.00', approvedCost: null },
    ])).toEqual({
      USD: { estimated: '1000.00', approved: '0.00' },
    });
  });

  it('formats Decimal strings without coercing them through JavaScript Number', () => {
    expect(formatDecimalMoneyWithCode('9007199254740991.25', 'USD', 'en-US')).toBe('9,007,199,254,740,991.25 USD');
    expect(formatDecimalMoneyWithCode('3165855000.00', 'VND', 'vi-VN')).toBe('3.165.855.000 VND');
    expect(formatDecimalAmountWithoutCurrency('9007199254740991.25', 'en-US')).toBe('9,007,199,254,740,991.25');
  });

  it('preserves exact legacy amounts and raw unsupported currency codes', () => {
    expect(formatDecimalMoneyPreservingCode('1.25', 'EUR', 'en-US')).toBe('1.25 EUR');
    expect(formatDecimalMoneyPreservingCode('9007199254740991.25', 'EUR', 'en-US')).toBe('9,007,199,254,740,991.25 EUR');
  });

  it('uses Contract-inherited currency copy without an implicit VND label', () => {
    expect(en.changeOrder.fields.estimatedCost).toBe('Estimated cost *');
    expect(vi.changeOrder.fields.estimatedCost).toBe('Chi phí dự kiến *');
    expect(en.changeOrder.inheritedCurrency).toContain('{{currency}}');
    expect(vi.changeOrder.inheritedCurrency).toContain('{{currency}}');
  });

  it('limits Tenant presentation to own-project Overview and Documents actions', () => {
    expect(getFitoutRoleCapabilities('TENANT')).toMatchObject({
      workspaces: ['overview', 'documents'],
      canUseStaffWorkspaces: false,
      canAssign: false,
      canAdvance: false,
      canOverrideGate: false,
      canConfigure: false,
      canCreateSubmittal: true,
      canUploadSubmittal: true,
      canResubmitSubmittal: true,
      canApproveSubmittal: false,
      canPublishSubmittal: false,
    });
  });

  it('matches approved staff stage and configuration capabilities', () => {
    expect(getFitoutRoleCapabilities('ADMIN')).toMatchObject({ canConfigure: true, canAdvance: true, canOverrideGate: true });
    expect(getFitoutRoleCapabilities('MALL_DIRECTOR')).toMatchObject({ canConfigure: false, canAdvance: true, canOverrideGate: true });
    expect(getFitoutRoleCapabilities('OPERATION')).toMatchObject({ canConfigure: false, canAdvance: true, canOverrideGate: false });
    expect(getFitoutRoleCapabilities('LEASING_MANAGER')).toMatchObject({ canConfigure: false, canAdvance: false, canOverrideGate: false });
    expect(getFitoutRoleCapabilities('ADMIN').canAdministerContractors).toBe(true);
    expect(getFitoutRoleCapabilities('MALL_DIRECTOR').canAdministerContractors).toBe(true);
    expect(getFitoutRoleCapabilities('OPERATION').canAdministerContractors).toBe(true);
    expect(getFitoutRoleCapabilities('LEASING_MANAGER').canAdministerContractors).toBe(false);
    expect(getFitoutRoleCapabilities('TENANT').canAdministerContractors).toBe(false);
  });

  it('shows Tenant upload/resubmit actions only for the signed-in submitter', () => {
    expect(canModifyFitoutSubmittal('TENANT', 'tenant-user-1', 'tenant-user-1')).toBe(true);
    expect(canModifyFitoutSubmittal('TENANT', 'tenant-user-1', 'staff-user-1')).toBe(false);
    expect(canModifyFitoutSubmittal('OPERATION', 'operation-1', 'tenant-user-1')).toBe(true);
  });

  it('allows attachment upload only while a submittal is active', () => {
    expect(canUploadToFitoutSubmittal('SUBMITTED')).toBe(true);
    expect(canUploadToFitoutSubmittal('IN_PROGRESS')).toBe(true);
    expect(canUploadToFitoutSubmittal('REJECTED')).toBe(false);
    expect(canUploadToFitoutSubmittal('APPROVED')).toBe(false);
    expect(canUploadToFitoutSubmittal('PUBLISHED')).toBe(false);
    expect(canUploadToFitoutSubmittal('OBSOLETED')).toBe(false);
  });
});
