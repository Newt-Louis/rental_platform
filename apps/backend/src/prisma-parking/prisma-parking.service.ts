import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../node_modules/.prisma/parking-client';

@Injectable()
export class PrismaParkingService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaParkingService.name);
  private connected = false;

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  get isConfigured(): boolean {
    return !!process.env.PARKING_DATABASE_URL;
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
      this.logger.warn('PARKING_DATABASE_URL not set - parking dashboard Prisma client disabled');
      return;
    }

    try {
      await this.$connect();
      this.connected = true;
      this.logger.log('Parking Prisma client connected');
    } catch (err) {
      this.logger.warn(`Parking DB unavailable - parking dashboard integration disabled: ${(err as Error).message}`);
      this.connected = false;
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.$disconnect().catch(() => undefined);
    }
  }
}
