import { describe, expect, it } from 'vitest';
import {
  amendmentValue,
  CONTRACT_STATUS_PRESENTATION,
  getContractRoleCapabilities,
} from './ContractsPage';
import en from '@/locales/en/contracts.json';
import vi from '@/locales/vi/contracts.json';

describe('Golden Contract presentation', () => {
  it('keeps all authoritative contract statuses visible', () => {
    expect(Object.keys(CONTRACT_STATUS_PRESENTATION)).toEqual([
      'DRAFT',
      'PENDING_LEGAL',
      'PENDING_SIGNATURE',
      'ACTIVE',
      'EXPIRING',
      'EXPIRED',
      'TERMINATING',
      'TERMINATED',
    ]);
  });

  it('matches existing role restrictions for edit, status and billing actions', () => {
    expect(getContractRoleCapabilities('ADMIN')).toEqual({
      canEdit: true,
      canChangeStatus: true,
      canReadStaffDetail: true,
      canBuildSchedule: true,
    });
    expect(getContractRoleCapabilities('LEGAL')).toEqual({
      canEdit: true,
      canChangeStatus: false,
      canReadStaffDetail: true,
      canBuildSchedule: false,
    });
    expect(getContractRoleCapabilities('FINANCE')).toEqual({
      canEdit: false,
      canChangeStatus: false,
      canReadStaffDetail: true,
      canBuildSchedule: true,
    });
    expect(getContractRoleCapabilities('TENANT')).toEqual({
      canEdit: false,
      canChangeStatus: false,
      canReadStaffDetail: false,
      canBuildSchedule: false,
    });
  });

  it('renders amendment money at full precision', () => {
    expect(amendmentValue(3_165_855_000, 'VND')).toContain('3.165.855.000');
    expect(amendmentValue(1_250_000.25, 'USD')).toContain('1.250.000,25');
  });

  it.each([en, vi])('defines the five business-object tabs and separated termination workspace', (locale) => {
    expect(locale.sheet.tabs).toMatchObject({
      overview: expect.any(String),
      financial: expect.any(String),
      documents: expect.any(String),
      amendments: expect.any(String),
      activity: expect.any(String),
    });
    expect(locale.termination.workspaceAction).toEqual(expect.any(String));
    expect(locale.termination.confirm.complete).toMatchObject({
      title: expect.any(String),
      description: expect.any(String),
      action: expect.any(String),
    });
  });

  it('localizes the authoritative lease agreement enum for Vietnamese users', () => {
    expect(vi.type.LEASE_AGREEMENT).toBe('Hợp đồng thuê');
    expect(en.type.LEASE_AGREEMENT).toBe('Lease Agreement');
  });
});
