import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EmailDeliveryService } from './email-delivery.service';

describe('EmailDeliveryService', () => {
  const prisma = {
    emailDelivery: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const email = { sendMail: jest.fn() };
  const schedulerLock = { runExclusive: jest.fn() };
  const mallAccess = {
    getAccessibleMallIds: jest.fn(),
    assertMallAccess: jest.fn(),
    bypassesMallCheck: jest.fn(),
  };
  let service: EmailDeliveryService;

  const userA = { id: 'user-a', role: 'OPERATION' };
  const ordinaryDelivery = (overrides: Record<string, unknown> = {}) => ({
    id: 'delivery-a',
    eventKey: 'invoice-issued:invoice-a:tenant',
    eventType: 'INVOICE_ISSUED',
    entityType: 'Invoice',
    entityId: 'invoice-a',
    mallId: 'mall-a',
    recipient: { to: 'tenant@example.test', cc: null },
    payload: { subject: 'Invoice issued', html: '<p>Invoice issued</p>', text: 'Invoice issued' },
    status: 'SENT',
    attempts: 1,
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mallAccess.getAccessibleMallIds.mockResolvedValue(null);
    mallAccess.assertMallAccess.mockResolvedValue(undefined);
    mallAccess.bypassesMallCheck.mockReturnValue(false);
    prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
    service = new EmailDeliveryService(
      prisma as any,
      email as any,
      schedulerLock as any,
      mallAccess as any,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('EMAIL-OPS-007 uses eventKey upsert to prevent duplicate delivery records', async () => {
    prisma.emailDelivery.upsert.mockResolvedValue({ id: 'delivery-1' });
    const request = {
      eventKey: 'contract-expiry:contract-1:30:tenant',
      to: 'tenant@example.test',
      subject: 'Expiry',
      html: '<p>Expiry</p>',
    };

    await service.enqueue(prisma as any, request);
    await service.enqueue(prisma as any, request);

    expect(prisma.emailDelivery.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.emailDelivery.upsert).toHaveBeenLastCalledWith({
      where: { eventKey: request.eventKey },
      update: {},
      create: expect.objectContaining({
        eventKey: request.eventKey,
        payload: expect.objectContaining({ text: 'Expiry' }),
      }),
    });
  });

  it('EMAIL-OPS-001 EMAIL-OPS-016 EMAIL-OPS-017 records SMTP acceptance as SENT with provider message id', async () => {
    prisma.emailDelivery.findMany.mockResolvedValue([
      ordinaryDelivery({ id: 'delivery-1', attempts: 0, status: 'PENDING' }),
    ]);
    email.sendMail.mockResolvedValue({ messageId: 'smtp-message-1' });
    prisma.emailDelivery.update.mockResolvedValue({});

    await service.processBatch();

    expect(email.sendMail).toHaveBeenCalledWith({
      to: 'tenant@example.test',
      cc: undefined,
      subject: 'Invoice issued',
      html: '<p>Invoice issued</p>',
      text: 'Invoice issued',
    });
    expect(prisma.emailDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({
        status: 'SENT',
        providerMessageId: 'smtp-message-1',
        attempts: { increment: 1 },
        lastError: null,
        sentAt: expect.any(Date),
        lastAttemptAt: expect.any(Date),
      }),
    });
  });

  it('EMAIL-OPS-002 EMAIL-OPS-019 sanitizes secrets while retaining bounded failure history', async () => {
    prisma.emailDelivery.findMany.mockResolvedValue([
      ordinaryDelivery({ id: 'delivery-1', attempts: 2, status: 'PENDING' }),
    ]);
    email.sendMail.mockRejectedValue(
      new Error(
        'SMTP user=mailer password=hunter2 authToken=eyJhbGciOi secret=shh connection failed\nstack trace',
      ),
    );
    prisma.emailDelivery.update.mockResolvedValue({});

    await service.processBatch();

    const data = prisma.emailDelivery.update.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        attempts: 3,
        lastAttemptAt: expect.any(Date),
        nextAttemptAt: expect.any(Date),
      }),
    );
    expect(data.lastError).toContain('SMTP user=[redacted]');
    expect(data.lastError).toContain('connection failed');
    expect(data.lastError).not.toContain('hunter2');
    expect(data.lastError).not.toContain('eyJhbGciOi');
    expect(data.lastError).not.toContain('secret=shh');
    expect(data.lastError.length).toBeLessThanOrEqual(1000);
  });

  it('persists failed attempts and schedules bounded retry', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    prisma.emailDelivery.findMany.mockResolvedValue([
      ordinaryDelivery({ id: 'delivery-1', attempts: 2, status: 'PENDING' }),
    ]);
    email.sendMail.mockRejectedValue(new Error('SMTP unavailable'));
    prisma.emailDelivery.update.mockResolvedValue({});

    await service.processBatch();

    expect(prisma.emailDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: {
        status: 'FAILED',
        attempts: 3,
        nextAttemptAt: new Date(now + 8_000),
        lastError: 'SMTP unavailable',
        lastAttemptAt: expect.any(Date),
      },
    });
  });

  it('processes under a distributed lock', async () => {
    schedulerLock.runExclusive.mockImplementation(
      (_key: string, _ttl: number, callback: () => unknown) => callback(),
    );
    prisma.emailDelivery.findMany.mockResolvedValue([]);

    await service.processPending();

    expect(schedulerLock.runExclusive).toHaveBeenCalledWith(
      'email-delivery',
      30_000,
      expect.any(Function),
    );
  });

  it('EMAIL-OPS-009 limits list results to the caller accessible Mall set', async () => {
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-a']);
    prisma.emailDelivery.findMany.mockResolvedValue([ordinaryDelivery()]);

    const rows = await service.list({}, userA);

    expect(prisma.emailDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { mallId: { in: ['mall-a'] } } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: 'delivery-a',
        attemptCount: 1,
        capabilities: { canRetry: false, canResend: true, resendMode: 'PAYLOAD_REPLAY' },
      }),
    );
  });

  it.each([
    ['detail', (id: string) => service.get(id, userA)],
    ['EMAIL-OPS-010 preview', (id: string) => service.preview(id, userA)],
    ['EMAIL-OPS-011 retry', (id: string) => service.retry(id, userA, 'mall-denied-retry')],
    ['EMAIL-OPS-012 resend', (id: string) => service.resend(id, userA, 'mall-denied-resend')],
  ])('MALL-ISO denies Mall B %s before mutation or SMTP', async (_operation, invoke) => {
    prisma.emailDelivery.findUnique.mockResolvedValue(
      ordinaryDelivery({ id: 'delivery-b', mallId: 'mall-b', status: 'FAILED' }),
    );
    mallAccess.assertMallAccess.mockRejectedValue(new ForbiddenException('Mall access denied'));

    await expect(invoke('delivery-b')).rejects.toBeInstanceOf(ForbiddenException);

    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('user-a', 'OPERATION', 'mall-b');
    expect(prisma.emailDelivery.create).not.toHaveBeenCalled();
    expect(prisma.emailDelivery.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(email.sendMail).not.toHaveBeenCalled();
  });

  it('denies unowned legacy rows without a Mall before any side effect', async () => {
    prisma.emailDelivery.findUnique.mockResolvedValue(
      ordinaryDelivery({ mallId: null, status: 'FAILED' }),
    );

    await expect(service.retry('delivery-a', userA, 'unowned-retry')).rejects.toBeInstanceOf(ForbiddenException);

    expect(mallAccess.bypassesMallCheck).toHaveBeenCalledWith('OPERATION');
    expect(prisma.emailDelivery.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(email.sendMail).not.toHaveBeenCalled();
  });

  it('EMAIL-OPS-003 EMAIL-OPS-005 EMAIL-OPS-006 EMAIL-OPS-018 creates an auditable linked retry without mutating the original', async () => {
    const original = ordinaryDelivery({ status: 'FAILED' });
    prisma.emailDelivery.findUnique.mockResolvedValue(original);
    prisma.emailDelivery.create.mockResolvedValue({ id: 'retry-1' });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

    await expect(service.retry(original.id, userA, 'retry-operation-1')).resolves.toEqual({ id: 'retry-1' });

    expect(prisma.emailDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKey: `${original.eventKey}:retry:retry-operation-1`,
        originalDeliveryId: original.id,
        payload: original.payload,
        recipient: original.recipient,
      }),
    });
    expect(prisma.emailDelivery.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: userA.id,
        action: 'EMAIL_RETRY',
        entityId: 'retry-1',
        status: 'SUCCESS',
      }),
    });
    expect(email.sendMail).not.toHaveBeenCalled();
  });

  it('EMAIL-OPS-004 EMAIL-OPS-005 EMAIL-OPS-006 EMAIL-OPS-008 EMAIL-OPS-018 explicitly resends with a linked unique identity', async () => {
    const original = ordinaryDelivery();
    prisma.emailDelivery.findUnique.mockResolvedValue(original);
    prisma.emailDelivery.create.mockResolvedValue({ id: 'resend-1' });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

    await expect(service.resend(original.id, userA, 'resend-operation-1')).resolves.toEqual({ id: 'resend-1' });

    expect(prisma.emailDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKey: `${original.eventKey}:resend:resend-operation-1`,
        originalDeliveryId: original.id,
        resendOfId: original.id,
        payload: original.payload,
      }),
    });
    expect(prisma.emailDelivery.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'EMAIL_RESEND', entityId: 'resend-1' }),
    });
    expect(email.sendMail).not.toHaveBeenCalled();
  });

  it.each([
    ['TENANT_ACTIVATION', 'tenant-activation:tenant-a', 'REGENERATE_DOMAIN_TOKEN'],
    ['PASSWORD_RESET', 'password-reset:user-a', 'NOT_ALLOWED'],
  ])(
    'EMAIL-OPS-014 does not replay stored %s token payloads',
    async (eventType, eventKey, resendMode) => {
      const original = ordinaryDelivery({
        eventType,
        eventKey,
        payload: {
          subject: 'Security token',
          html: '<a href="https://example.test/action?token=stale-secret">Continue</a>',
        },
      });
      prisma.emailDelivery.findUnique.mockResolvedValue(original);

      await expect(service.resend(original.id, userA, 'token-resend')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.get(original.id, userA)).resolves.toEqual(
        expect.objectContaining({
          capabilities: { canRetry: false, canResend: resendMode === 'REGENERATE_DOMAIN_TOKEN', resendMode },
        }),
      );
      expect(prisma.emailDelivery.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      expect(email.sendMail).not.toHaveBeenCalled();
    },
  );

  it('EMAIL-OPS-013 returns malicious stored HTML verbatim for sandboxed client preview only', async () => {
    const malicious =
      '<script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">x</a><iframe src="https://evil.test"></iframe><form action="https://evil.test"></form>';
    prisma.emailDelivery.findUnique.mockResolvedValue(
      ordinaryDelivery({ payload: { subject: 'Preview', html: malicious } }),
    );

    await expect(service.preview('delivery-a', userA)).resolves.toEqual(
      expect.objectContaining({ id: 'delivery-a', subject: 'Preview', html: malicious }),
    );
    expect(email.sendMail).not.toHaveBeenCalled();
    expect(prisma.emailDelivery.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ['retry', (id: string) => service.retry(id, userA, 'same-operation'), 'FAILED'],
    ['resend', (id: string) => service.resend(id, userA, 'same-operation'), 'SENT'],
  ])(
    'serializes concurrent %s duplicates through eventKey uniqueness without SMTP side effects',
    async (kind, invoke, status) => {
      const original = ordinaryDelivery({ status });
      prisma.emailDelivery.findUnique.mockResolvedValue(original);
      const keys = new Set<string>();
      prisma.emailDelivery.create.mockImplementation(async ({ data }: any) => {
        if (keys.has(data.eventKey)) throw Object.assign(new Error('Unique constraint failed: eventKey'), { code: 'P2002' });
        keys.add(data.eventKey);
        return { id: `${kind}-1`, ...data };
      });
      prisma.emailDelivery.findUnique
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(original)
        .mockResolvedValue({ id: `${kind}-1`, eventKey: `${original.eventKey}:${kind}:same-operation` });
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const outcomes = await Promise.allSettled([invoke(original.id), invoke(original.id)]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(2);
      expect(keys.size).toBe(1);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(email.sendMail).not.toHaveBeenCalled();
    },
  );
});
