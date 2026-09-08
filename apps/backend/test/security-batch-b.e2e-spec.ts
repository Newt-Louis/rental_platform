import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Security Batch B runtime proof (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let operationToken: string;
  let managerToken: string;
  let adminToken: string;
  let tenantToken: string;
  let ownTenantTicketId: string;
  let foreignTenantTicketId: string;
  let foreignTenantInvoiceId: string;
  let foreignTenantContractId: string;
  let mallAId: string;
  const mallBId = 'cr120-security-mall-b';
  const mallBCode = 'CR120-MALL-B';
  const rateAId = 'cr120-rate-a';
  const rateBId = 'cr120-rate-b';
  const leadBId = 'cr120-lead-b';
  const autoLeadBId = 'cr120-auto-lead-b';
  const followUpBId = 'cr120-followup-b';
  let createdOperationGrant = false;
  let createdManagerGrant = false;

  beforeAll(async () => {
    const fixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    const mallA = await prisma.mall.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!mallA) throw new Error('Security runtime fixture requires one existing active Mall');
    mallAId = mallA.id;

    await prisma.mall.upsert({
      where: { code: mallBCode },
      update: { name: 'CR-120 Security Mall B', isActive: true },
      create: { id: mallBId, code: mallBCode, name: 'CR-120 Security Mall B' },
    });

    const operation = await prisma.user.findUnique({ where: { email: 'operation@thiso.com' } });
    if (!operation) throw new Error('Security runtime fixture requires operation@thiso.com');
    const existingGrant = await prisma.userMallAccess.findUnique({
      where: { userId_mallId: { userId: operation.id, mallId: mallAId } },
    });
    if (!existingGrant) {
      await prisma.userMallAccess.create({
        data: { userId: operation.id, mallId: mallAId, role: Role.OPERATION, isActive: true },
      });
      createdOperationGrant = true;
    } else if (!existingGrant.isActive) {
      throw new Error('Existing inactive Operation Mall grant must not be modified by the security test');
    }

    const manager = await prisma.user.findUnique({ where: { email: 'manager@thiso.com' } });
    if (!manager) throw new Error('Security runtime fixture requires manager@thiso.com');
    const existingManagerGrant = await prisma.userMallAccess.findUnique({
      where: { userId_mallId: { userId: manager.id, mallId: mallAId } },
    });
    if (!existingManagerGrant) {
      await prisma.userMallAccess.create({
        data: { userId: manager.id, mallId: mallAId, role: Role.LEASING_MANAGER, isActive: true },
      });
      createdManagerGrant = true;
    } else if (!existingManagerGrant.isActive) {
      throw new Error('Existing inactive Manager Mall grant must not be modified by the security test');
    }

    await prisma.periodicChargeRateConfig.createMany({
      data: [
        { id: rateAId, mallId: mallAId, chargeType: 'UTILITY', ratesJson: { electricityUnitPrice: 1, waterUnitPrice: 1 }, effectiveFrom: new Date('2026-01-01') },
        { id: rateBId, mallId: mallBId, chargeType: 'UTILITY', ratesJson: { electricityUnitPrice: 2, waterUnitPrice: 2 }, effectiveFrom: new Date('2026-01-01') },
      ],
      skipDuplicates: true,
    });

    await prisma.lead.create({
      data: {
        id: leadBId,
        brandName: 'CR-120 Mall B Lead',
        contactName: 'Security Fixture',
        mallId: mallBId,
        assignedToId: manager.id,
        createdAt: new Date('1800-01-01T00:00:00.000Z'),
      },
    });
    await prisma.lead.create({
      data: {
        id: autoLeadBId,
        brandName: 'CR-120 Mall B Auto Lead',
        contactName: 'Security Fixture',
        category: 'F&B',
        mallId: mallBId,
      },
    });

    await prisma.leadFollowUp.create({
      data: {
        id: followUpBId,
        leadId: leadBId,
        assignedToId: manager.id,
        dueDate: new Date('2026-09-30T00:00:00.000Z'),
        note: 'CR-120 foreign Mall fixture',
      },
    });

    const operationLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'operation@thiso.com', password: 'User123!' })
      .expect(201);
    operationToken = operationLogin.body.accessToken;

    const managerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'manager@thiso.com', password: 'User123!' })
      .expect(201);
    managerToken = managerLogin.body.accessToken;

    const circleUser = await prisma.user.findUniqueOrThrow({ where: { email: 'portal.circlek@thiso.com' } });
    const highlandsUser = await prisma.user.findUniqueOrThrow({ where: { email: 'portal.highlands@thiso.com' } });
    if (!circleUser.tenantId || !highlandsUser.tenantId) throw new Error('Tenant runtime fixtures require linked tenant identities');
    ownTenantTicketId = (await prisma.ticket.findFirstOrThrow({ where: { tenantId: circleUser.tenantId }, select: { id: true } })).id;
    foreignTenantTicketId = (await prisma.ticket.findFirstOrThrow({ where: { tenantId: highlandsUser.tenantId }, select: { id: true } })).id;
    foreignTenantInvoiceId = (await prisma.invoice.findFirstOrThrow({ where: { tenantId: highlandsUser.tenantId }, select: { id: true } })).id;
    foreignTenantContractId = (await prisma.contract.findFirstOrThrow({ where: { tenantId: highlandsUser.tenantId }, select: { id: true } })).id;
    const tenantLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'portal.circlek@thiso.com', password: 'Tenant123!' })
      .expect(201);
    tenantToken = tenantLogin.body.accessToken;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@thiso.com', password: 'Admin123!' })
      .expect(201);
    adminToken = adminLogin.body.accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.leadFollowUp.deleteMany({ where: { id: { startsWith: 'cr120-' } } });
      await prisma.lead.deleteMany({ where: { id: { in: [leadBId, autoLeadBId] } } });
      await prisma.periodicChargeRateConfig.deleteMany({ where: { id: { in: [rateAId, rateBId] } } });
      if (createdOperationGrant) {
        const operation = await prisma.user.findUnique({ where: { email: 'operation@thiso.com' } });
        if (operation) {
          await prisma.userMallAccess.deleteMany({ where: { userId: operation.id, mallId: mallAId } });
        }
      }
      if (createdManagerGrant) {
        const manager = await prisma.user.findUnique({ where: { email: 'manager@thiso.com' } });
        if (manager) {
          await prisma.userMallAccess.deleteMany({ where: { userId: manager.id, mallId: mallAId } });
        }
      }
      await prisma.mall.deleteMany({ where: { id: mallBId } });
    }
    if (app) await app.close();
  });

  it('SEC-MALL-004: omitted mall returns only the authenticated Mall set', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/billing/addin/rates')
      .set('Authorization', `Bearer ${operationToken}`)
      .expect(200);

    expect(response.body.some((rate: any) => rate.id === rateAId)).toBe(true);
    expect(response.body.some((rate: any) => rate.id === rateBId)).toBe(false);
  });

  it('SEC-MALL-001: explicit foreign mall is rejected before financial data return', async () => {
    await request(app.getHttpServer())
      .get(`/api/billing/addin/rates?mallId=${mallBId}`)
      .set('Authorization', `Bearer ${operationToken}`)
      .expect(403);
  });

  it('SEC-MALL-010: authorized global ADMIN still sees both Mall configurations', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/billing/addin/rates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.some((rate: any) => rate.id === rateAId)).toBe(true);
    expect(response.body.some((rate: any) => rate.id === rateBId)).toBe(true);
  });

  it('SEC-MALL-004: assigned-user filter cannot broaden CRM follow-ups to Mall B', async () => {
    const manager = await prisma.user.findUniqueOrThrow({ where: { email: 'manager@thiso.com' } });
    const response = await request(app.getHttpServer())
      .get(`/api/crm/follow-ups?assignedToId=${manager.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(response.body.some((item: any) => item.id === followUpBId)).toBe(false);
  });

  it('SEC-MALL-002/008: foreign CRM follow-up completion is denied with zero side effects', async () => {
    await request(app.getHttpServer())
      .put(`/api/crm/follow-ups/${followUpBId}/complete`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(404);
    const unchanged = await prisma.leadFollowUp.findUniqueOrThrow({ where: { id: followUpBId } });
    expect(unchanged.isDone).toBe(false);
    expect(unchanged.completedAt).toBeNull();
  });

  it('SEC-MALL-003: foreign CRM follow-up deletion is denied and the row remains', async () => {
    await request(app.getHttpServer())
      .delete(`/api/crm/follow-ups/${followUpBId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(404);
    await expect(prisma.leadFollowUp.findUniqueOrThrow({ where: { id: followUpBId } })).resolves.toBeDefined();
  });

  it('SEC-MALL-005/006: a Mall-B Lead cannot be smuggled through a Mall-A assignee', async () => {
    const manager = await prisma.user.findUniqueOrThrow({ where: { email: 'manager@thiso.com' } });
    const before = await prisma.leadFollowUp.count({ where: { id: { startsWith: 'cr120-' } } });
    await request(app.getHttpServer())
      .post('/api/crm/follow-ups')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ leadId: leadBId, assignedToId: manager.id, dueDate: '2026-10-01' })
      .expect(404);
    const after = await prisma.leadFollowUp.count({ where: { id: { startsWith: 'cr120-' } } });
    expect(after).toBe(before);
  });

  it('SEC-MALL-008: cross-Mall stale batch leaves the foreign Lead unchanged', async () => {
    await request(app.getHttpServer())
      .post('/api/crm/leads/auto-move-stale?days=50000')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    const unchanged = await prisma.lead.findUniqueOrThrow({ where: { id: leadBId } });
    expect(unchanged.status).toBe('NEW');
    expect(unchanged.lostReason).toBeNull();
  });

  it('SEC-MALL-002/008: cross-Mall automatic assignment is denied before mutation', async () => {
    await request(app.getHttpServer())
      .post(`/api/crm/leads/${autoLeadBId}/auto-assign`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(404);
    const unchanged = await prisma.lead.findUniqueOrThrow({ where: { id: autoLeadBId } });
    expect(unchanged.assignedToId).toBeNull();
  });

  it('SEC-MALL-002/008: cross-Mall automatic follow-up creates no row', async () => {
    const before = await prisma.leadFollowUp.count({ where: { leadId: leadBId } });
    await request(app.getHttpServer())
      .post(`/api/crm/leads/${leadBId}/auto-followup`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'must not be created' })
      .expect(404);
    expect(await prisma.leadFollowUp.count({ where: { leadId: leadBId } })).toBe(before);
  });

  it('SEC-TENANT-001 allows the tenant own Ticket and denies another tenant Ticket', async () => {
    await request(app.getHttpServer())
      .get(`/api/tickets/${ownTenantTicketId}`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/tickets/${foreignTenantTicketId}`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .expect(403);
  });

  it('SEC-TENANT-002 denies another tenant Ticket mutation with zero side effects', async () => {
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: foreignTenantTicketId } });
    await request(app.getHttpServer())
      .put(`/api/tickets/${foreignTenantTicketId}`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ subject: 'must not change' })
      .expect(403);
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: foreignTenantTicketId } });
    expect(after.subject).toBe(before.subject);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('SEC-TENANT-001 denies another tenant financial and contract details', async () => {
    await request(app.getHttpServer())
      .get(`/api/billing/invoices/${foreignTenantInvoiceId}`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/contracts/${foreignTenantContractId}`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .expect(403);
  });
});
