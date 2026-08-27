import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../node_modules/.prisma/mssql-client';

@Injectable()
export class PrismaMssqlService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaMssqlService.name);
  private connected = false;

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  get isConfigured(): boolean {
    return process.env.MSSQL_ENABLED === 'true' && !!process.env.MSSQL_DATABASE_URL;
  }

  get isEnabled(): boolean {
    return this.connected;
  }

  async ping(): Promise<boolean> {
    if (!this.connected) return false;
    try {
      await this.$queryRaw`SELECT 1 AS ok`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleInit() {
    if (!this.isConfigured) {
      this.logger.warn('MSSQL_ENABLED/MSSQL_DATABASE_URL not set - external MSSQL Prisma client disabled');
      return;
    }

    try {
      await this.$connect();
      this.connected = true;
      this.logger.log('MSSQL Prisma client connected');
    } catch (err) {
      this.logger.warn(`MSSQL unavailable - external MSSQL integration disabled: ${(err as Error).message}`);
      this.connected = false;
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.$disconnect().catch(() => undefined);
    }
  }
}
