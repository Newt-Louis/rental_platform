import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SapStatus } from '@prisma/client';

@Injectable()
export class SapService {
  private readonly logger = new Logger(SapService.name);
  private readonly baseUrl = process.env.SAP_BASE_URL;
  private readonly enabled = process.env.SAP_ENABLED === 'true';
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private readonly timeoutMs = this.envNumber('SAP_TIMEOUT_MS', 15_000, 100);
  private readonly maxAttempts = this.envNumber('SAP_MAX_ATTEMPTS', 3, 1);
  private readonly retryBaseMs = this.envNumber('SAP_RETRY_BASE_MS', 250, 0);
  private readonly circuitThreshold = this.envNumber('SAP_CIRCUIT_FAILURE_THRESHOLD', 5, 1);
  private readonly circuitCooldownMs = this.envNumber('SAP_CIRCUIT_COOLDOWN_MS', 60_000, 100);

  constructor(private prisma: PrismaService) {
    if (this.enabled) {
      this.logger.log(`SAP integration ENABLED — endpoint: ${this.baseUrl}`);
    } else {
      this.logger.warn('SAP integration DISABLED — set SAP_ENABLED=true and configure SAP_BASE_URL/SAP_CLIENT_ID/SAP_CLIENT_SECRET to enable');
    }
  }

  async getLogs(query: { status?: SapStatus; entityType?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20, ...filters } = query;
    const skip = (page - 1) * +limit;

    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.entityType) where.entityType = filters.entityType;

    const [data, total] = await Promise.all([
      this.prisma.sapIntegrationLog.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sapIntegrationLog.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async syncCustomer(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    const endpoint = '/CustomerMaster';
    const payload = JSON.stringify({
      action: 'CREATE_CUSTOMER',
      data: {
        customerId: tenant.id,
        name: tenant.companyName,
        taxCode: tenant.taxCode,
        contact: tenant.contactEmail,
        address: tenant.address,
      },
    });

    if (!this.enabled) {
      this.logger.warn(`SAP syncCustomer skipped (disabled) for tenant ${tenantId}`);
      const idempotencyKey = this.idempotencyKey('TENANT', tenantId, endpoint);
      return this.prisma.sapIntegrationLog.upsert({
        where: { idempotencyKey },
        update: { payload, status: SapStatus.PENDING, errorMessage: 'SAP integration disabled — queued for when enabled' },
        create: {
          idempotencyKey,
          entityType: 'TENANT',
          entityId: tenantId,
          endpoint,
          payload,
          status: SapStatus.PENDING,
          errorMessage: 'SAP integration disabled — queued for when enabled',
        },
      });
    }

    return this.callSapApi({ method: 'POST', endpoint, payload, entityType: 'TENANT', entityId: tenantId });
  }

  async syncInvoice(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { tenant: true, billingParty: true, lines: true },
    });
    if (!invoice) throw new Error('Invoice not found');
    if (!invoice.issuedAt || ['DRAFT', 'CANCELLED'].includes(invoice.status)) {
      throw new Error('Only issued and active invoices can be synchronized to SAP');
    }

    const endpoint = '/AccountingDocumentItem';
    const payload = JSON.stringify({
      action: 'CREATE_INVOICE',
      data: {
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.tenantId || invoice.billingPartyId,
        customerName: invoice.counterpartyName || invoice.tenant?.companyName || invoice.billingParty?.name,
        taxCode: invoice.counterpartyTaxCode || invoice.tenant?.taxCode || invoice.billingParty?.taxCode,
        mallId: invoice.mallId,
        amount: invoice.totalAmount + invoice.adjustmentAmount,
        vatAmount: invoice.vatAmount,
        period: invoice.period,
        dueDate: invoice.dueDate,
        legalInvoiceNumber: invoice.legalInvoiceNumber,
        lines: invoice.lines.map((line) => ({ description: line.description, quantity: line.qty, unitPrice: line.unitPrice, amount: line.amount })),
      },
    });

    if (!this.enabled) {
      this.logger.warn(`SAP syncInvoice skipped (disabled) for invoice ${invoiceId}`);
      const idempotencyKey = this.idempotencyKey('INVOICE', invoiceId, endpoint);
      return this.prisma.sapIntegrationLog.upsert({
        where: { idempotencyKey },
        update: { payload, status: SapStatus.PENDING, errorMessage: 'SAP integration disabled — queued for when enabled' },
        create: {
          idempotencyKey,
          entityType: 'INVOICE',
          entityId: invoiceId,
          endpoint,
          payload,
          status: SapStatus.PENDING,
          errorMessage: 'SAP integration disabled — queued for when enabled',
        },
      });
    }

    return this.callSapApi({ method: 'POST', endpoint, payload, entityType: 'INVOICE', entityId: invoiceId });
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }

    const tokenUrl = `${this.baseUrl}/oauth/token`;
    const response = await this.fetchWithResilience(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.SAP_CLIENT_ID ?? '',
        client_secret: process.env.SAP_CLIENT_SECRET ?? '',
      }),
    }, 'oauth');

    if (!response.ok) {
      throw new Error(`SAP OAuth failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as any;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
    return this.accessToken!;
  }

  private idempotencyKey(entityType: string, entityId: string, endpoint: string) {
    return `${entityType}:${entityId}:${endpoint}`;
  }

  private envNumber(name: string, fallback: number, minimum: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= minimum ? value : fallback;
  }

  private isTransientStatus(status: number) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  private isTransientError(error: unknown) {
    const candidate = error as NodeJS.ErrnoException;
    return candidate?.name === 'AbortError'
      || candidate?.name === 'TimeoutError'
      || ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT'].includes(candidate?.code ?? '');
  }

  private async delay(ms: number) {
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private assertCircuitClosed() {
    if (this.circuitOpenUntil > Date.now()) {
      throw new Error(`SAP circuit breaker open until ${new Date(this.circuitOpenUntil).toISOString()}`);
    }
    if (this.circuitOpenUntil) {
      this.circuitOpenUntil = 0;
      this.consecutiveFailures = 0;
    }
  }

  private recordSuccess() {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
  }

  private recordFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.circuitThreshold) {
      this.circuitOpenUntil = Date.now() + this.circuitCooldownMs;
      this.logger.warn(`SAP circuit breaker opened for ${this.circuitCooldownMs}ms`);
    }
  }

  private async fetchWithResilience(
    url: string,
    init: RequestInit,
    operation: string,
  ): Promise<Response> {
    this.assertCircuitClosed();
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (response.ok || !this.isTransientStatus(response.status)) {
          this.recordSuccess();
          return response;
        }
        lastError = new Error(`SAP ${operation} transient HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
        if (!this.isTransientError(error)) {
          this.recordFailure();
          throw error;
        }
      } finally {
        clearTimeout(timer);
      }

      if (attempt < this.maxAttempts) {
        await this.delay(this.retryBaseMs * 2 ** (attempt - 1));
      }
    }

    this.recordFailure();
    throw lastError instanceof Error ? lastError : new Error(`SAP ${operation} failed`);
  }

  private async callSapApi(opts: {
    method: string;
    endpoint: string;
    payload: string;
    entityType: string;
    entityId: string;
  }): Promise<any> {
    const idempotencyKey = this.idempotencyKey(opts.entityType, opts.entityId, opts.endpoint);
    const existing = await this.prisma.sapIntegrationLog.findUnique({ where: { idempotencyKey } });
    if (existing?.status === SapStatus.SUCCESS) return existing;

    const startedAt = Date.now();
    let responseText = '';
    let status: SapStatus = SapStatus.FAILED;

    try {
      const token = await this.getAccessToken();
      const url = `${this.baseUrl}${opts.endpoint}`;

      const response = await this.fetchWithResilience(url, {
        method: opts.method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: opts.payload,
      }, opts.endpoint);

      responseText = await response.text();

      if (!response.ok) {
        throw new Error(`SAP API ${response.status}: ${responseText.substring(0, 300)}`);
      }

      status = SapStatus.SUCCESS;
      this.logger.log(`SAP ${opts.endpoint} success for ${opts.entityType}:${opts.entityId} (${Date.now() - startedAt}ms)`);

      return this.prisma.sapIntegrationLog.upsert({
        where: { idempotencyKey },
        update: {
          response: responseText.substring(0, 5000),
          status,
          errorMessage: null,
          payload: opts.payload,
        },
        create: {
          entityType: opts.entityType,
          entityId: opts.entityId,
          endpoint: opts.endpoint,
          payload: opts.payload,
          response: responseText.substring(0, 5000),
          status,
          idempotencyKey,
        },
      });
    } catch (error) {
      this.logger.error(`SAP ${opts.endpoint} failed for ${opts.entityType}:${opts.entityId}: ${error.message}`);

      return this.prisma.sapIntegrationLog.upsert({
        where: { idempotencyKey },
        update: {
          response: responseText.substring(0, 2000) || null,
          status: SapStatus.FAILED,
          errorMessage: error.message.substring(0, 500),
          payload: opts.payload,
        },
        create: {
          entityType: opts.entityType,
          entityId: opts.entityId,
          endpoint: opts.endpoint,
          payload: opts.payload,
          response: responseText.substring(0, 2000) || null,
          status: SapStatus.FAILED,
          errorMessage: error.message.substring(0, 500),
          idempotencyKey,
        },
      });
    }
  }

  async getStats() {
    const [total, byStatus] = await Promise.all([
      this.prisma.sapIntegrationLog.count(),
      this.prisma.sapIntegrationLog.groupBy({ by: ['status'], _count: true }),
    ]);
    return { total, byStatus, enabled: this.enabled, baseUrl: this.enabled ? this.baseUrl : null };
  }

  // Retry tất cả PENDING/FAILED records (có thể gọi từ cron hoặc admin)
  async retryPending() {
    if (!this.enabled) return { message: 'SAP integration disabled', retried: 0 };

    const pending = await this.prisma.sapIntegrationLog.findMany({
      where: { status: { in: [SapStatus.PENDING, SapStatus.FAILED] } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    let retried = 0;
    for (const log of pending) {
      try {
        await this.callSapApi({
          method: 'POST',
          endpoint: log.endpoint,
          payload: log.payload ?? '{}',
          entityType: log.entityType,
          entityId: log.entityId ?? '',
        });
        retried++;
      } catch (e) {
        this.logger.warn(`Retry failed for SAP log ${log.id}: ${e.message}`);
      }
    }

    return { message: `Retried ${retried}/${pending.length} SAP logs`, retried };
  }
}
