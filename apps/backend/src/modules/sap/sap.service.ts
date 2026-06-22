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
      return this.prisma.sapIntegrationLog.create({
        data: {
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
      include: { tenant: true },
    });
    if (!invoice) throw new Error('Invoice not found');

    const endpoint = '/AccountingDocumentItem';
    const payload = JSON.stringify({
      action: 'CREATE_INVOICE',
      data: {
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.tenantId,
        amount: invoice.totalAmount,
        vatAmount: invoice.vatAmount,
        period: invoice.period,
        dueDate: invoice.dueDate,
      },
    });

    if (!this.enabled) {
      this.logger.warn(`SAP syncInvoice skipped (disabled) for invoice ${invoiceId}`);
      return this.prisma.sapIntegrationLog.create({
        data: {
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
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.SAP_CLIENT_ID ?? '',
        client_secret: process.env.SAP_CLIENT_SECRET ?? '',
      }),
    });

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

  private async callSapApi(opts: {
    method: string;
    endpoint: string;
    payload: string;
    entityType: string;
    entityId: string;
  }): Promise<any> {
    const idempotencyKey = this.idempotencyKey(opts.entityType, opts.entityId, opts.endpoint);
    const existing = await this.prisma.sapIntegrationLog.findFirst({
      where: { idempotencyKey, status: SapStatus.SUCCESS },
    });
    if (existing) return existing;

    const startedAt = Date.now();
    let responseText = '';
    let status: SapStatus = SapStatus.FAILED;

    try {
      const token = await this.getAccessToken();
      const url = `${this.baseUrl}${opts.endpoint}`;

      const response = await fetch(url, {
        method: opts.method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: opts.payload,
        signal: AbortSignal.timeout(15000),
      });

      responseText = await response.text();

      if (!response.ok) {
        throw new Error(`SAP API ${response.status}: ${responseText.substring(0, 300)}`);
      }

      status = SapStatus.SUCCESS;
      this.logger.log(`SAP ${opts.endpoint} success for ${opts.entityType}:${opts.entityId} (${Date.now() - startedAt}ms)`);

      return this.prisma.sapIntegrationLog.create({
        data: {
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

      return this.prisma.sapIntegrationLog.create({
        data: {
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
