import { SapStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SapService } from './sap.service';

describe('SapService idempotency', () => {
  const prisma = {
    tenant: { findUnique: jest.fn() },
    invoice: { findUnique: jest.fn() },
    sapIntegrationLog: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const originalEnabled = process.env.SAP_ENABLED;
  const originalBaseUrl = process.env.SAP_BASE_URL;
  const resilienceEnv = [
    'SAP_TIMEOUT_MS',
    'SAP_MAX_ATTEMPTS',
    'SAP_RETRY_BASE_MS',
    'SAP_CIRCUIT_FAILURE_THRESHOLD',
    'SAP_CIRCUIT_COOLDOWN_MS',
  ] as const;
  const originalResilienceEnv = Object.fromEntries(
    resilienceEnv.map((name) => [name, process.env[name]]),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SAP_ENABLED = 'false';
    process.env.SAP_BASE_URL = 'https://sap.example.test';
    process.env.SAP_TIMEOUT_MS = '100';
    process.env.SAP_MAX_ATTEMPTS = '3';
    process.env.SAP_RETRY_BASE_MS = '0';
    process.env.SAP_CIRCUIT_FAILURE_THRESHOLD = '5';
    process.env.SAP_CIRCUIT_COOLDOWN_MS = '100';
  });

  afterAll(() => {
    process.env.SAP_ENABLED = originalEnabled;
    process.env.SAP_BASE_URL = originalBaseUrl;
    for (const name of resilienceEnv) {
      const value = originalResilienceEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    jest.restoreAllMocks();
  });

  it('upserts one pending record when SAP is disabled', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      companyName: 'Tenant',
      taxCode: null,
      contactEmail: null,
      address: null,
    });
    prisma.sapIntegrationLog.upsert.mockResolvedValue({ id: 'log-1' });
    const service = new SapService(prisma as unknown as PrismaService);

    await service.syncCustomer('tenant-1');
    await service.syncCustomer('tenant-1');

    expect(prisma.sapIntegrationLog.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.sapIntegrationLog.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: 'TENANT:tenant-1:/CustomerMaster' },
      }),
    );
  });

  it('updates an existing failed idempotency record after a successful retry', async () => {
    process.env.SAP_ENABLED = 'true';
    const service = new SapService(prisma as unknown as PrismaService);
    prisma.sapIntegrationLog.findUnique.mockResolvedValue({
      id: 'failed-log',
      status: SapStatus.FAILED,
    });
    prisma.sapIntegrationLog.upsert.mockResolvedValue({
      id: 'failed-log',
      status: SapStatus.SUCCESS,
    });
    (service as any).accessToken = 'cached-token';
    (service as any).tokenExpiresAt = new Date(Date.now() + 60_000);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '{"document":"123"}',
    } as Response);

    const result = await (service as any).callSapApi({
      method: 'POST',
      endpoint: '/CustomerMaster',
      payload: '{}',
      entityType: 'TENANT',
      entityId: 'tenant-1',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(prisma.sapIntegrationLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: 'TENANT:tenant-1:/CustomerMaster' },
        update: expect.objectContaining({
          status: SapStatus.SUCCESS,
          errorMessage: null,
        }),
      }),
    );
    expect(result.status).toBe(SapStatus.SUCCESS);
  });

  it('retries transient SAP responses and sends the idempotency key', async () => {
    process.env.SAP_ENABLED = 'true';
    const service = new SapService(prisma as unknown as PrismaService);
    prisma.sapIntegrationLog.findUnique.mockResolvedValue(null);
    prisma.sapIntegrationLog.upsert.mockResolvedValue({ status: SapStatus.SUCCESS });
    (service as any).accessToken = 'cached-token';
    (service as any).tokenExpiresAt = new Date(Date.now() + 60_000);
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{"document":"123"}',
      } as Response);

    await (service as any).callSapApi({
      method: 'POST',
      endpoint: '/CustomerMaster',
      payload: '{}',
      entityType: 'TENANT',
      entityId: 'tenant-1',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      'https://sap.example.test/CustomerMaster',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'TENANT:tenant-1:/CustomerMaster',
        }),
      }),
    );
  });

  it('aborts timed-out requests and persists a failed delivery after bounded retries', async () => {
    process.env.SAP_ENABLED = 'true';
    process.env.SAP_TIMEOUT_MS = '100';
    process.env.SAP_MAX_ATTEMPTS = '2';
    const service = new SapService(prisma as unknown as PrismaService);
    prisma.sapIntegrationLog.findUnique.mockResolvedValue(null);
    prisma.sapIntegrationLog.upsert.mockImplementation(({ update }) => update);
    (service as any).accessToken = 'cached-token';
    (service as any).tokenExpiresAt = new Date(Date.now() + 60_000);
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    );

    const result = await (service as any).callSapApi({
      method: 'POST',
      endpoint: '/CustomerMaster',
      payload: '{}',
      entityType: 'TENANT',
      entityId: 'tenant-1',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({
      status: SapStatus.FAILED,
      errorMessage: 'aborted',
    }));
  });

  it('opens the circuit after repeated failures and fails fast during cooldown', async () => {
    process.env.SAP_ENABLED = 'true';
    process.env.SAP_MAX_ATTEMPTS = '1';
    process.env.SAP_CIRCUIT_FAILURE_THRESHOLD = '1';
    const service = new SapService(prisma as unknown as PrismaService);
    prisma.sapIntegrationLog.findUnique.mockResolvedValue(null);
    prisma.sapIntegrationLog.upsert.mockImplementation(({ update }) => update);
    (service as any).accessToken = 'cached-token';
    (service as any).tokenExpiresAt = new Date(Date.now() + 60_000);
    const networkError = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(networkError);
    const request = {
      method: 'POST',
      endpoint: '/CustomerMaster',
      payload: '{}',
      entityType: 'TENANT',
      entityId: 'tenant-1',
    };

    await (service as any).callSapApi(request);
    const second = await (service as any).callSapApi(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second.errorMessage).toContain('SAP circuit breaker open');
  });
});
