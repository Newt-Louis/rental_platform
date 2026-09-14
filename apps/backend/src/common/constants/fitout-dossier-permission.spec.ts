import { Role } from '@prisma/client';
import { MODULE_PERMISSION_DEFAULTS } from './module-permission-defaults';
import { MODULE_ROLES } from './role-permissions';

describe('CR-AUTH-FITOUT-001 least-privilege matrix', () => {
  it('DOSSIER-013 adds FITOUT_BASIC_TEAM only to FITOUT_DOSSIER_VIEW', () => {
    expect(MODULE_ROLES.fitoutDossierView).toContain(Role.FITOUT_BASIC_TEAM);
    expect(MODULE_ROLES.tenants).not.toContain(Role.FITOUT_BASIC_TEAM);
    expect(MODULE_ROLES.fitout).not.toContain(Role.FITOUT_BASIC_TEAM);
    expect(MODULE_ROLES.approvals).not.toContain(Role.FITOUT_BASIC_TEAM);
    expect(MODULE_ROLES.billing).not.toContain(Role.FITOUT_BASIC_TEAM);
  });

  it('DOSSIER-014 persists the same least-privilege default in the dynamic permission matrix', () => {
    const granted = MODULE_PERMISSION_DEFAULTS
      .filter(({ roles }) => roles.includes(Role.FITOUT_BASIC_TEAM))
      .map(({ module }) => module);
    expect(granted).toEqual(['fitout-dossier-view']);
  });
});
