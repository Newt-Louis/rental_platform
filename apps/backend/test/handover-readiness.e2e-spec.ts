/**
 * CR-UNIT-HANDOVER-READINESS -- integration suite against a REAL PostgreSQL.
 *
 * Real services, real Prisma, real row locks / unique constraints / triggers.
 * Only SMTP (EmailService.sendMail) and Redis are absent: email is asserted at
 * the durable EmailDelivery-intent level, which is what the business relies on.
 *
 * Requires a database created from the full migration chain:
 *   createdb leasing_handover_test
 *   DATABASE_URL=...leasing_handover_test npx prisma migrate deploy
 *   HANDOVER_TEST_DATABASE_URL=...leasing_handover_test npx jest -c test/jest-e2e.json handover-readiness
 *
 * Uses its own env var (not CR_TEST_DATABASE_URL): the booking suite wipes every
 * Mall/User in its database, which must never run against these fixtures.
 * Skips itself loudly when the URL is absent.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HandoverReadinessLifecycle, PrismaClient, Role, UnitStatus } from '@prisma/client';
import { PermissionsService } from '../src/common/services/permissions.service';
import { MallAccessService } from '../src/common/services/mall-access.service';
import { EmailDeliveryService } from '../src/modules/notifications/email-delivery.service';
import { StorageService } from '../src/storage/storage.service';
import { HandoverReadinessAccessService } from '../src/modules/handover-readiness/handover-readiness-access.service';
import { HandoverReadinessCommitmentsService } from '../src/modules/handover-readiness/handover-readiness-commitments.service';
import { HandoverReadinessNotifierService } from '../src/modules/handover-readiness/handover-readiness-notifier.service';
import { HandoverReadinessService } from '../src/modules/handover-readiness/handover-readiness.service';
import { HandoverReadinessScheduler } from '../src/modules/handover-readiness/handover-readiness.scheduler';
import { businessToday, formatBusinessDate } from '../src/modules/handover-readiness/handover-readiness.policy';

const DB_URL = process.env.HANDOVER_TEST_DATABASE_URL;
if (!DB_URL) {
  // eslint-disable-next-line no-console
  console.error('\n[CR-UNIT-HANDOVER-READINESS] HANDOVER_TEST_DATABASE_URL is not set -- the real-Postgres suite did NOT run.\n');
}
const maybeDescribe = DB_URL ? describe : describe.skip;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const png = (name = 'photo.png'): Express.Multer.File => ({
  fieldname: 'file', originalname: name, encoding: '7bit', mimetype: 'image/png', size: PNG.length, buffer: PNG,
} as any);

const DAY = 86_400_000;
const dateIn = (days: number, from: Date = businessToday()) => formatBusinessDate(new Date(from.getTime() + days * DAY))!;

maybeDescribe('CR-UNIT-HANDOVER-READINESS -- real PostgreSQL', () => {
  let prisma: PrismaClient;
  let service: HandoverReadinessService;
  let scheduler: HandoverReadinessScheduler;
  let permissions: PermissionsService;
  let uploadDir: string;

  const ids = {
    mallA: 'hr-mall-a', mallB: 'hr-mall-b',
    unitA: 'hr-unit-a', unitA2: 'hr-unit-a2', unitA3: 'hr-unit-a3', unitB: 'hr-unit-b',
    managerA: 'hr-user-lm-a', managerA2: 'hr-user-lm-a2', directorA: 'hr-user-md-a', execA: 'hr-user-le-a',
    opA: 'hr-user-op-a', opA2: 'hr-user-op-a2', projectA: 'hr-user-proj-a', financeA: 'hr-user-fin-a',
    managerB: 'hr-user-lm-b', directorB: 'hr-user-md-b', opB: 'hr-user-op-b',
    admin: 'hr-user-admin', tenant: 'hr-user-tenant',
  };
  const actor = (id: string, role: Role) => ({ id, role });
  const LM_A = () => actor(ids.managerA, Role.LEASING_MANAGER);
  const LM_A2 = () => actor(ids.managerA2, Role.LEASING_MANAGER);
  const MD_A = () => actor(ids.directorA, Role.MALL_DIRECTOR);
  const OP_A = () => actor(ids.opA, Role.OPERATION);
  const OP_A2 = () => actor(ids.opA2, Role.OPERATION);
  const LM_B = () => actor(ids.managerB, Role.LEASING_MANAGER);
  const OP_B = () => actor(ids.opB, Role.OPERATION);
  const ADMIN = () => actor(ids.admin, Role.ADMIN);

  const fixtureMalls = () => [ids.mallA, ids.mallB];

  async function purge() {
    const malls = fixtureMalls();
    const readiness = await prisma.unitHandoverReadiness.findMany({ where: { mallId: { in: malls } }, select: { id: true } });
    const rIds = readiness.map((r) => r.id);
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL handover_readiness.allow_purge = 'on'`),
      prisma.unitHandoverEvidence.deleteMany({ where: { readinessId: { in: rIds } } }),
      prisma.unitHandoverReadinessEvent.deleteMany({ where: { readinessId: { in: rIds } } }),
      prisma.unitHandoverFollower.deleteMany({ where: { readinessId: { in: rIds } } }),
      prisma.unitHandoverRisk.deleteMany({ where: { readinessId: { in: rIds } } }),
      prisma.unitHandoverReadiness.deleteMany({ where: { id: { in: rIds } } }),
    ]);
    await prisma.emailDelivery.deleteMany({ where: { OR: [{ entityId: { in: rIds } }, { mallId: { in: malls } }] } });
    await prisma.notification.deleteMany({ where: { entityId: { in: rIds } } });
    await prisma.auditLog.deleteMany({ where: { entityType: 'UnitHandoverReadiness', entityId: { in: rIds } } });
    await prisma.proposal.deleteMany({ where: { unitId: { in: [ids.unitA, ids.unitA2, ids.unitA3, ids.unitB] } } });
    await prisma.unit.deleteMany({ where: { mallId: { in: malls } } });
    await prisma.floor.deleteMany({ where: { mallId: { in: malls } } });
    await prisma.modulePermission.deleteMany({ where: { mallId: { in: malls } } });
    await prisma.userMallAccess.deleteMany({ where: { mallId: { in: malls } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids).filter((v) => v.startsWith('hr-user')) } } });
    await prisma.mall.deleteMany({ where: { id: { in: malls } } });
  }

  async function seed() {
    await prisma.mall.create({ data: { id: ids.mallA, name: 'HR Mall A', code: 'HRMA' } });
    await prisma.mall.create({ data: { id: ids.mallB, name: 'HR Mall B', code: 'HRMB' } });
    const users: Array<[string, Role, string[]]> = [
      [ids.managerA, Role.LEASING_MANAGER, [ids.mallA]],
      [ids.managerA2, Role.LEASING_MANAGER, [ids.mallA]],
      [ids.directorA, Role.MALL_DIRECTOR, [ids.mallA]],
      [ids.execA, Role.LEASING_EXECUTIVE, [ids.mallA]],
      [ids.opA, Role.OPERATION, [ids.mallA]],
      [ids.opA2, Role.OPERATION, [ids.mallA]],
      [ids.projectA, Role.FITOUT_BASIC_TEAM, [ids.mallA]],
      [ids.financeA, Role.FINANCE, [ids.mallA]],
      [ids.managerB, Role.LEASING_MANAGER, [ids.mallB]],
      [ids.directorB, Role.MALL_DIRECTOR, [ids.mallB]],
      [ids.opB, Role.OPERATION, [ids.mallB]],
      [ids.admin, Role.ADMIN, []],
      [ids.tenant, Role.TENANT, []],
    ];
    for (const [id, role, malls] of users) {
      await prisma.user.create({ data: { id, role, fullName: id, email: `${id}@hr.test`, password: 'x' } });
      for (const mallId of malls) await prisma.userMallAccess.create({ data: { userId: id, mallId, role } });
    }
    for (const [id, mallId, code, status] of [
      [ids.unitA, ids.mallA, 'HR-A-101', UnitStatus.VACANT],
      [ids.unitA2, ids.mallA, 'HR-A-102', UnitStatus.NEGOTIATING],
      [ids.unitA3, ids.mallA, 'HR-A-103', UnitStatus.OFFERING],
      [ids.unitB, ids.mallB, 'HR-B-101', UnitStatus.VACANT],
    ] as const) {
      await prisma.unit.create({ data: { id, mallId, code, name: code, areaGFA: 100, areaNLA: 90, status } });
    }
    // Like production (PermissionsService.seedDefaultsForMall on Mall creation):
    // each Mall owns a full copy of the GLOBAL matrix, then may override it.
    await permissions.seedDefaultsForMall(ids.mallA);
    await permissions.seedDefaultsForMall(ids.mallB);
  }

  beforeAll(async () => {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-evidence-'));
    process.env.UPLOAD_DIR = uploadDir;
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();
    permissions = new PermissionsService(prisma as any);
    const mallAccess = new MallAccessService(prisma as any);
    const access = new HandoverReadinessAccessService(prisma as any, mallAccess, permissions);
    const commitments = new HandoverReadinessCommitmentsService(prisma as any);
    const emailDelivery = new EmailDeliveryService(prisma as any, { sendMail: jest.fn() } as any, {} as any);
    const notifier = new HandoverReadinessNotifierService(prisma as any, emailDelivery, access);
    service = new HandoverReadinessService(prisma as any, access, commitments, notifier, new StorageService());
    scheduler = new HandoverReadinessScheduler(prisma as any, {} as any, service, notifier, emailDelivery);
    await purge();
  });

  afterAll(async () => {
    await purge();
    await prisma.$disconnect();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await purge();
    await seed();
  });

  const unitStatus = async (unitId: string) => (await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).status;
  const events = (readinessId: string, eventType?: any) =>
    prisma.unitHandoverReadinessEvent.findMany({ where: { readinessId, ...(eventType ? { eventType } : {}) }, orderBy: { sequence: 'asc' } });
  const deliveries = (prefix: string) => prisma.emailDelivery.findMany({ where: { eventKey: { startsWith: prefix } } });

  async function startA(target = dateIn(60), who = LM_A(), unitId = ids.unitA) {
    return service.start(who, unitId, { targetReadyDate: target });
  }
  async function stage(readinessId: string, n = 3, who = OP_A2()) {
    for (let i = 0; i < n; i++) await service.uploadEvidence(who, readinessId, png(`p${i}.png`));
  }
  /** Let OPERATION also manage dates in Mall A (Mall-scoped matrix override) -- to exercise SoD. */
  async function grantMallA(module: string, roles: Role[]) {
    for (const role of roles) await permissions.setAllowed(module, role, true, ids.admin, ids.mallA);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  it('HANDOVER-001 start tracking: original = target, TRACKING_STARTED, no fake date-change, starter follows', async () => {
    const target = dateIn(45);
    const r = await startA(target);
    expect(r.lifecycleStatus).toBe('TRACKING');
    expect(r.targetReadyDate).toBe(target);
    expect(r.originalTargetDate).toBe(target);
    expect(r.recordedBy.id).toBe(ids.managerA);
    const ev = await events(r.id);
    expect(ev.map((e) => e.eventType)).toEqual(['TRACKING_STARTED']);
    expect(formatBusinessDate(ev[0].newDate)).toBe(target);
    expect(r.followers.map((f) => f.userId)).toEqual([ids.managerA]);
  });

  it('HANDOVER-002 only one active readiness per Unit; allowed again after cancel', async () => {
    const r = await startA();
    await expect(startA(dateIn(70), MD_A())).rejects.toBeInstanceOf(ConflictException);
    await service.cancel(LM_A(), r.id, 'Dự án tạm dừng bàn giao');
    const again = await startA(dateIn(80), MD_A());
    expect(again.id).not.toBe(r.id);
    expect(await prisma.unitHandoverReadiness.count({ where: { unitId: ids.unitA, activeUnitId: { not: null } } })).toBe(1);
  });

  it('HANDOVER-003 originalTargetDate is immutable (service + DB trigger)', async () => {
    const original = dateIn(40);
    const r = await startA(original);
    await service.changeTargetDate(LM_A(), r.id, { targetReadyDate: dateIn(55), reason: 'Chậm nghiệm thu PCCC' });
    const row = await prisma.unitHandoverReadiness.findUniqueOrThrow({ where: { id: r.id } });
    expect(formatBusinessDate(row.originalTargetDate)).toBe(original);
    await expect(prisma.unitHandoverReadiness.update({ where: { id: r.id }, data: { originalTargetDate: new Date() } }))
      .rejects.toThrow(/immutable/);
    await expect(prisma.unitHandoverReadiness.update({ where: { id: r.id }, data: { mallId: ids.mallB } }))
      .rejects.toThrow(/immutable/);
  });

  it('HANDOVER-004 date change requires a reason and a real calendar date', async () => {
    const r = await startA();
    await expect(service.changeTargetDate(LM_A(), r.id, { targetReadyDate: dateIn(90), reason: '   ' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.changeTargetDate(LM_A(), r.id, { targetReadyDate: '2026-02-30', reason: 'Lý do hợp lệ' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect((await events(r.id, 'TARGET_DATE_CHANGED')).length).toBe(0);
  });

  it('HANDOVER-005 date-change timeline preserves old/new/reason/actor for every change', async () => {
    const d0 = dateIn(40); const d1 = dateIn(50); const d2 = dateIn(47);
    const r = await startA(d0);
    await service.changeTargetDate(LM_A(), r.id, { targetReadyDate: d1, reason: 'Chậm thi công trần' });
    const after = await service.changeTargetDate(MD_A(), r.id, { targetReadyDate: d2, reason: 'Đẩy nhanh tiến độ' });
    const changes = await events(r.id, 'TARGET_DATE_CHANGED');
    expect(changes.map((e) => [formatBusinessDate(e.oldDate), formatBusinessDate(e.newDate), e.reason, e.actorId])).toEqual([
      [d0, d1, 'Chậm thi công trần', ids.managerA],
      [d1, d2, 'Đẩy nhanh tiến độ', ids.directorA],
    ]);
    expect(after.evaluation.dateChangeCount).toBe(2);
    expect(after.evaluation.slippage).toBe(true); // >= 2 changes
    expect(after.recordedBy.id).toBe(ids.directorA);
    expect(after.timeline.map((t) => t.eventType)).toEqual(['TRACKING_STARTED', 'TARGET_DATE_CHANGED', 'TARGET_DATE_CHANGED']);
  });

  it('HANDOVER-006 Unit.status unchanged by start / date change / risk / follow / evidence', async () => {
    const before = await unitStatus(ids.unitA2);
    const r = await startA(dateIn(30), LM_A(), ids.unitA2);
    await service.changeTargetDate(LM_A(), r.id, { targetReadyDate: dateIn(35), reason: 'Điều chỉnh tiến độ' });
    await service.addRisk(OP_A(), r.id, { title: 'Chưa đấu nối điện', severity: 'HIGH' });
    await service.follow(OP_A(), r.id);
    await stage(r.id, 1);
    expect(await unitStatus(ids.unitA2)).toBe(before);
  });

  // ─── Confirmation ──────────────────────────────────────────────────────────

  it('HANDOVER-007 confirm requires >= 3 valid images (and rejects non-images)', async () => {
    const r = await startA();
    await expect(service.uploadEvidence(OP_A2(), r.id, { ...png('fake.png'), buffer: Buffer.from('<html>') } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    await stage(r.id, 2);
    await expect(service.confirm(OP_A2(), r.id, { note: 'Đã kiểm tra hiện trạng' }))
      .rejects.toMatchObject({ response: { code: 'HANDOVER_EVIDENCE_REQUIRED' } });
    expect((await prisma.unitHandoverReadiness.findUniqueOrThrow({ where: { id: r.id } })).lifecycleStatus).toBe('TRACKING');
  });

  it('HANDOVER-008 confirm requires a note', async () => {
    const r = await startA();
    await stage(r.id);
    await expect(service.confirm(OP_A2(), r.id, { note: '  ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('HANDOVER-009 SoD: the last target-date setter cannot confirm (and neither can the Project owner)', async () => {
    await grantMallA('handover-readiness-manage', [Role.OPERATION, Role.LEASING_MANAGER, Role.MALL_DIRECTOR]);
    const r = await startA(dateIn(60), OP_A());
    await stage(r.id);
    await expect(service.confirm(OP_A(), r.id, { note: 'Tự xác nhận' }))
      .rejects.toMatchObject({ response: { code: 'HANDOVER_SOD_SETTER' } });
    // After someone else re-sets the date, OP_A is no longer the authoritative setter.
    await service.changeTargetDate(LM_A(), r.id, { targetReadyDate: dateIn(61), reason: 'Cập nhật theo biên bản' });
    const r2 = await service.start(LM_A(), ids.unitA3, { targetReadyDate: dateIn(60), projectOwnerId: ids.opA2 });
    await stage(r2.id, 3, OP_A());
    await expect(service.confirm(OP_A2(), r2.id, { note: 'Bên bàn giao tự nhận' }))
      .rejects.toMatchObject({ response: { code: 'HANDOVER_SOD_PROJECT_OWNER' } });
    const detail = await service.detail(OP_A(), r.id);
    expect(detail.sod.canSelfConfirm).toBe(true);
  });

  it('HANDOVER-010 authorized Operation confirms: state, event, evidence link, audit, email intent; ADMIN is not a confirmer', async () => {
    const r = await startA();
    await service.follow(LM_A(), r.id, ids.execA);
    await stage(r.id);
    await expect(service.confirm(ADMIN(), r.id, { note: 'Admin xác nhận' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.confirm(LM_A2(), r.id, { note: 'Leasing xác nhận' })).rejects.toBeInstanceOf(ForbiddenException);
    const done = await service.confirm(OP_A(), r.id, { note: 'Đủ điều kiện: điện nước, PCCC đạt' });
    expect(done.lifecycleStatus).toBe('CONFIRMED');
    expect(done.status).toBe('CONFIRMED');
    expect(done.confirmedBy.id).toBe(ids.opA);
    const [confirmed] = await events(r.id, 'CONFIRMED');
    const linked = await prisma.unitHandoverEvidence.findMany({ where: { readinessId: r.id, confirmationEventId: confirmed.id } });
    expect(linked).toHaveLength(3);
    expect(await prisma.auditLog.count({ where: { entityId: r.id, action: 'HANDOVER_READINESS_CONFIRM' } })).toBe(1);
    const mails = await deliveries(`handover:${r.id}:CONFIRMED:${confirmed.id}`);
    const to = mails.map((m) => (m.recipient as any).to).sort();
    expect(to).toEqual([`${ids.directorA}@hr.test`, `${ids.execA}@hr.test`, `${ids.managerA}@hr.test`, `${ids.managerA2}@hr.test`].sort());
    expect(to).not.toContain(`${ids.admin}@hr.test`); // no global ADMIN by default
    expect(to).not.toContain(`${ids.directorB}@hr.test`); // no cross-Mall leak
    const payload = mails[0].payload as any;
    expect(payload.html).toContain('Đủ điều kiện: điện nước, PCCC đạt');
    expect(payload.html).not.toContain('handover-readiness/'); // never a storage path
    // confirmed evidence is frozen
    await expect(prisma.unitHandoverEvidence.update({ where: { id: linked[0].id }, data: { caption: 'x' } })).rejects.toThrow(/immutable/);
    await expect(prisma.unitHandoverEvidence.delete({ where: { id: linked[0].id } })).rejects.toThrow(/cannot be deleted/);
    await expect(service.removeEvidence(OP_A(), r.id, linked[0].id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('HANDOVER-011 reopen needs explicit authority + reason; confirmation evidence and history retained', async () => {
    const r = await startA();
    await stage(r.id);
    await service.confirm(OP_A(), r.id, { note: 'Đạt yêu cầu bàn giao' });
    await expect(service.reopen(LM_A(), r.id, 'Leasing muốn mở lại')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.reopen(OP_A(), r.id, 'Vận hành muốn mở lại')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.reopen(MD_A(), r.id, '')).rejects.toBeInstanceOf(BadRequestException);
    const reopened = await service.reopen(MD_A(), r.id, 'Phát hiện thấm nước sau xác nhận');
    expect(reopened.lifecycleStatus).toBe('TRACKING');
    expect(reopened.confirmedAt).toBeNull();
    const [confirmed] = await events(r.id, 'CONFIRMED');
    expect(confirmed).toBeDefined();
    const [reopenEv] = await events(r.id, 'REOPENED');
    expect((reopenEv.metadata as any).reopenedConfirmationEventId).toBe(confirmed.id);
    expect(await prisma.unitHandoverEvidence.count({ where: { confirmationEventId: confirmed.id } })).toBe(3);
    expect(reopened.stagedEvidenceCount).toBe(0); // a new confirmation needs fresh photos
    // ADMIN reopens through its explicit static grant (not an implicit bypass).
    await stage(r.id);
    await service.confirm(OP_A(), r.id, { note: 'Xác nhận lần hai' });
    const byAdmin = await service.reopen(ADMIN(), r.id, 'Admin mở lại theo yêu cầu');
    expect(byAdmin.lifecycleStatus).toBe('TRACKING');
    expect(await events(r.id, 'CONFIRMED')).toHaveLength(2);
  });

  it('HANDOVER-012 risk lifecycle: add -> resolve (once) with ledger evidence', async () => {
    const r = await startA();
    const withRisk = await service.addRisk(OP_A(), r.id, { title: 'Trần thạch cao chưa hoàn thiện', severity: 'MEDIUM', ownerId: ids.managerA, dueDate: dateIn(10) });
    const risk = withRisk.risks[0];
    expect(risk.status).toBe('OPEN');
    await expect(service.resolveRisk(OP_A(), r.id, risk.id, 'x')).rejects.toBeInstanceOf(BadRequestException);
    const resolved = await service.resolveRisk(OP_A(), r.id, risk.id, 'Đã hoàn thiện trần, nghiệm thu OK');
    expect(resolved.risks[0].status).toBe('RESOLVED');
    await expect(service.resolveRisk(OP_A(), r.id, risk.id, 'Xử lý lần hai')).rejects.toBeInstanceOf(ConflictException);
    expect((await events(r.id)).map((e) => e.eventType)).toEqual(['TRACKING_STARTED', 'RISK_ADDED', 'RISK_RESOLVED']);
    await expect(service.addRisk(actor(ids.execA, Role.LEASING_EXECUTIVE), r.id, { title: 'Không có quyền', severity: 'LOW' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.addRisk(OP_A(), r.id, { title: 'Owner khác Mall', severity: 'LOW', ownerId: ids.managerB }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  // ─── Reminders ─────────────────────────────────────────────────────────────

  const milestoneCases: Array<[string, number, string]> = [
    ['HANDOVER-013', 30, 'D-30'], ['HANDOVER-014', 14, 'D-14'], ['HANDOVER-015', 7, 'D-7'],
    ['HANDOVER-016', 3, 'D-3'], ['HANDOVER-017', 1, 'D-1'], ['HANDOVER-018', 0, 'D0'],
  ];
  it.each(milestoneCases)('%s reminder at %i days -> %s (one event, one email per valid recipient)', async (_id, days, key) => {
    const today = businessToday();
    const target = dateIn(days, today);
    const r = await startA(target);
    const result = await scheduler.runReminders(new Date());
    expect(result.reminders).toBe(1);
    const sent = await events(r.id, 'REMINDER_SENT');
    expect(sent).toHaveLength(1);
    expect(sent[0].dedupeKey).toBe(`reminder:${r.id}:${key}:${target}`);
    const mails = await deliveries(`handover:${r.id}:${key}:${target}:`);
    expect(mails.length).toBe(3); // LM_A (follower + manager), LM_A2, MD_A
    expect(await unitStatus(ids.unitA)).toBe(UnitStatus.VACANT);
  });

  it('no reminder outside every milestone window (e.g. 45 days out)', async () => {
    const r = await startA(dateIn(45));
    await scheduler.runReminders(new Date());
    expect(await events(r.id, 'REMINDER_SENT')).toHaveLength(0);
  });

  it('HANDOVER-019 overdue reminders are bounded to one per week', async () => {
    const today = businessToday();
    const r = await startA(dateIn(-1, today));
    await scheduler.runReminders(new Date());
    await scheduler.runReminders(new Date(Date.now() + 3 * DAY));
    await scheduler.runReminders(new Date(Date.now() + 6 * DAY));
    expect((await events(r.id, 'REMINDER_SENT')).map((e) => e.dedupeKey)).toEqual([expect.stringContaining(':OVERDUE-W0:')]);
    await scheduler.runReminders(new Date(Date.now() + 7 * DAY));
    const keys = (await events(r.id, 'REMINDER_SENT')).map((e) => e.dedupeKey);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toContain(':OVERDUE-W1:');
  });

  it('HANDOVER-020 reminders are idempotent across retries', async () => {
    const r = await startA(dateIn(7));
    await scheduler.runReminders(new Date());
    await scheduler.runReminders(new Date());
    await scheduler.runReminders(new Date());
    expect(await events(r.id, 'REMINDER_SENT')).toHaveLength(1);
    expect((await deliveries(`handover:${r.id}:D-7:`)).length).toBe(3);
  });

  it('HANDOVER-021 a date change creates a new milestone identity', async () => {
    const first = dateIn(14);
    const r = await startA(first);
    await scheduler.runReminders(new Date());
    const second = dateIn(12);
    await service.changeTargetDate(LM_A(), r.id, { targetReadyDate: second, reason: 'Ban dự án cập nhật lịch' });
    await scheduler.runReminders(new Date());
    const keys = (await events(r.id, 'REMINDER_SENT')).map((e) => e.dedupeKey);
    expect(keys).toEqual([`reminder:${r.id}:D-14:${first}`, `reminder:${r.id}:D-14:${second}`]);
    // the date change itself notified immediately (actor excluded)
    const changeMails = await deliveries(`handover:${r.id}:DATE_CHANGED:`);
    expect(changeMails.map((m) => (m.recipient as any).to)).not.toContain(`${ids.managerA}@hr.test`);
    expect(changeMails.length).toBe(2);
  });

  it('HANDOVER-022 a HIGH risk notifies immediately; LOW/MEDIUM do not', async () => {
    const r = await startA();
    await service.addRisk(OP_A(), r.id, { title: 'Rủi ro thấp', severity: 'LOW' });
    expect(await deliveries(`handover:${r.id}:HIGH_RISK:`)).toHaveLength(0);
    const d = await service.addRisk(OP_A(), r.id, { title: 'Chưa có nghiệm thu PCCC', severity: 'HIGH' });
    expect((await deliveries(`handover:${r.id}:HIGH_RISK:`)).length).toBeGreaterThan(0);
    expect(d.status).toBe('AT_RISK');
    expect(d.evaluation.riskFlags).toContain('HIGH_RISK_OPEN');
  });

  // ─── Customer commitment conflict ───────────────────────────────────────────

  async function proposal(unitId: string, status: any, handoverDate: string | null, extra: Record<string, unknown> = {}) {
    return prisma.proposal.create({
      data: {
        proposalNumber: `HR-P-${Math.random().toString(36).slice(2, 10)}`,
        unitId, area: 90, term: 36, startDate: new Date(), rentPerSqm: 1, monthlyRent: 1, monthlyCAM: 1,
        depositAmount: 1, totalContractValue: 1, createdById: ids.managerA, status,
        handoverDate: handoverDate ? new Date(`${handoverDate}T00:00:00Z`) : null,
        ...extra,
      },
    });
  }

  it('HANDOVER-023 commitment conflict: only LIVE tenant commitments count; first appearance recorded once', async () => {
    const target = dateIn(60);
    const r = await startA(target);
    await proposal(ids.unitA, 'DRAFT', dateIn(20));
    await proposal(ids.unitA, 'REJECTED', dateIn(21));
    await proposal(ids.unitA, 'APPROVED', dateIn(22), { isActive: false, deletedAt: new Date() });
    expect((await service.detail(LM_A(), r.id)).evaluation.conflict).toBeNull();

    const live = await proposal(ids.unitA, 'SUBMITTED', dateIn(50));
    const d = await service.detail(LM_A(), r.id);
    expect(d.evaluation.conflict).toMatchObject({
      sourceType: 'PROPOSAL', sourceId: live.id, commitmentDate: dateIn(50), projectTargetDate: target, differenceDays: 10,
      message: 'Ngày cam kết bàn giao cho khách sớm hơn ngày Ban dự án dự kiến bàn giao mặt bằng.',
    });
    expect(d.status).toBe('AT_RISK');
    await scheduler.runReminders(new Date());
    await scheduler.runReminders(new Date());
    expect(await events(r.id, 'COMMITMENT_CONFLICT_DETECTED')).toHaveLength(1);
    expect((await deliveries(`handover:${r.id}:CONFLICT:`)).length).toBeGreaterThan(0);
  });

  it('HANDOVER-024 conflict is a warning only: proposals stay creatable/updatable', async () => {
    const r = await startA(dateIn(60));
    const p = await proposal(ids.unitA, 'SUBMITTED', dateIn(10));
    await expect(prisma.proposal.update({ where: { id: p.id }, data: { status: 'APPROVED' } })).resolves.toBeDefined();
    await expect(proposal(ids.unitA, 'SUBMITTED', dateIn(5))).resolves.toBeDefined();
    expect((await service.detail(LM_A(), r.id)).evaluation.conflict?.commitmentDate).toBe(dateIn(5));
    // Proposal module has no dependency on this lifecycle at all.
    const proposalsDir = path.join(__dirname, '..', 'src', 'modules', 'proposals');
    const offenders = fs.readdirSync(proposalsDir, { recursive: true } as any)
      .map(String).filter((f) => f.endsWith('.ts'))
      .filter((f) => /handover-readiness|HandoverReadiness/.test(fs.readFileSync(path.join(proposalsDir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  // ─── Mall isolation ────────────────────────────────────────────────────────

  it('HANDOVER-025 Mall A users cannot read Mall B (detail/timeline/unit/list/candidates)', async () => {
    const b = await service.start(LM_B(), ids.unitB, { targetReadyDate: dateIn(20) });
    await expect(service.detail(LM_A(), b.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.timeline(LM_A(), b.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getForUnit(LM_A(), ids.unitB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.candidates(LM_A(), ids.unitB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list(LM_A(), ids.mallB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.detail(actor(ids.tenant, Role.TENANT), b.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.detail(actor(ids.financeA, Role.FINANCE), (await startA()).id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('HANDOVER-026 Mall A users cannot mutate Mall B by direct id', async () => {
    const b = await service.start(LM_B(), ids.unitB, { targetReadyDate: dateIn(20) });
    const bRisk = (await service.addRisk(OP_B(), b.id, { title: 'Rủi ro Mall B', severity: 'LOW' })).risks[0];
    const attempts = [
      () => service.start(LM_A(), ids.unitB, { targetReadyDate: dateIn(30) }),
      () => service.changeTargetDate(LM_A(), b.id, { targetReadyDate: dateIn(30), reason: 'Tấn công chéo Mall' }),
      () => service.addRisk(OP_A(), b.id, { title: 'x-mall', severity: 'HIGH' }),
      () => service.resolveRisk(OP_A(), b.id, bRisk.id, 'Tấn công chéo Mall'),
      () => service.follow(LM_A(), b.id),
      () => service.unfollow(LM_A(), b.id, ids.managerB),
      () => service.uploadEvidence(OP_A(), b.id, png()),
      () => service.confirm(OP_A(), b.id, { note: 'Tấn công chéo Mall' }),
      () => service.reopen(MD_A(), b.id, 'Tấn công chéo Mall'),
      () => service.cancel(LM_A(), b.id, 'Tấn công chéo Mall'),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toBeInstanceOf(ForbiddenException);
    const row = await prisma.unitHandoverReadiness.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.lifecycleStatus).toBe('TRACKING');
    expect(row.version).toBe(1); // only B's own risk add
    expect(await prisma.unitHandoverEvidence.count({ where: { readinessId: b.id } })).toBe(0);
  });

  it('HANDOVER-027 cross-Mall evidence download is impossible (direct media id / mismatched parent)', async () => {
    const a = await startA();
    const b = await service.start(LM_B(), ids.unitB, { targetReadyDate: dateIn(20) });
    await service.uploadEvidence(OP_B(), b.id, png('b.png'));
    const bEvidence = await prisma.unitHandoverEvidence.findFirstOrThrow({ where: { readinessId: b.id } });
    await expect(service.evidenceFile(LM_A(), b.id, bEvidence.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.evidenceFile(LM_A(), a.id, bEvidence.id)).rejects.toBeInstanceOf(NotFoundException);
    const own = await service.evidenceFile(LM_B(), b.id, bEvidence.id);
    own.stream.destroy();
    expect(own.mimeType).toBe('image/png');
    expect(bEvidence.filePath.startsWith('handover-readiness/')).toBe(true); // private subpath, not the public unit-media mount
  });

  it('HANDOVER-028 cross-Mall / unauthorized follower is rejected', async () => {
    const a = await startA();
    await expect(service.follow(LM_A(), a.id, ids.managerB)).rejects.toMatchObject({ response: { code: 'HANDOVER_FOLLOWER_MALL_INVALID' } });
    await expect(service.follow(LM_A(), a.id, ids.financeA)).rejects.toMatchObject({ response: { code: 'HANDOVER_FOLLOWER_MALL_INVALID' } });
    await expect(service.follow(actor(ids.execA, Role.LEASING_EXECUTIVE), a.id, ids.opA)).rejects.toBeInstanceOf(ForbiddenException);
    const ok = await service.follow(LM_A(), a.id, ids.opA);
    expect(ok.followers.map((f) => f.userId)).toContain(ids.opA);
    // A follower who later loses Mall access silently stops receiving mail.
    await prisma.userMallAccess.updateMany({ where: { userId: ids.opA, mallId: ids.mallA }, data: { isActive: false } });
    await service.addRisk(OP_A2(), a.id, { title: 'Sau khi thu hồi quyền', severity: 'HIGH' });
    const to = (await deliveries(`handover:${a.id}:HIGH_RISK:`)).map((m) => (m.recipient as any).to);
    expect(to).not.toContain(`${ids.opA}@hr.test`);
  });

  // ─── Concurrency (real row locks / unique constraints) ─────────────────────

  it('HANDOVER-029 concurrent start -> exactly one active readiness', async () => {
    const results = await Promise.allSettled([LM_A(), LM_A2(), MD_A(), LM_A(), MD_A()]
      .map((who, i) => service.start(who, ids.unitA, { targetReadyDate: dateIn(40 + i) })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]) {
      expect(r.reason).toBeInstanceOf(ConflictException);
    }
    expect(await prisma.unitHandoverReadiness.count({ where: { unitId: ids.unitA } })).toBe(1);
  });

  it('concurrent target-date changes -> deterministic final date + complete, chained evidence', async () => {
    const r = await startA(dateIn(40));
    const results = await Promise.allSettled([
      service.changeTargetDate(LM_A(), r.id, { targetReadyDate: dateIn(50), reason: 'Thay đổi thứ nhất' }),
      service.changeTargetDate(MD_A(), r.id, { targetReadyDate: dateIn(55), reason: 'Thay đổi thứ hai' }),
      service.changeTargetDate(LM_A2(), r.id, { targetReadyDate: dateIn(60), reason: 'Thay đổi thứ ba' }),
    ]);
    expect(results.every((x) => x.status === 'fulfilled')).toBe(true);
    const changes = await events(r.id, 'TARGET_DATE_CHANGED');
    expect(changes).toHaveLength(3);
    for (let i = 1; i < changes.length; i++) {
      expect(formatBusinessDate(changes[i].oldDate)).toBe(formatBusinessDate(changes[i - 1].newDate));
    }
    const row = await prisma.unitHandoverReadiness.findUniqueOrThrow({ where: { id: r.id } });
    expect(formatBusinessDate(row.targetReadyDate)).toBe(formatBusinessDate(changes[2].newDate));
    expect(row.version).toBe(3);
    expect(formatBusinessDate(row.originalTargetDate)).toBe(dateIn(40));
  });

  it('stale expectedVersion is rejected (409), not silently applied', async () => {
    const r = await startA(dateIn(40));
    await service.changeTargetDate(LM_A(), r.id, { targetReadyDate: dateIn(41), reason: 'Lần một hợp lệ', expectedVersion: 0 });
    await expect(service.changeTargetDate(MD_A(), r.id, { targetReadyDate: dateIn(42), reason: 'Dựa trên dữ liệu cũ', expectedVersion: 0 }))
      .rejects.toMatchObject({ response: { code: 'HANDOVER_STALE' } });
  });

  it('HANDOVER-030 concurrent confirm -> exactly one confirmation', async () => {
    const r = await startA();
    await stage(r.id);
    const results = await Promise.allSettled([
      service.confirm(OP_A(), r.id, { note: 'Xác nhận A1' }),
      service.confirm(OP_A2(), r.id, { note: 'Xác nhận A2' }),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(((results.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason as any).response.code).toBe('HANDOVER_ALREADY_CONFIRMED');
    expect(await events(r.id, 'CONFIRMED')).toHaveLength(1);
    expect(await prisma.unitHandoverEvidence.count({ where: { readinessId: r.id, confirmationEventId: { not: null } } })).toBe(3);
  });

  it('HANDOVER-031 confirm vs target-date change race: no date change lands after confirmation', async () => {
    for (let round = 0; round < 4; round++) {
      await purge(); await seed();
      const r = await startA(dateIn(40));
      await stage(r.id);
      await Promise.allSettled([
        service.confirm(OP_A(), r.id, { note: 'Xác nhận song song' }),
        service.changeTargetDate(MD_A(), r.id, { targetReadyDate: dateIn(45 + round), reason: 'Đổi ngày song song' }),
      ]);
      const row = await prisma.unitHandoverReadiness.findUniqueOrThrow({ where: { id: r.id } });
      const ev = await events(r.id);
      const confirmIdx = ev.findIndex((e) => e.eventType === 'CONFIRMED');
      expect(row.lifecycleStatus).toBe('CONFIRMED'); // confirm never blocked by a legit date change
      expect(ev.slice(confirmIdx + 1).some((e) => e.eventType === 'TARGET_DATE_CHANGED')).toBe(false);
      expect(formatBusinessDate(ev[confirmIdx].newDate)).toBe(formatBusinessDate(row.targetReadyDate));
    }
  });

  it('reopen vs confirm race -> a valid, deterministic state that matches the ledger', async () => {
    const r = await startA();
    await stage(r.id);
    await service.confirm(OP_A(), r.id, { note: 'Xác nhận ban đầu' });
    // From CONFIRMED, whichever runs first, the second confirm can never succeed:
    // either it sees CONFIRMED (409) or it sees a reopened record with no fresh photos (400).
    const [reopen, confirm] = await Promise.allSettled([
      service.reopen(MD_A(), r.id, 'Mở lại để kiểm tra'),
      service.confirm(OP_A2(), r.id, { note: 'Xác nhận lại' }),
    ]);
    expect(reopen.status).toBe('fulfilled');
    expect(confirm.status).toBe('rejected');
    expect(['HANDOVER_ALREADY_CONFIRMED', 'HANDOVER_EVIDENCE_REQUIRED']).toContain(((confirm as PromiseRejectedResult).reason as any).response.code);
    const row = await prisma.unitHandoverReadiness.findUniqueOrThrow({ where: { id: r.id } });
    const lifecycle = (await events(r.id)).filter((e) => ['CONFIRMED', 'REOPENED'].includes(e.eventType)).map((e) => e.eventType);
    expect(lifecycle).toEqual(['CONFIRMED', 'REOPENED']);
    expect(row.lifecycleStatus).toBe('TRACKING');
    expect(await prisma.$queryRawUnsafe(`SELECT 1 FROM "UnitHandoverReadiness" WHERE id = '${r.id}' AND ("lifecycleStatus" = 'CONFIRMED') <> ("confirmedAt" IS NOT NULL)`)).toEqual([]);
  });

  it('risk resolve vs confirmation race -> no corrupted risk/readiness state', async () => {
    const r = await startA();
    const risk = (await service.addRisk(LM_A(), r.id, { title: 'Rủi ro song song', severity: 'HIGH' })).risks[0];
    await stage(r.id);
    const results = await Promise.allSettled([
      service.resolveRisk(OP_A2(), r.id, risk.id, 'Đã xử lý song song'),
      service.confirm(OP_A(), r.id, { note: 'Xác nhận song song' }),
    ]);
    expect(results.every((x) => x.status === 'fulfilled')).toBe(true);
    const finalRisk = await prisma.unitHandoverRisk.findUniqueOrThrow({ where: { id: risk.id } });
    expect(finalRisk.status).toBe('RESOLVED');
    expect(await events(r.id, 'RISK_RESOLVED')).toHaveLength(1);
    expect((await prisma.unitHandoverReadiness.findUniqueOrThrow({ where: { id: r.id } })).lifecycleStatus).toBe('CONFIRMED');
  });

  it('HANDOVER-032 duplicate scheduler execution (two instances at once) is idempotent', async () => {
    const r = await startA(dateIn(3));
    const [x, y] = await Promise.all([scheduler.runReminders(new Date()), scheduler.runReminders(new Date())]);
    expect(x.reminders + y.reminders).toBe(1);
    expect(await events(r.id, 'REMINDER_SENT')).toHaveLength(1);
    expect((await deliveries(`handover:${r.id}:D-3:`)).length).toBe(3);
  });

  it('HANDOVER-033 weekly digest is Mall-scoped (one per Mall per week, Mall managers only)', async () => {
    await startA(dateIn(5));
    await service.start(LM_B(), ids.unitB, { targetReadyDate: dateIn(-2) });
    const first = await scheduler.runWeeklyDigest(new Date());
    const again = await scheduler.runWeeklyDigest(new Date());
    const digestA = await prisma.emailDelivery.findMany({ where: { eventKey: { startsWith: `handover-digest:${ids.mallA}:` } } });
    const digestB = await prisma.emailDelivery.findMany({ where: { eventKey: { startsWith: `handover-digest:${ids.mallB}:` } } });
    expect(digestA.map((d) => (d.recipient as any).to).sort()).toEqual([`${ids.directorA}@hr.test`, `${ids.managerA}@hr.test`, `${ids.managerA2}@hr.test`].sort());
    expect(digestB.map((d) => (d.recipient as any).to).sort()).toEqual([`${ids.directorB}@hr.test`, `${ids.managerB}@hr.test`].sort());
    expect((digestA[0].payload as any).html).toContain('HR Mall A');
    expect((digestA[0].payload as any).html).not.toContain('HR Mall B');
    expect(first.weekKey).toBe(again.weekKey);
    expect(digestA.length + digestB.length).toBe(5); // re-run added nothing
  });

  it('HANDOVER-034 analytics list/KPIs are Mall-scoped', async () => {
    await startA(dateIn(5));
    await startA(dateIn(-3), LM_A(), ids.unitA2);
    await service.start(LM_B(), ids.unitB, { targetReadyDate: dateIn(1) });
    const a = await service.list(LM_A());
    expect(a.items.map((i) => i.unitId).sort()).toEqual([ids.unitA, ids.unitA2].sort());
    expect(a.kpis).toMatchObject({ tracking: 2, dueWithin30: 1, dueWithin7: 1, overdue: 1 });
    expect(a.items[0].status).toBe('OVERDUE'); // ordered by urgency
    const all = await service.list(ADMIN());
    expect(all.items.map((i) => i.mallId)).toEqual(expect.arrayContaining([ids.mallA, ids.mallB]));
    await expect(service.list(actor(ids.financeA, Role.FINANCE))).resolves.toMatchObject({ items: [] });
  });

  it('HANDOVER-034b analytics narrowed to one floor: only that floor, KPIs recomputed, no cross-Mall floor leak', async () => {
    const f1 = await prisma.floor.create({ data: { mallId: ids.mallA, name: 'Tầng 1', level: '1' } });
    const f2 = await prisma.floor.create({ data: { mallId: ids.mallA, name: 'Tầng 2', level: '2' } });
    const fb = await prisma.floor.create({ data: { mallId: ids.mallB, name: 'Tầng B1', level: '1' } });
    try {
      await prisma.unit.update({ where: { id: ids.unitA }, data: { floorId: f1.id } });
      await prisma.unit.update({ where: { id: ids.unitA2 }, data: { floorId: f2.id } });
      await prisma.unit.update({ where: { id: ids.unitB }, data: { floorId: fb.id } });
      await startA(dateIn(5));                              // floor 1, <=7 days
      await startA(dateIn(-3), LM_A(), ids.unitA2);         // floor 2, overdue
      await service.start(LM_B(), ids.unitB, { targetReadyDate: dateIn(1) });

      const floor1 = await service.list(LM_A(), ids.mallA, f1.id);
      expect(floor1.items.map((i) => i.unitId)).toEqual([ids.unitA]);
      expect(floor1.items[0].floorName).toBe('Tầng 1');
      expect(floor1.kpis).toMatchObject({ tracking: 1, dueWithin7: 1, overdue: 0 });

      const floor2 = await service.list(LM_A(), ids.mallA, f2.id);
      expect(floor2.items.map((i) => i.unitId)).toEqual([ids.unitA2]);
      expect(floor2.kpis).toMatchObject({ tracking: 1, overdue: 1, dueWithin7: 0 });

      // Mall B's floor id through Mall A's authority returns nothing.
      expect((await service.list(LM_A(), null, fb.id)).items).toEqual([]);
      expect((await service.list(LM_A(), ids.mallA, fb.id)).items).toEqual([]);
      // Without a floor: whole authorized Mall, as before.
      expect((await service.list(LM_A())).items).toHaveLength(2);
    } finally {
      await prisma.unit.updateMany({ where: { id: { in: [ids.unitA, ids.unitA2, ids.unitB] } }, data: { floorId: null } });
      await prisma.floor.deleteMany({ where: { id: { in: [f1.id, f2.id, fb.id] } } });
    }
  });

  it('HANDOVER-035 cancel tracking preserves Unit.status', async () => {
    const before = await unitStatus(ids.unitA3);
    const r = await startA(dateIn(30), LM_A(), ids.unitA3);
    const cancelled = await service.cancel(LM_A(), r.id, 'Không còn cần theo dõi');
    expect(cancelled.lifecycleStatus).toBe('CANCELLED');
    expect(await unitStatus(ids.unitA3)).toBe(before);
  });

  it('HANDOVER-036 confirm + reopen preserve Unit.status exactly', async () => {
    const before = await unitStatus(ids.unitA2);
    const r = await startA(dateIn(30), LM_A(), ids.unitA2);
    await stage(r.id);
    await service.confirm(OP_A(), r.id, { note: 'Đạt điều kiện' });
    expect(await unitStatus(ids.unitA2)).toBe(before);
    await service.reopen(MD_A(), r.id, 'Kiểm tra lại hạng mục điện');
    expect(await unitStatus(ids.unitA2)).toBe(before);
  });

  // ─── Ledger + authority details ─────────────────────────────────────────────

  it('event ledger is append-only at the database level', async () => {
    const r = await startA();
    const [ev] = await events(r.id);
    await expect(prisma.unitHandoverReadinessEvent.update({ where: { id: ev.id }, data: { reason: 'sửa lịch sử' } })).rejects.toThrow(/append-only/);
    await expect(prisma.unitHandoverReadinessEvent.delete({ where: { id: ev.id } })).rejects.toThrow(/append-only/);
  });

  it('Project authority comes from an explicit action grant, never from FITOUT_BASIC_TEAM role', async () => {
    const project = actor(ids.projectA, Role.FITOUT_BASIC_TEAM);
    await expect(service.start(project, ids.unitA, { targetReadyDate: dateIn(30) })).rejects.toBeInstanceOf(ForbiddenException);
    await grantMallA('handover-readiness-view', [Role.FITOUT_BASIC_TEAM]);
    await grantMallA('handover-readiness-manage', [Role.FITOUT_BASIC_TEAM]);
    const started = await service.start(project, ids.unitA, { targetReadyDate: dateIn(30) });
    expect(started.recordedBy.id).toBe(ids.projectA);
    await expect(service.start(project, ids.unitB, { targetReadyDate: dateIn(30) })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Leasing records a date on behalf of a Project owner without an account: actor history stays truthful', async () => {
    const r = await service.start(LM_A(), ids.unitA, { targetReadyDate: dateIn(30), projectOwnerName: 'Anh Tuấn - Ban dự án' });
    expect(r.projectOwnerName).toBe('Anh Tuấn - Ban dự án');
    expect(r.recordedBy.id).toBe(ids.managerA);
    expect((await events(r.id))[0].actorId).toBe(ids.managerA);
    await expect(service.start(LM_A(), ids.unitA2, { targetReadyDate: dateIn(30), projectOwnerId: ids.managerB }))
      .rejects.toMatchObject({ response: { code: 'HANDOVER_USER_MALL_INVALID' } });
  });

  it('business dates never drift (2026-12-01 stays 2026-12-01)', async () => {
    const r = await service.start(LM_A(), ids.unitA, { targetReadyDate: '2026-12-01' });
    expect(r.targetReadyDate).toBe('2026-12-01');
    const raw = await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT "targetReadyDate"::text AS d FROM "UnitHandoverReadiness" WHERE id = '${r.id}'`);
    expect(raw[0].d).toBe('2026-12-01');
  });

  it('lifecycle guard: no risk / evidence / date change on a confirmed or cancelled record', async () => {
    const r = await startA();
    await stage(r.id);
    await service.confirm(OP_A(), r.id, { note: 'Đủ điều kiện' });
    await expect(service.changeTargetDate(LM_A(), r.id, { targetReadyDate: dateIn(99), reason: 'Sau xác nhận' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.addRisk(OP_A(), r.id, { title: 'Sau xác nhận', severity: 'LOW' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.uploadEvidence(OP_A(), r.id, png())).rejects.toBeInstanceOf(ConflictException);
    await expect(service.cancel(LM_A(), r.id, 'Hủy sau xác nhận')).rejects.toBeInstanceOf(ConflictException);
    expect(HandoverReadinessLifecycle.CONFIRMED).toBe((await prisma.unitHandoverReadiness.findUniqueOrThrow({ where: { id: r.id } })).lifecycleStatus);
  });
});
