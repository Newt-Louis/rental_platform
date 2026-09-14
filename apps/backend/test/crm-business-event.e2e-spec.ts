import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CrmActorType, CrmBusinessEventType, CrmEventSourceModule, LeadStatus, Role } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CrmBusinessEventService } from '../src/modules/crm/crm-business-event.service';
import { CrmService } from '../src/modules/crm/crm.service';
import { LeadLifecycleService } from '../src/modules/crm/lead-lifecycle.service';

describe('CR-CRM-BUSINESS-EVENT-001 runtime PostgreSQL proof', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let crm: CrmService;
  let events: CrmBusinessEventService;
  let lifecycle: LeadLifecycleService;
  let managerToken: string;
  let adminToken: string;
  let managerId: string;
  let mallAId: string;
  let leadAId: string;
  const mallBId = 'crm-event-001-mall-b';
  const mallBCode = 'CRM-EVT-001-B';
  const leadBId = 'crm-event-001-lead-b';
  const nullMallLeadId = 'crm-event-001-null-mall';
  const createdFollowUps: string[] = [];

  beforeAll(async () => {
    const fixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    crm = app.get(CrmService);
    events = app.get(CrmBusinessEventService);
    lifecycle = app.get(LeadLifecycleService);

    const mallA = await prisma.mall.findFirstOrThrow({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    mallAId = mallA.id;
    const manager = await prisma.user.findUniqueOrThrow({ where: { email: 'manager@thiso.com' } });
    managerId = manager.id;
    await prisma.mall.upsert({
      where: { code: mallBCode },
      update: { isActive: true },
      create: { id: mallBId, code: mallBCode, name: 'CRM Event Mall B' },
    });
    await prisma.lead.createMany({ data: [
      { id: leadBId, brandName: 'Mall B Evidence', contactName: 'Mall B', mallId: mallBId, assignedToId: managerId },
      { id: nullMallLeadId, brandName: 'Null Mall Evidence', contactName: 'Admin only', mallId: null, assignedToId: managerId },
    ] });

    managerToken = (await request(app.getHttpServer())
      .post('/api/auth/login').send({ email: 'manager@thiso.com', password: 'User123!' }).expect(201)).body.accessToken;
    adminToken = (await request(app.getHttpServer())
      .post('/api/auth/login').send({ email: 'admin@thiso.com', password: 'Admin123!' }).expect(201)).body.accessToken;

    const created = await request(app.getHttpServer())
      .post('/api/crm/leads')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ brandName: 'CRM Event Journey', contactName: 'Evidence User', mallId: mallAId, assignedToId: managerId })
      .expect(201);
    leadAId = created.body.id;
  });

  afterAll(async () => {
    if (prisma) {
      const leadIds = [leadAId, leadBId, nullMallLeadId].filter(Boolean);
      await prisma.crmBusinessEvent.deleteMany({ where: { leadId: { in: leadIds } } });
      await prisma.leadFollowUp.deleteMany({ where: { id: { in: createdFollowUps } } });
      await prisma.leadActivity.deleteMany({ where: { leadId: { in: leadIds } } });
      await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
      await prisma.mall.deleteMany({ where: { id: mallBId } });
    }
    if (app) await app.close();
  });

  it('CRM-EVT-001/002 records Lead creation with persisted Mall and human actor', async () => {
    const event = await prisma.crmBusinessEvent.findFirstOrThrow({
      where: { leadId: leadAId, eventType: CrmBusinessEventType.LEAD_CREATED },
    });
    expect(event.mallId).toBe(mallAId);
    expect(event.actorType).toBe(CrmActorType.USER);
    expect(event.actorUserId).toBe(managerId);
  });

  it('CRM-EVT-009/010 rolls activity, event and lastActivityAt back together on event failure', async () => {
    const before = await prisma.lead.findUniqueOrThrow({ where: { id: leadAId } });
    const beforeCount = await prisma.leadActivity.count({ where: { leadId: leadAId } });
    const append = jest.spyOn(events, 'append').mockRejectedValueOnce(new Error('injected event failure'));
    await expect(crm.addActivity(leadAId, { type: 'CALL' as any, note: 'must rollback' }, managerId)).rejects.toThrow('injected event failure');
    append.mockRestore();
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: leadAId } });
    expect(await prisma.leadActivity.count({ where: { leadId: leadAId } })).toBe(beforeCount);
    expect(after.lastActivityAt?.toISOString() ?? null).toBe(before.lastActivityAt?.toISOString() ?? null);

    await request(app.getHttpServer())
      .post(`/api/crm/leads/${leadAId}/activities`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ type: 'CALL', note: 'Successful customer call', outcome: 'Meeting booked' })
      .expect(201);
    const persisted = await prisma.lead.findUniqueOrThrow({ where: { id: leadAId } });
    expect(persisted.lastActivityAt).not.toBeNull();
    expect(await prisma.crmBusinessEvent.count({ where: { leadId: leadAId, eventType: CrmBusinessEventType.ACTIVITY_ADDED } })).toBe(1);
  });

  it('CRM-IDEM-039 stores one transition event for a retried request', async () => {
    const key = 'crm-event-e2e-manual-transition';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app.getHttpServer())
        .put(`/api/crm/leads/${leadAId}/move`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('Idempotency-Key', key)
        .send({ status: LeadStatus.CONTACTED, position: 0 })
        .expect(200);
    }
    expect(await prisma.crmBusinessEvent.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('CRM-EVT-012/013 retains completed and cancelled follow-up history', async () => {
    const createFollowUp = async (note: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/crm/follow-ups')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ leadId: leadAId, assignedToId: managerId, dueDate: '2026-09-30T00:00:00.000Z', note })
        .expect(201);
      createdFollowUps.push(response.body.id);
      return response.body.id as string;
    };
    const completedId = await createFollowUp('Complete me');
    await request(app.getHttpServer()).put(`/api/crm/follow-ups/${completedId}/complete`)
      .set('Authorization', `Bearer ${managerToken}`).send({ outcome: 'Reached', comment: 'Qualified' }).expect(200);
    const cancelledId = await createFollowUp('Cancel me');
    await request(app.getHttpServer()).put(`/api/crm/follow-ups/${cancelledId}/cancel`)
      .set('Authorization', `Bearer ${managerToken}`).send({ reason: 'Duplicate task' }).expect(200);
    expect(await prisma.leadFollowUp.findUnique({ where: { id: completedId } })).toMatchObject({ status: 'COMPLETED', completedById: managerId });
    expect(await prisma.leadFollowUp.findUnique({ where: { id: cancelledId } })).toMatchObject({ status: 'CANCELLED', cancelledById: managerId });
  });

  it('CRM-SEC-029/030 denies Mall B and null-Mall to Mall A with zero side effect', async () => {
    const before = await prisma.leadActivity.count({ where: { leadId: { in: [leadBId, nullMallLeadId] } } });
    for (const id of [leadBId, nullMallLeadId]) {
      await request(app.getHttpServer()).post(`/api/crm/leads/${id}/activities`)
        .set('Authorization', `Bearer ${managerToken}`).send({ type: 'CALL', note: 'forbidden' }).expect(404);
    }
    expect(await prisma.leadActivity.count({ where: { leadId: { in: [leadBId, nullMallLeadId] } } })).toBe(before);
    await request(app.getHttpServer()).get(`/api/crm/leads/${nullMallLeadId}/events`)
      .set('Authorization', `Bearer ${managerToken}`).expect(404);
    await request(app.getHttpServer()).get(`/api/crm/leads/${nullMallLeadId}/events`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
  });

  it('CRM-CONC-045 rolls Lead state back when event validation fails', async () => {
    const before = await prisma.lead.findUniqueOrThrow({ where: { id: leadAId } });
    await expect(lifecycle.transition({
      leadId: leadAId,
      targetStatus: LeadStatus.QUALIFIED,
      actor: { type: CrmActorType.SYSTEM, userId: managerId },
      sourceModule: CrmEventSourceModule.SYSTEM,
      occurredAt: new Date(),
      idempotencyKey: 'crm-event-invalid-actor',
    })).rejects.toThrow();
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: leadAId } });
    expect(after.status).toBe(before.status);
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });

  it('CRM-EVT-018 returns partial coverage and no fabricated legacy transitions', async () => {
    const response = await request(app.getHttpServer()).get(`/api/crm/leads/${leadAId}/timeline`)
      .set('Authorization', `Bearer ${managerToken}`).expect(200);
    expect(response.body.historicalCoverage).toBe('PARTIAL');
    expect(response.body.events.every((event: any) => ['CRM_BUSINESS_EVENT', 'LEGACY_SOURCE_RECORD'].includes(event.evidence))).toBe(true);
    expect(response.body.events.some((event: any) => event.commentStatus === 'WITHHELD_PENDING_BC_028')).toBe(true);
  });
});
