import { EmailDeliveryService } from './email-delivery.service';

describe('EmailDeliveryService', () => {
  const prisma = {
    emailDelivery: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const email = { sendMail: jest.fn() };
  const schedulerLock = { runExclusive: jest.fn() };
  let service: EmailDeliveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmailDeliveryService(prisma as any, email as any, schedulerLock as any);
  });

  it('uses eventKey upsert to prevent duplicate delivery records', async () => {
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
      create: expect.objectContaining({ eventKey: request.eventKey }),
    });
  });

  it('stores provider delivery status and message id', async () => {
    prisma.emailDelivery.findMany.mockResolvedValue([{
      id: 'delivery-1',
      eventKey: 'ar-dunning:invoice-1:policy-1:tenant',
      recipient: { to: 'tenant@example.test', cc: null },
      payload: { subject: 'Dunning', html: '<p>Dunning</p>' },
      attempts: 0,
    }]);
    email.sendMail.mockResolvedValue({ messageId: 'smtp-message-1' });
    prisma.emailDelivery.update.mockResolvedValue({});

    await service.processBatch();

    expect(email.sendMail).toHaveBeenCalledWith({
      to: 'tenant@example.test',
      cc: undefined,
      subject: 'Dunning',
      html: '<p>Dunning</p>',
    });
    expect(prisma.emailDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({
        status: 'DELIVERED',
        providerMessageId: 'smtp-message-1',
        attempts: { increment: 1 },
        lastError: null,
      }),
    });
  });

  it('persists failed attempts and schedules bounded retry', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    prisma.emailDelivery.findMany.mockResolvedValue([{
      id: 'delivery-1',
      eventKey: 'fitout-sla:milestone-1:manager:user-1',
      recipient: { to: 'manager@example.test' },
      payload: { subject: 'SLA', html: '<p>SLA</p>' },
      attempts: 2,
    }]);
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
});
