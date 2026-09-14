/**
 * Proposal governance — `proposal-send-external` is an action permission in the
 * existing Mall-scoped ModulePermission matrix (PROP-PERM, backend side).
 */
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PermissionsService } from '../../../common/services/permissions.service';
import { MODULE_PERMISSION_DEFAULTS } from '../../../common/constants/module-permission-defaults';
import { MODULE_ROLES } from '../../../common/constants/role-permissions';
import { ProposalDocumentDeliveryService, PROPOSAL_SEND_EXTERNAL_PERMISSION } from './proposal-document-delivery.service';

type Row = { module: string; role: Role; mallId: string; allowed: boolean };

function matrix(rows: Row[]) {
  const table = [...rows];
  const prisma: any = {
    modulePermission: {
      findMany: jest.fn(async () => table),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const k = where.module_role_mallId;
        const existing = table.find((r) => r.module === k.module && r.role === k.role && r.mallId === k.mallId);
        if (existing) Object.assign(existing, update); else table.push({ ...create });
      }),
    },
  };
  return { permissions: new PermissionsService(prisma), table };
}

const seeded = (mallId: string): Row[] => [Role.LEASING_MANAGER, Role.MALL_DIRECTOR]
  .map((role) => ({ module: PROPOSAL_SEND_EXTERNAL_PERMISSION, role, mallId, allowed: true }));

function sender(permissions: PermissionsService, accessibleMalls: string[]) {
  const mallAccess: any = {
    assertMallAccess: jest.fn(async (_u: string, role: Role, mallId: string) => {
      if (role !== Role.ADMIN && !accessibleMalls.includes(mallId)) throw new ForbiddenException('No access to this mall');
    }),
  };
  return new ProposalDocumentDeliveryService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { register: jest.fn() } as any, permissions, mallAccess);
}

describe('proposal-send-external action permission', () => {
  const EXEC = { id: 'u-exec', role: Role.LEASING_EXECUTIVE };

  it('is shipped as its own matrix entry, narrower than proposal module access', () => {
    const entry = MODULE_PERMISSION_DEFAULTS.find((d) => d.module === PROPOSAL_SEND_EXTERNAL_PERMISSION);
    expect(entry?.roles).toEqual([Role.LEASING_MANAGER, Role.MALL_DIRECTOR]);
    expect(MODULE_ROLES.proposals).toContain(Role.LEASING_EXECUTIVE);
  });

  it('PROP-PERM-005 proposal module access alone does not authorise sending', async () => {
    const { permissions } = matrix([...seeded('GLOBAL'), ...seeded('mall-a')]);
    expect(await sender(permissions, ['mall-a']).canSend(EXEC, 'mall-a')).toBe(false);
  });

  it('PROP-PERM-002/003 granting and revoking through the matrix changes effective authority immediately', async () => {
    const { permissions } = matrix([...seeded('GLOBAL'), ...seeded('mall-a')]);
    const svc = sender(permissions, ['mall-a']);

    await permissions.setAllowed(PROPOSAL_SEND_EXTERNAL_PERMISSION, Role.LEASING_EXECUTIVE, true, 'admin', 'mall-a');
    expect(await svc.canSend(EXEC, 'mall-a')).toBe(true);
    expect(await permissions.getEffectiveModules(Role.LEASING_EXECUTIVE, 'mall-a')).toContain(PROPOSAL_SEND_EXTERNAL_PERMISSION);

    await permissions.setAllowed(PROPOSAL_SEND_EXTERNAL_PERMISSION, Role.LEASING_EXECUTIVE, false, 'admin', 'mall-a');
    expect(await svc.canSend(EXEC, 'mall-a')).toBe(false);
    expect(await permissions.getEffectiveModules(Role.LEASING_EXECUTIVE, 'mall-a')).not.toContain(PROPOSAL_SEND_EXTERNAL_PERMISSION);
  });

  it('PROP-PERM-004/007 a Mall A grant does not authorise Mall B', async () => {
    const { permissions } = matrix([...seeded('GLOBAL'), ...seeded('mall-a'), ...seeded('mall-b')]);
    await permissions.setAllowed(PROPOSAL_SEND_EXTERNAL_PERMISSION, Role.LEASING_EXECUTIVE, true, 'admin', 'mall-a');
    const svc = sender(permissions, ['mall-a', 'mall-b']);
    expect(await svc.canSend(EXEC, 'mall-a')).toBe(true);
    expect(await svc.canSend(EXEC, 'mall-b')).toBe(false);
    // Holding the permission in Mall A does not open Mall B's data either.
    expect(await sender(permissions, ['mall-a']).canSend({ id: 'u-mgr', role: Role.LEASING_MANAGER }, 'mall-b')).toBe(false);
  });

  it('PROP-PERM-006/010 the send endpoint enforces it server-side, before any send or email row', async () => {
    const { permissions } = matrix([...seeded('GLOBAL'), ...seeded('mall-a')]);
    const prisma: any = {
      proposal: { findUnique: jest.fn().mockResolvedValue({ proposalNumber: 'PRO-1', unit: { code: 'L1', mallId: 'mall-a' }, tenant: null, lead: null }) },
      $transaction: jest.fn(),
      proposalDocumentSend: { findUnique: jest.fn() },
    };
    const documents: any = { loadVersion: jest.fn() };
    const mallAccess: any = { assertMallAccess: jest.fn() };
    const svc = new ProposalDocumentDeliveryService(prisma, documents, {} as any, {} as any, {} as any, {} as any, { register: jest.fn() } as any, permissions, mallAccess);

    await expect(svc.sendExternal('p1', { documentVersionId: 'dv', to: ['a@b.vn'] }, EXEC, 'key-00000001')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.proposalDocumentSend.findUnique).not.toHaveBeenCalled();
    expect(documents.loadVersion).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
