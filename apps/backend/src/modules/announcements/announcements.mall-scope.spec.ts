/**
 * MALL-001 / AUTH-01 — announcements leaked across malls on all three read paths.
 *
 * Proven at runtime on a two-Mall database (2026-09-07), as MALL_DIRECTOR holding
 * access to Mall A only:
 *
 *   GET /announcements/admin        -> Mall B's announcement (route was GAP-annotated)
 *   GET /announcements              -> Mall B's announcement (route was annotated ENFORCED)
 *   GET /announcements/:id          -> Mall B's announcement, HTTP 200
 *
 * The same run showed the boundary DID hold when a mallId was supplied
 * (`?mallId=<mall B>` returned 403 from MallAccessGuard). Omission was the hole —
 * MALL-03, "no mall context" silently meaning "every mall". That is why these
 * tests assert on the omitted-parameter path specifically.
 */
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SCOPE_KEY } from '../../common/decorators/scope.decorator';
import { EnforcementStatus } from '../../common/constants/scope.types';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

const MALL_A = 'mall-a';
const MALL_B = 'mall-b';
const director = { id: 'director-1', role: Role.MALL_DIRECTOR };

function buildController(accessible: string[] | null) {
  const service: any = {
    findAll: jest.fn(),
    findAllAdmin: jest.fn(),
    findOneForUser: jest.fn(),
  };
  const mallAccess: any = {
    getAccessibleMallIds: jest.fn().mockResolvedValue(accessible),
    assertMallAccess: jest.fn(),
    extractAndValidateMallAccess: jest.fn(),
  };
  return { controller: new AnnouncementsController(service, mallAccess), service, mallAccess };
}

describe('AnnouncementsController — the staff read paths derive a Mall scope', () => {
  it.each([
    ['findAllAdmin', (c: AnnouncementsController) => c.findAllAdmin({}, director), 'findAllAdmin'],
    ['findAll', (c: AnnouncementsController) => c.findAll({}, director), 'findAll'],
    ['findOne', (c: AnnouncementsController) => c.findOne('ann-1', director), 'findOneForUser'],
  ])('%s passes the caller Mall set to the service', async (_n, call, method) => {
    const { controller, service, mallAccess } = buildController([MALL_A]);

    await call(controller);

    expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith(director.id, director.role);
    expect(service[method].mock.calls[0]).toContainEqual([MALL_A]);
  });

  it('findAllAdmin receives the user it previously never took at all', async () => {
    const { controller, service } = buildController([MALL_A]);

    await controller.findAllAdmin({ limit: 100 }, director);

    // The old signature was findAllAdmin(query) — no second argument existed,
    // so no scope could be applied however carefully the service was written.
    expect(service.findAllAdmin).toHaveBeenCalledWith({ limit: 100 }, [MALL_A]);
  });

  it('an empty scope is still passed, not dropped', async () => {
    const { controller, service } = buildController([]);

    await controller.findAllAdmin({}, director);

    expect(service.findAllAdmin.mock.calls[0][1]).toEqual([]);
  });
});

describe('AnnouncementsService — the scope reaches the query', () => {
  function buildService(announcement?: any) {
    const prisma: any = {
      mallAnnouncement: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(announcement ?? null),
      },
      unit: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    return { service: new AnnouncementsService(prisma as any), prisma };
  }

  it('findAllAdmin with no mallId filters to the caller malls', async () => {
    const { service, prisma } = buildService();

    await service.findAllAdmin({}, [MALL_A]);

    expect(prisma.mallAnnouncement.findMany.mock.calls[0][0].where.mallId).toEqual({ in: [MALL_A] });
    expect(prisma.mallAnnouncement.count.mock.calls[0][0].where.mallId).toEqual({ in: [MALL_A] });
  });

  it('findAllAdmin with an empty scope returns nothing rather than everything', async () => {
    const { service, prisma } = buildService();

    await service.findAllAdmin({}, []);

    expect(prisma.mallAnnouncement.findMany.mock.calls[0][0].where.mallId).toEqual({ in: [] });
  });

  it('findAll for a staff role with no mallId filters to the caller malls', async () => {
    const { service, prisma } = buildService();

    await service.findAll({}, { role: 'MALL_DIRECTOR' }, [MALL_A]);

    expect(prisma.mallAnnouncement.findMany.mock.calls[0][0].where.mallId).toEqual({ in: [MALL_A] });
  });

  // A supplied mallId has already been checked by MallAccessGuard, so it narrows.
  it('a supplied mallId narrows rather than widening', async () => {
    const { service, prisma } = buildService();

    await service.findAll({ mallId: MALL_A }, { role: 'MALL_DIRECTOR' }, [MALL_A]);

    expect(prisma.mallAnnouncement.findMany.mock.calls[0][0].where.mallId).toBe(MALL_A);
  });

  it('a bypass role (null scope) keeps its unrestricted read', async () => {
    const { service, prisma } = buildService();

    await service.findAllAdmin({}, null);

    expect(prisma.mallAnnouncement.findMany.mock.calls[0][0].where.mallId).toBeUndefined();
  });

  // Object-by-id: the list filter never protected this route.
  it('findOneForUser refuses an announcement outside the caller malls', async () => {
    const { service } = buildService({ id: 'ann-b', mallId: MALL_B });

    await expect(
      service.findOneForUser('ann-b', { role: 'MALL_DIRECTOR' }, [MALL_A]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findOneForUser still returns an announcement inside the caller malls', async () => {
    const { service } = buildService({ id: 'ann-a', mallId: MALL_A });

    await expect(
      service.findOneForUser('ann-a', { role: 'MALL_DIRECTOR' }, [MALL_A]),
    ).resolves.toMatchObject({ id: 'ann-a' });
  });

  it('findOneForUser leaves the TENANT rule alone', async () => {
    const { service, prisma } = buildService({ id: 'ann-a', mallId: MALL_A });
    prisma.unit.count.mockResolvedValue(0);

    // TENANT bypasses UserMallAccess by design; its boundary is unit tenancy.
    await expect(
      service.findOneForUser('ann-a', { role: 'TENANT', tenantId: 't-1' }, null),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AnnouncementsController — the scope declaration matches reality', () => {
  it('the admin list route no longer declares itself a GAP', () => {
    const scope = Reflect.getMetadata(SCOPE_KEY, AnnouncementsController.prototype.findAllAdmin);
    expect(scope.status).toBe(EnforcementStatus.ENFORCED);
  });
});
