/**
 * CR-NOTIFICATION-RECIPIENT-ROUTING -- real PostgreSQL proof.
 *
 * Real services, real constraints/triggers, real concurrency. SMTP is disabled
 * (EmailService stub), which is what the CR asks for: no external mail, but the
 * durable intent and the routing decision are both asserted.
 *
 *   createdb leasing_notif_test
 *   DATABASE_URL=...leasing_notif_test npx prisma migrate deploy
 *   NOTIF_TEST_DATABASE_URL=...leasing_notif_test npx jest -c test/jest-e2e.json notification-routing
 */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { NotificationRecipientType, NotificationRoutingMode, PrismaClient, Role, UnitStatus } from '@prisma/client';
import { PermissionsService } from '../src/common/services/permissions.service';
import { MallAccessService } from '../src/common/services/mall-access.service';
import { NotificationRecipientEligibilityService } from '../src/modules/notifications/routing/notification-recipient-eligibility.service';
import { NotificationRoutingService } from '../src/modules/notifications/routing/notification-routing.service';
import { NotificationRoutingConfigService } from '../src/modules/notifications/routing/notification-routing-config.service';
import { NOTIFICATION_EVENTS } from '../src/modules/notifications/routing/notification-event-registry';

const DB_URL = process.env.NOTIF_TEST_DATABASE_URL;
if (!DB_URL) {
  // eslint-disable-next-line no-console
  console.error('\n[CR-NOTIFICATION-RECIPIENT-ROUTING] NOTIF_TEST_DATABASE_URL is not set -- the real-Postgres suite did NOT run.\n');
}
const maybeDescribe = DB_URL ? describe : describe.skip;

maybeDescribe('CR-NOTIFICATION-RECIPIENT-ROUTING -- real PostgreSQL', () => {
  let prisma: PrismaClient;
  let routing: NotificationRoutingService;
  let config: NotificationRoutingConfigService;
  let permissions: PermissionsService;
  const sendMail = jest.fn(async () => ({ skipped: true }));

  const ids = {
    mallA: 'nr-mall-a', mallB: 'nr-mall-b',
    unitA: 'nr-unit-a', unitB: 'nr-unit-b',
    contractA: 'nr-contract-a', tenantA: 'nr-tenant-a',
    admin: 'nr-admin', dirA: 'nr-dir-a', dirB: 'nr-dir-b',
    lmA: 'nr-lm-a', lmA2: 'nr-lm-a2', opA: 'nr-op-a', finA: 'nr-fin-a', legalA: 'nr-legal-a', lmB: 'nr-lm-b',
  };
  const actor = (id: string, role: Role) => ({ id, role, email: `${id}@nr.test` });
  const ADMIN = () => actor(ids.admin, Role.ADMIN);
  const DIR_A = () => actor(ids.dirA, Role.MALL_DIRECTOR);
  const DIR_B = () => actor(ids.dirB, Role.MALL_DIRECTOR);
  const LM_A = () => actor(ids.lmA, Role.LEASING_MANAGER);

  const DIGEST = 'HANDOVER_READINESS_WEEKLY_DIGEST';
  const INTERNAL_EXPIRY = 'CONTRACT_EXPIRY_INTERNAL';
  const INVOICE = 'INVOICE_ISSUED';
  const APPROVAL = 'PROPOSAL_APPROVAL_REQUIRED';

  const recipients = (...list: Array<[string, NotificationRecipientType]>) =>
    list.map(([userId, recipientType]) => ({ userId, recipientType }));

  async function purge() {
    // Delete the parent config: recipients cascade with it, so the deferred
    // "REPLACE keeps a recipient" constraint never sees an empty live config.
    await prisma.notificationEventRoutingConfig.deleteMany({ where: { mallId: { in: [ids.mallA, ids.mallB, 'GLOBAL'] } } });
    await prisma.auditLog.deleteMany({ where: { entityType: 'NotificationEventRoutingConfig' } });
    await prisma.contract.deleteMany({ where: { id: ids.contractA } });
    await prisma.tenant.deleteMany({ where: { id: ids.tenantA } });
    await prisma.unit.deleteMany({ where: { mallId: { in: [ids.mallA, ids.mallB] } } });
    await prisma.modulePermission.deleteMany({ where: { mallId: { in: [ids.mallA, ids.mallB] } } });
    await prisma.userMallAccess.deleteMany({ where: { mallId: { in: [ids.mallA, ids.mallB] } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids).filter((v) => v.startsWith('nr-') && !v.includes('mall') && !v.includes('unit') && !v.includes('contract') && !v.includes('tenant')) } } });
    await prisma.mall.deleteMany({ where: { id: { in: [ids.mallA, ids.mallB] } } });
  }

  async function seed() {
    await prisma.mall.create({ data: { id: ids.mallA, name: 'NR Mall A', code: 'NRA' } });
    await prisma.mall.create({ data: { id: ids.mallB, name: 'NR Mall B', code: 'NRB' } });
    const users: Array<[string, Role, string[]]> = [
      [ids.admin, Role.ADMIN, []],
      [ids.dirA, Role.MALL_DIRECTOR, [ids.mallA]],
      [ids.dirB, Role.MALL_DIRECTOR, [ids.mallB]],
      [ids.lmA, Role.LEASING_MANAGER, [ids.mallA]],
      [ids.lmA2, Role.LEASING_MANAGER, [ids.mallA]],
      [ids.opA, Role.OPERATION, [ids.mallA]],
      [ids.finA, Role.FINANCE, [ids.mallA]],
      [ids.legalA, Role.LEGAL, [ids.mallA]],
      [ids.lmB, Role.LEASING_MANAGER, [ids.mallB]],
    ];
    for (const [id, role, malls] of users) {
      await prisma.user.create({ data: { id, role, fullName: id, email: `${id}@nr.test`, password: 'x' } });
      for (const mallId of malls) await prisma.userMallAccess.create({ data: { userId: id, mallId, role } });
    }
    await prisma.unit.create({ data: { id: ids.unitA, mallId: ids.mallA, code: 'NR-A-1', areaGFA: 10, areaNLA: 10, status: UnitStatus.VACANT } });
    await prisma.unit.create({ data: { id: ids.unitB, mallId: ids.mallB, code: 'NR-B-1', areaGFA: 10, areaNLA: 10, status: UnitStatus.VACANT } });
    await prisma.tenant.create({ data: { id: ids.tenantA, brandName: 'NR Tenant', companyName: 'NR Co', contactName: 'X', contactEmail: 'tenant@customer.test' } });
    await prisma.contract.create({
      data: {
        id: ids.contractA, contractNumber: 'NR-CTR-1', tenantId: ids.tenantA, unitId: ids.unitA,
        startDate: new Date(), endDate: new Date(Date.now() + 86400000), term: 12, rent: 1, cam: 1, deposit: 1,
      },
    });
    await permissions.seedDefaultsForMall(ids.mallA);
    await permissions.seedDefaultsForMall(ids.mallB);
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();
    permissions = new PermissionsService(prisma as any);
    const mallAccess = new MallAccessService(prisma as any);
    const eligibility = new NotificationRecipientEligibilityService(prisma as any, mallAccess, permissions);
    routing = new NotificationRoutingService(prisma as any, eligibility);
    config = new NotificationRoutingConfigService(prisma as any, mallAccess, permissions, eligibility, { sendMail } as any);
    await purge();
  });

  afterAll(async () => { await purge(); await prisma.$disconnect(); });
  beforeEach(async () => { jest.clearAllMocks(); await purge(); await seed(); });

  const digestDefaults = () => [
    { email: `${ids.dirA}@nr.test`, userId: ids.dirA, fullName: 'dir', keySuffix: ids.dirA },
    { email: `${ids.lmA}@nr.test`, userId: ids.lmA, fullName: 'lm', keySuffix: ids.lmA },
  ];
  const planDigest = () => routing.plan({ eventKey: DIGEST, mallId: ids.mallA, resourceId: ids.mallA, defaults: digestDefaults() });

  // ─── Defaults and Group A ──────────────────────────────────────────────────

  it('NOTIF-ROUTE-001 no configuration preserves the producer default, including its delivery keys', async () => {
    const plan = await planDigest();
    expect(plan.mode).toBe('DEFAULT');
    expect(plan.overridden).toBe(false);
    expect(plan.recipients.map((r) => r.email)).toEqual([`${ids.dirA}@nr.test`, `${ids.lmA}@nr.test`]);
    expect(plan.recipients.map((r) => r.keySuffix)).toEqual([ids.dirA, ids.lmA]);
  });

  it('NOTIF-ROUTE-002 Group A REPLACE sends only to the configured recipients', async () => {
    await config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.REPLACE, recipients: recipients([ids.lmA2, 'TO'], [ids.opA, 'TO']) });
    const plan = await planDigest();
    expect(plan.mode).toBe('REPLACE');
    expect(plan.recipients.map((r) => r.email).sort()).toEqual([`${ids.lmA2}@nr.test`, `${ids.opA}@nr.test`].sort());
    expect(plan.recipients.every((r) => r.keySuffix.startsWith('routed:to:'))).toBe(true);
  });

  it('NOTIF-ROUTE-003 Group A DEFAULT_PLUS_CC keeps defaults and adds copies', async () => {
    await config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.opA, 'CC']) });
    const plan = await planDigest();
    expect(plan.recipients.filter((r) => r.kind === 'TO').map((r) => r.email)).toEqual([`${ids.dirA}@nr.test`, `${ids.lmA}@nr.test`]);
    expect(plan.recipients.filter((r) => r.kind === 'CC').map((r) => r.email)).toEqual([`${ids.opA}@nr.test`]);
  });

  it('NOTIF-ROUTE-004 REPLACE cannot be saved empty, and the last recipient cannot be deleted underneath it', async () => {
    await expect(config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.REPLACE, recipients: [] }))
      .rejects.toBeInstanceOf(BadRequestException);
    await config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.REPLACE, recipients: recipients([ids.opA, 'TO']) });
    const saved = await prisma.notificationEventRoutingConfig.findFirstOrThrow({ where: { eventKey: DIGEST, mallId: ids.mallA } });
    await expect(prisma.notificationEventRecipient.deleteMany({ where: { routingConfigId: saved.id } })).rejects.toThrow(/at least one recipient/);
  });

  it('NOTIF-ROUTE-035 an override never re-sends mail that already went out under default keys', async () => {
    const before = await planDigest();
    await config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.opA, 'CC']) });
    const after = await planDigest();
    const toKeys = after.recipients.filter((r) => r.kind === 'TO').map((r) => r.keySuffix);
    expect(toKeys).toEqual(before.recipients.map((r) => r.keySuffix));
  });

  // ─── Group B ───────────────────────────────────────────────────────────────

  const invoiceDefaults = [{ email: 'tenant@customer.test', keySuffix: 'party' }];
  const planInvoice = (invoiceId?: string) => routing.plan({ eventKey: INVOICE, mallId: ids.mallA, resourceId: invoiceId ?? null, defaults: invoiceDefaults });

  it('NOTIF-ROUTE-005/006 Group B keeps the customer TO and adds internal copies', async () => {
    const invoice = await prisma.invoice.create({
      data: { invoiceNumber: 'NR-INV-1', contractId: ids.contractA, tenantId: ids.tenantA, mallId: ids.mallA, period: '2026-09', issuedAt: new Date(), dueDate: new Date(), subtotal: 1, vatAmount: 0, totalAmount: 1 },
    });
    await config.upsert(ADMIN(), INVOICE, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.finA, 'CC']) });
    const plan = await planInvoice(invoice.id);
    expect(plan.recipients.filter((r) => r.kind === 'TO').map((r) => r.email)).toEqual(['tenant@customer.test']);
    expect(plan.recipients.filter((r) => r.kind === 'CC').map((r) => r.email)).toEqual([`${ids.finA}@nr.test`]);
    await prisma.invoice.delete({ where: { id: invoice.id } });
  });

  it('NOTIF-ROUTE-007 Group B REPLACE is denied by the API and neutralised at runtime', async () => {
    await expect(config.upsert(ADMIN(), INVOICE, ids.mallA, { mode: NotificationRoutingMode.REPLACE, recipients: recipients([ids.finA, 'TO']) }))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(config.upsert(ADMIN(), INVOICE, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.finA, 'TO']) }))
      .rejects.toMatchObject({ response: { code: 'NOTIF_TO_NOT_ALLOWED' } });

    // A row planted directly in the database still cannot redirect the customer.
    const planted = await prisma.notificationEventRoutingConfig.create({
      data: {
        eventKey: INVOICE, mallId: ids.mallA, mode: NotificationRoutingMode.DEFAULT_PLUS_CC, createdById: ids.admin,
        recipients: { create: [{ userId: ids.finA, recipientType: 'TO', addedById: ids.admin }] },
      },
    });
    await prisma.$executeRawUnsafe(`UPDATE "NotificationEventRoutingConfig" SET "mode" = 'REPLACE' WHERE id = '${planted.id}'`);
    const plan = await planInvoice();
    expect(plan.recipients.filter((r) => r.kind === 'TO').map((r) => r.email)).toEqual(['tenant@customer.test']);
  });

  // ─── Group C ───────────────────────────────────────────────────────────────

  it('NOTIF-ROUTE-008/009 Group C cannot be configured and never reroutes the approver', async () => {
    await expect(config.upsert(ADMIN(), APPROVAL, ids.mallA, { mode: NotificationRoutingMode.REPLACE, recipients: recipients([ids.lmA2, 'TO']) }))
      .rejects.toMatchObject({ response: { code: 'NOTIF_EVENT_NOT_CONFIGURABLE' } });
    await expect(config.sendTest(ADMIN(), APPROVAL, ids.mallA)).rejects.toBeInstanceOf(ForbiddenException);

    const planted = await prisma.notificationEventRoutingConfig.create({
      data: {
        eventKey: APPROVAL, mallId: ids.mallA, mode: NotificationRoutingMode.DEFAULT, createdById: ids.admin,
        recipients: { create: [{ userId: ids.lmA2, recipientType: 'TO', addedById: ids.admin }] },
      },
    });
    await prisma.$executeRawUnsafe(`UPDATE "NotificationEventRoutingConfig" SET "mode" = 'REPLACE' WHERE id = '${planted.id}'`);
    const plan = await routing.plan({ eventKey: APPROVAL, mallId: ids.mallA, resourceId: null, defaults: [{ email: 'approver@nr.test', keySuffix: 'approver' }] });
    expect(plan.overridden).toBe(false);
    expect(plan.recipients.map((r) => r.email)).toEqual(['approver@nr.test']);
  });

  // ─── Eligibility filtering at send time ────────────────────────────────────

  it('NOTIF-ROUTE-010/011/012/034 ineligible configured recipients are filtered when the mail is actually built', async () => {
    await config.upsert(ADMIN(), DIGEST, ids.mallA, {
      mode: NotificationRoutingMode.DEFAULT_PLUS_CC,
      recipients: recipients([ids.opA, 'CC'], [ids.lmA2, 'CC']),
    });
    expect((await planDigest()).recipients.filter((r) => r.kind === 'CC')).toHaveLength(2);

    await prisma.user.update({ where: { id: ids.opA }, data: { isActive: false } });           // 010
    await prisma.userMallAccess.updateMany({ where: { userId: ids.lmA2, mallId: ids.mallA }, data: { isActive: false } }); // 011 / 034
    const after = await planDigest();
    expect(after.recipients.filter((r) => r.kind === 'CC')).toHaveLength(0);
    expect(after.diagnostics.map((d) => d.reasonCodes.sort()).flat()).toEqual(expect.arrayContaining(['USER_INACTIVE', 'NO_MALL_ACCESS']));
  });

  it('NOTIF-ROUTE-012 a role outside the event definition cannot be configured at all', async () => {
    await expect(config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.legalA, 'CC']) }))
      .rejects.toMatchObject({ response: { code: 'NOTIF_RECIPIENT_INELIGIBLE' } });
  });

  it('NOTIF-ROUTE-013 a resource in another Mall is not reachable, even for a configured recipient', async () => {
    await config.upsert(ADMIN(), INTERNAL_EXPIRY, ids.mallA, { mode: NotificationRoutingMode.REPLACE, recipients: recipients([ids.lmA2, 'TO']) });
    const ok = await routing.plan({ eventKey: INTERNAL_EXPIRY, mallId: ids.mallA, resourceId: ids.contractA, defaults: [] });
    expect(ok.recipients.map((r) => r.email)).toEqual([`${ids.lmA2}@nr.test`]);

    const foreign = await prisma.contract.create({
      data: { contractNumber: 'NR-CTR-B', tenantId: ids.tenantA, unitId: ids.unitB, startDate: new Date(), endDate: new Date(Date.now() + 8.64e7), term: 12, rent: 1, cam: 1, deposit: 1 },
    });
    const denied = await routing.plan({ eventKey: INTERNAL_EXPIRY, mallId: ids.mallA, resourceId: foreign.id, defaults: [] });
    expect(denied.failClosed).toBe(true);
    expect(denied.recipients).toEqual([]);
    await prisma.contract.delete({ where: { id: foreign.id } });
  });

  it('NOTIF-ROUTE-013b an unresolvable resource fails closed rather than sending unrestricted', async () => {
    await config.upsert(ADMIN(), INTERNAL_EXPIRY, ids.mallA, { mode: NotificationRoutingMode.REPLACE, recipients: recipients([ids.lmA2, 'TO']) });
    const plan = await routing.plan({ eventKey: INTERNAL_EXPIRY, mallId: ids.mallA, resourceId: 'does-not-exist', defaults: [] });
    expect(plan.failClosed).toBe(true);
  });

  // ─── Admin authority ───────────────────────────────────────────────────────

  it('NOTIF-ROUTE-014/015/019 a Mall Director governs only their own Mall', async () => {
    await expect(config.upsert(DIR_A(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.opA, 'CC']) })).resolves.toBeDefined();
    await expect(config.upsert(DIR_A(), DIGEST, ids.mallB, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.lmB, 'CC']) }))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(config.listEvents(DIR_A(), ids.mallB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(config.candidates(DIR_A(), DIGEST, ids.mallB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(config.reset(DIR_A(), DIGEST, ids.mallB)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await prisma.notificationEventRoutingConfig.count({ where: { mallId: ids.mallB } })).toBe(0);
  });

  it('NOTIF-ROUTE-016/017 GLOBAL scope and test-send stay with the platform administrator', async () => {
    await expect(config.listEvents(DIR_A(), 'GLOBAL')).rejects.toMatchObject({ response: { code: 'NOTIF_ROUTING_GLOBAL_FORBIDDEN' } });
    await expect(config.sendTest(DIR_A(), DIGEST, ids.mallA)).rejects.toMatchObject({ response: { code: 'NOTIF_ROUTING_TEST_FORBIDDEN' } });
    await expect(config.listEvents(ADMIN(), ids.mallA)).resolves.toMatchObject({ mallId: ids.mallA });
  });

  it('NOTIF-ROUTE-028 a user without the action permission cannot configure anything', async () => {
    await expect(config.upsert(LM_A(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.lmA, 'CC']) }))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(config.listEvents(LM_A(), ids.mallA)).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ─── Dedupe, concurrency, unknown events ───────────────────────────────────

  it('NOTIF-ROUTE-020/021 recipients are de-duplicated and never receive two copies', async () => {
    await config.upsert(ADMIN(), DIGEST, ids.mallA, {
      mode: NotificationRoutingMode.DEFAULT_PLUS_CC,
      recipients: recipients([ids.opA, 'CC'], [ids.opA, 'CC'], [ids.dirA, 'CC']),
    });
    const plan = await planDigest();
    const emails = plan.recipients.map((r) => r.email);
    expect(new Set(emails).size).toBe(emails.length);
    // dirA is already a default TO recipient -- not added again as a CC copy.
    expect(plan.recipients.filter((r) => r.email === `${ids.dirA}@nr.test`)).toHaveLength(1);
  });

  it('NOTIF-ROUTE-022/023 concurrent edits conflict instead of silently overwriting', async () => {
    const saved = await config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.opA, 'CC']) });
    const version = saved.version!;
    await expect(config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.lmA2, 'CC']), expectedVersion: version - 1 }))
      .rejects.toBeInstanceOf(ConflictException);

    const results = await Promise.allSettled([
      config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.lmA2, 'CC']), expectedVersion: version }),
      config.upsert(DIR_A(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.opA, 'CC']), expectedVersion: version }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason as any).response.code).toBe('NOTIF_ROUTING_STALE');
  });

  it('NOTIF-ROUTE-033 an unknown event key is rejected for configuration and ignored at runtime', async () => {
    await expect(config.upsert(ADMIN(), 'NOT_A_REAL_EVENT', ids.mallA, { mode: NotificationRoutingMode.REPLACE, recipients: recipients([ids.opA, 'TO']) }))
      .rejects.toMatchObject({ response: { code: 'NOTIF_EVENT_UNKNOWN' } });
    const plan = await routing.plan({ eventKey: 'NOT_A_REAL_EVENT', mallId: ids.mallA, resourceId: null, defaults: [{ email: 'x@nr.test', keySuffix: 'x' }] });
    expect(plan.recipients.map((r) => r.email)).toEqual(['x@nr.test']);
  });

  // ─── Queue interaction ─────────────────────────────────────────────────────

  it('NOTIF-ROUTE-026/027 a queued delivery keeps its own recipient; only new events use the new configuration', async () => {
    const delivery = await prisma.emailDelivery.create({
      data: {
        eventKey: `nr-test:${Date.now()}`, eventType: 'HANDOVER_READINESS_WEEKLY_DIGEST', entityType: 'Mall', entityId: ids.mallA, mallId: ids.mallA,
        recipient: { to: `${ids.dirA}@nr.test`, cc: null }, payload: { subject: 's', html: '<p/>' },
      },
    });
    await config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.REPLACE, recipients: recipients([ids.opA, 'TO']) });

    const stored = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect((stored.recipient as any).to).toBe(`${ids.dirA}@nr.test`); // queued intent untouched
    const fresh = await planDigest();
    expect(fresh.recipients.map((r) => r.email)).toEqual([`${ids.opA}@nr.test`]); // new event uses new config
    await prisma.emailDelivery.delete({ where: { id: delivery.id } });
  });

  // ─── Audit and test send ───────────────────────────────────────────────────

  it('NOTIF-ROUTE-031 every configuration change is audited with before/after', async () => {
    await config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.REPLACE, recipients: recipients([ids.opA, 'TO']) });
    await config.upsert(ADMIN(), DIGEST, ids.mallA, { mode: NotificationRoutingMode.REPLACE, recipients: recipients([ids.lmA2, 'TO']), expectedVersion: 0 });
    await config.reset(ADMIN(), DIGEST, ids.mallA);
    const logs = await prisma.auditLog.findMany({ where: { entityType: 'NotificationEventRoutingConfig' }, orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['NOTIFICATION_ROUTING_UPDATE', 'NOTIFICATION_ROUTING_UPDATE', 'NOTIFICATION_ROUTING_RESET']);
    const second = JSON.parse(logs[1].newValue!);
    expect(second.added).toEqual([`TO:${ids.lmA2}`]);
    expect(second.removed).toEqual([`TO:${ids.opA}`]);
    expect(logs.every((l) => l.userId === ids.admin)).toBe(true);
    expect(await prisma.notificationEventRoutingConfig.count({ where: { eventKey: DIGEST, mallId: ids.mallA } })).toBe(0);
  });

  it('NOTIF-ROUTE-029/030/032 test send reaches only internal recipients, changes no business state and is audited', async () => {
    const invoicesBefore = await prisma.invoice.count();
    await config.upsert(ADMIN(), INVOICE, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.finA, 'CC']) });
    const result = await config.sendTest(ADMIN(), INVOICE, ids.mallA);

    expect(result.sentTo.map((r) => r.email)).toEqual([`${ids.finA}@nr.test`]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const sent = (sendMail.mock.calls as any[])[0][0] as any;
    expect(sent.to).toBe(`${ids.finA}@nr.test`);
    expect(sent.to).not.toContain('customer');           // never the tenant address
    expect(sent.subject).toContain('[TEST]');
    expect(sent.delivery).toBeUndefined();                 // not a business delivery intent
    expect(await prisma.invoice.count()).toBe(invoicesBefore);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'NOTIFICATION_ROUTING_TEST_SEND' } });
    expect(audit).toBeTruthy();
  });

  // ─── NOTIF-FIN: financial data may never be mailed to someone who could not open it ──

  describe('NOTIF-FIN invoice recipient eligibility', () => {
    const makeInvoice = (over: Record<string, unknown> = {}) => prisma.invoice.create({
      data: {
        invoiceNumber: `NR-INV-${Math.random().toString(36).slice(2, 8)}`,
        tenantId: ids.tenantA, mallId: ids.mallA, period: '2026-09',
        issuedAt: new Date(), dueDate: new Date(), subtotal: 1, vatAmount: 0, totalAmount: 1,
        ...over,
      },
    });
    const planFor = (invoiceId: string) => routing.plan({
      eventKey: INVOICE,
      mallId: ids.mallA,
      resourceId: invoiceId,
      defaults: [{ email: 'tenant@customer.test', keySuffix: 'party' }],
    });
    const configureCc = (userId: string) =>
      config.upsert(ADMIN(), INVOICE, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([userId, 'CC']) });

    it('NOTIF-FIN-001 a contract-linked invoice copies an authorised finance user', async () => {
      const invoice = await makeInvoice({ contractId: ids.contractA });
      await configureCc(ids.finA);
      const plan = await planFor(invoice.id);
      expect(plan.recipients.filter((r) => r.kind === 'CC').map((r) => r.email)).toEqual([`${ids.finA}@nr.test`]);
      await prisma.invoice.delete({ where: { id: invoice.id } });
    });

    it('NOTIF-FIN-002 losing the billing module in this Mall removes the copy, same Mall or not', async () => {
      const invoice = await makeInvoice({ contractId: ids.contractA });
      await configureCc(ids.finA);
      // Exactly what /billing would deny: the Mall-scoped matrix drops FINANCE.
      await permissions.setAllowed('billing', Role.FINANCE, false, ids.admin, ids.mallA);
      const plan = await planFor(invoice.id);
      expect(plan.recipients.filter((r) => r.kind === 'CC')).toHaveLength(0);
      expect(plan.diagnostics[0].reasonCodes).toContain('NO_ACTION_PERMISSION');
      await permissions.setAllowed('billing', Role.FINANCE, true, ids.admin, ids.mallA);
      await prisma.invoice.delete({ where: { id: invoice.id } });
    });

    it('NOTIF-FIN-003/004 a contract-less invoice uses the same authority as the invoice API: Mall + billing permission', async () => {
      // No contract: ownership resolves through Invoice.mallId, exactly the
      // chain MallAccessService uses for GET /billing/invoices/:id.
      const invoice = await makeInvoice({ contractId: null });
      await configureCc(ids.finA);
      const ok = await planFor(invoice.id);
      expect(ok.recipients.filter((r) => r.kind === 'CC').map((r) => r.email)).toEqual([`${ids.finA}@nr.test`]);

      // Mall membership alone is NOT enough: a Mall-A user whose role cannot
      // reach billing is rejected at configuration time and at send time.
      await expect(configureCc(ids.legalA)).rejects.toMatchObject({ response: { code: 'NOTIF_RECIPIENT_INELIGIBLE' } });
      await prisma.invoice.delete({ where: { id: invoice.id } });
    });

    it('NOTIF-FIN-003b an invoice whose Mall cannot be resolved yields no internal copy at all', async () => {
      const invoice = await makeInvoice({ contractId: null, mallId: null });
      await configureCc(ids.finA);
      const plan = await planFor(invoice.id);
      expect(plan.recipients.filter((r) => r.kind === 'CC')).toHaveLength(0);
      expect(plan.diagnostics[0].reasonCodes).toContain('RESOURCE_UNRESOLVED');
      await prisma.invoice.delete({ where: { id: invoice.id } });
    });

    it('NOTIF-FIN-005/006 an ineligible internal copy never disturbs the customer delivery', async () => {
      const invoice = await makeInvoice({ contractId: null, mallId: null });
      await configureCc(ids.finA);
      const plan = await planFor(invoice.id);
      expect(plan.failClosed).toBe(false);
      const to = plan.recipients.filter((r) => r.kind === 'TO');
      expect(to.map((r) => r.email)).toEqual(['tenant@customer.test']);
      expect(to.map((r) => r.keySuffix)).toEqual(['party']);   // untouched identity
      await prisma.invoice.delete({ where: { id: invoice.id } });
    });

    it('NOTIF-FIN-007 enabling a copy later never re-sends the invoice already delivered to the customer', async () => {
      const invoice = await makeInvoice({ contractId: ids.contractA });
      const before = await planFor(invoice.id);
      const firstKey = `invoice-issued:${invoice.id}`;
      await prisma.emailDelivery.create({
        data: {
          eventKey: firstKey, eventType: 'INVOICE_ISSUED', entityType: 'Invoice', entityId: invoice.id, mallId: ids.mallA,
          recipient: { to: 'tenant@customer.test', cc: null }, payload: { subject: 's', html: '<p/>' }, status: 'SENT',
        },
      });
      await configureCc(ids.finA);
      const after = await planFor(invoice.id);
      expect(after.recipients.filter((r) => r.kind === 'TO').map((r) => r.keySuffix))
        .toEqual(before.recipients.map((r) => r.keySuffix));
      // The customer copy keeps the very key that is already in the ledger, so
      // the producer's upsert is a no-op rather than a second send.
      const existing = await prisma.emailDelivery.findUnique({ where: { eventKey: firstKey } });
      expect(existing?.status).toBe('SENT');
      await prisma.emailDelivery.deleteMany({ where: { entityId: invoice.id } });
      await prisma.invoice.delete({ where: { id: invoice.id } });
    });

    it('NOTIF-FIN-008 email eligibility and real invoice access agree for the same user/invoice pair', async () => {
      const invoice = await makeInvoice({ contractId: ids.contractA });
      await configureCc(ids.finA);
      const mallAccess = new MallAccessService(prisma as any);

      // Allowed: the API resolves the invoice Mall and the matrix grants billing.
      await expect(mallAccess.extractAndValidateMallAccess(ids.finA, Role.FINANCE, { invoiceId: invoice.id })).resolves.toBeUndefined();
      expect((await planFor(invoice.id)).recipients.some((r) => r.email === `${ids.finA}@nr.test`)).toBe(true);

      // Denied: a Mall-B user cannot open the invoice, and cannot be mailed it.
      await expect(mallAccess.extractAndValidateMallAccess(ids.lmB, Role.LEASING_MANAGER, { invoiceId: invoice.id })).rejects.toBeTruthy();
      await expect(config.upsert(ADMIN(), INVOICE, ids.mallA, { mode: NotificationRoutingMode.DEFAULT_PLUS_CC, recipients: recipients([ids.lmB, 'CC']) }))
        .rejects.toMatchObject({ response: { code: 'NOTIF_RECIPIENT_INELIGIBLE' } });
      await prisma.invoice.delete({ where: { id: invoice.id } });
    });
  });

  // ─── Registry integrity ────────────────────────────────────────────────────

  it('every registry event has a unique key, a human default rule and legal modes', () => {
    const keys = NOTIFICATION_EVENTS.map((e) => e.eventKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const event of NOTIFICATION_EVENTS) {
      expect(event.defaultRecipientRuleVi.length).toBeGreaterThan(5);
      expect(event.defaultRecipientRuleVi.toLowerCase()).not.toContain('system default');
      if (event.category === 'WORKFLOW_APPROVER') expect(event.eligibleRoles).toEqual([]);
      else expect(event.eligibleRoles.length).toBeGreaterThan(0);
    }
  });
});
